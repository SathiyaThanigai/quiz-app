"""WebSocket connection manager for real-time quiz synchronization."""

import json
from typing import Dict, Set, Optional
from datetime import datetime

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections for quiz sessions."""

    def __init__(self):
        # session_id -> set of (websocket, role, identifier)
        # role: "admin", "participant", "display"
        self._connections: Dict[str, Set[tuple]] = {}
        # participant_id -> websocket (for direct messaging)
        self._participant_connections: Dict[str, WebSocket] = {}
        # session_id -> admin websocket
        self._admin_connections: Dict[str, WebSocket] = {}
        # session_id -> set of display websockets
        self._display_connections: Dict[str, Set[WebSocket]] = {}

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
            self._admin_connections[session_id] = websocket
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
            self._admin_connections.pop(session_id, None)
        elif role == "display":
            if session_id in self._display_connections:
                self._display_connections[session_id].discard(websocket)

    async def send_to_session(self, session_id: str, message: dict, exclude: Optional[WebSocket] = None):
        """Broadcast a message to all connections in a session."""
        if session_id not in self._connections:
            return

        disconnected = set()
        for ws, role, identifier in self._connections[session_id]:
            if ws == exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.add((ws, role, identifier))

        # Clean up disconnected
        for conn in disconnected:
            self._connections[session_id].discard(conn)

    async def send_to_participants(self, session_id: str, message: dict):
        """Send a message to all participants in a session."""
        if session_id not in self._connections:
            return

        disconnected = set()
        for ws, role, identifier in self._connections[session_id]:
            if role != "participant":
                continue
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.add((ws, role, identifier))

        for conn in disconnected:
            self._connections[session_id].discard(conn)

    async def send_to_admin(self, session_id: str, message: dict):
        """Send a message to the admin of a session."""
        ws = self._admin_connections.get(session_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                self._admin_connections.pop(session_id, None)

    async def send_to_displays(self, session_id: str, message: dict):
        """Send a message to all display screens for a session."""
        if session_id not in self._display_connections:
            return

        disconnected = set()
        for ws in self._display_connections[session_id]:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.add(ws)

        for ws in disconnected:
            self._display_connections[session_id].discard(ws)

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
