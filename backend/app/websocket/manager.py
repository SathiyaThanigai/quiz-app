"""WebSocket connection manager for real-time quiz synchronization.

Optimized for 50+ concurrent connections with:
- Concurrent broadcast (asyncio.gather)
- Connection health tracking
- Server-authoritative timer with background tick broadcasting
"""

import asyncio
import json
import time
from typing import Dict, Set, Optional, List
from datetime import datetime

from fastapi import WebSocket


class QuestionTimer:
    """Server-authoritative timer for a quiz question."""

    def __init__(self, session_id: str, question_id: str, duration_seconds: int, on_expire=None):
        self.session_id = session_id
        self.question_id = question_id
        self.duration_seconds = duration_seconds
        self.started_at: float = time.time()
        self.deadline: float = self.started_at + duration_seconds
        self._task: Optional[asyncio.Task] = None
        self._stopped = False
        self._on_expire = on_expire  # async callback called when timer expires naturally

    @property
    def remaining(self) -> int:
        """Seconds remaining, floored to 0."""
        return max(0, int(self.deadline - time.time()))

    @property
    def is_expired(self) -> bool:
        return time.time() >= self.deadline

    @property
    def elapsed(self) -> float:
        return time.time() - self.started_at

    def stop(self):
        """Stop the timer (admin ended question early)."""
        self._stopped = True
        if self._task and not self._task.done():
            self._task.cancel()


class ConnectionManager:
    """Manages WebSocket connections for quiz sessions.

    Optimized for production use with concurrent broadcasts and
    server-authoritative timing.
    """

    def __init__(self):
        # session_id -> set of (websocket, role, identifier)
        self._connections: Dict[str, Set[tuple]] = {}
        # participant_id -> websocket (for direct messaging)
        self._participant_connections: Dict[str, WebSocket] = {}
        # session_id -> set of admin websockets (supports multiple admin devices)
        self._admin_connections: Dict[str, Set[WebSocket]] = {}
        # session_id -> set of display websockets
        self._display_connections: Dict[str, Set[WebSocket]] = {}
        # session_id -> active QuestionTimer
        self._active_timers: Dict[str, QuestionTimer] = {}

    async def connect(
        self,
        websocket: WebSocket,
        session_id: str,
        role: str,
        identifier: str,
    ):
        """Accept and register a WebSocket connection."""
        await websocket.accept()

        if session_id not in self._connections:
            self._connections[session_id] = set()

        self._connections[session_id].add((websocket, role, identifier))

        if role == "participant":
            self._participant_connections[identifier] = websocket
        elif role == "admin":
            if session_id not in self._admin_connections:
                self._admin_connections[session_id] = set()
            self._admin_connections[session_id].add(websocket)
        elif role == "display":
            if session_id not in self._display_connections:
                self._display_connections[session_id] = set()
            self._display_connections[session_id].add(websocket)

    def disconnect(self, websocket: WebSocket, session_id: str, role: str, identifier: str):
        """Remove a WebSocket connection."""
        if session_id in self._connections:
            self._connections[session_id].discard((websocket, role, identifier))
            if not self._connections[session_id]:
                del self._connections[session_id]

        if role == "participant":
            self._participant_connections.pop(identifier, None)
        elif role == "admin":
            if session_id in self._admin_connections:
                self._admin_connections[session_id].discard(websocket)
                if not self._admin_connections[session_id]:
                    del self._admin_connections[session_id]
        elif role == "display":
            if session_id in self._display_connections:
                self._display_connections[session_id].discard(websocket)

    # --- Timer Management ---

    def start_timer(self, session_id: str, question_id: str, duration_seconds: int, on_expire=None) -> QuestionTimer:
        """Start a server-authoritative timer for a question and begin tick broadcasting.
        
        Args:
            on_expire: Optional async callback invoked when timer expires naturally.
                       Used to trigger end_question from the server automatically.
        """
        # Stop any existing timer for this session
        self.stop_timer(session_id)

        timer = QuestionTimer(session_id, question_id, duration_seconds, on_expire=on_expire)
        self._active_timers[session_id] = timer

        # Start background task to broadcast timer ticks
        timer._task = asyncio.create_task(self._broadcast_timer_ticks(session_id, timer))
        return timer

    def stop_timer(self, session_id: str):
        """Stop the active timer for a session."""
        timer = self._active_timers.pop(session_id, None)
        if timer:
            timer.stop()

    def get_timer(self, session_id: str) -> Optional[QuestionTimer]:
        """Get the active timer for a session."""
        return self._active_timers.get(session_id)

    def is_question_active(self, session_id: str) -> bool:
        """Check if a question is currently active (timer running)."""
        timer = self._active_timers.get(session_id)
        return timer is not None and not timer.is_expired and not timer._stopped

    async def _broadcast_timer_ticks(self, session_id: str, timer: QuestionTimer):
        """Background task: broadcast timer remaining every second to all clients."""
        try:
            while not timer._stopped:
                remaining = timer.remaining

                # Broadcast current remaining time
                tick_msg = {
                    "type": "timer_tick",
                    "data": {
                        "remaining": remaining,
                        "question_id": timer.question_id,
                    }
                }
                await self._broadcast_fast(session_id, tick_msg)

                # If we've hit zero, the timer is done
                if remaining <= 0:
                    break

                await asyncio.sleep(1.0)

            # Timer expired naturally (not stopped early by admin)
            if not timer._stopped:
                # Call the on_expire callback to auto-end the question server-side
                if timer._on_expire:
                    try:
                        await timer._on_expire()
                    except Exception as e:
                        print(f"Timer on_expire callback error for session {session_id}: {e}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Timer broadcast error for session {session_id}: {e}")

    # --- Optimized Broadcast Methods ---

    async def _broadcast_fast(self, session_id: str, message: dict):
        """Broadcast to all connections in a session using concurrent sends."""
        if session_id not in self._connections:
            return

        connections = list(self._connections[session_id])
        if not connections:
            return

        # Use gather for concurrent sends to minimize latency
        results = await asyncio.gather(
            *[self._safe_send(ws, message) for ws, _, _ in connections],
            return_exceptions=True,
        )

        # Clean up disconnected
        disconnected = []
        for i, result in enumerate(results):
            if result is True:  # _safe_send returns True on failure
                disconnected.append(connections[i])

        for conn in disconnected:
            self._connections[session_id].discard(conn)

    async def _safe_send(self, ws: WebSocket, message: dict):
        """Send a message to a WebSocket, return True if it failed (disconnected)."""
        try:
            await ws.send_json(message)
            return False
        except Exception:
            return True

    async def send_to_session(self, session_id: str, message: dict, exclude: Optional[WebSocket] = None):
        """Broadcast a message to all connections in a session (concurrent)."""
        if session_id not in self._connections:
            return

        connections = list(self._connections[session_id])
        if not connections:
            return

        tasks = []
        for ws, role, identifier in connections:
            if ws == exclude:
                continue
            tasks.append((ws, role, identifier, self._safe_send(ws, message)))

        if not tasks:
            return

        results = await asyncio.gather(
            *[t[3] for t in tasks],
            return_exceptions=True,
        )

        # Clean up disconnected
        for i, result in enumerate(results):
            if result is True:
                ws, role, identifier = tasks[i][0], tasks[i][1], tasks[i][2]
                self._connections[session_id].discard((ws, role, identifier))
                if role == "participant":
                    self._participant_connections.pop(identifier, None)
                elif role == "admin":
                    if session_id in self._admin_connections:
                        self._admin_connections[session_id].discard(ws)

    async def send_to_participants(self, session_id: str, message: dict):
        """Send a message to all participants in a session (concurrent)."""
        if session_id not in self._connections:
            return

        participant_conns = [
            (ws, role, identifier)
            for ws, role, identifier in self._connections[session_id]
            if role == "participant"
        ]

        if not participant_conns:
            return

        results = await asyncio.gather(
            *[self._safe_send(ws, message) for ws, _, _ in participant_conns],
            return_exceptions=True,
        )

        for i, result in enumerate(results):
            if result is True:
                conn = participant_conns[i]
                self._connections[session_id].discard(conn)
                self._participant_connections.pop(conn[2], None)

    async def send_to_admin(self, session_id: str, message: dict):
        """Send a message to all admin devices for a session (concurrent)."""
        if session_id not in self._admin_connections:
            return

        admins = list(self._admin_connections[session_id])
        if not admins:
            return

        results = await asyncio.gather(
            *[self._safe_send(ws, message) for ws in admins],
            return_exceptions=True,
        )

        for i, result in enumerate(results):
            if result is True:
                self._admin_connections[session_id].discard(admins[i])

    async def send_to_displays(self, session_id: str, message: dict):
        """Send a message to all display screens (concurrent)."""
        if session_id not in self._display_connections:
            return

        displays = list(self._display_connections[session_id])
        if not displays:
            return

        results = await asyncio.gather(
            *[self._safe_send(ws, message) for ws in displays],
            return_exceptions=True,
        )

        for i, result in enumerate(results):
            if result is True:
                self._display_connections[session_id].discard(displays[i])

    async def send_to_participant(self, participant_id: str, message: dict):
        """Send a message to a specific participant."""
        ws = self._participant_connections.get(participant_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                self._participant_connections.pop(participant_id, None)

    def get_participant_count(self, session_id: str) -> int:
        """Get the number of connected participants for a session."""
        if session_id not in self._connections:
            return 0
        return sum(
            1 for _, role, _ in self._connections[session_id] if role == "participant"
        )

    def get_connected_participants(self, session_id: str) -> list:
        """Get list of connected participant identifiers."""
        if session_id not in self._connections:
            return []
        return [
            identifier
            for _, role, identifier in self._connections[session_id]
            if role == "participant"
        ]


# Global connection manager instance
manager = ConnectionManager()
