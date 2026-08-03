# Pulse - Real-Time Quiz Application

A real-time quiz web application where an admin hosts live quizzes (multiple choice and type-the-answer) while multiple teams participate simultaneously. The app uses speed-based scoring — faster correct answers earn more points. It features three synchronized screens: Admin Control, Participant View, and a Display/Projector Screen, all connected via WebSockets.

---

## What This App Does

- Admin creates quiz sessions with questions (MCQ or text-input type)
- Participants join via a 6-character session code on their phones/laptops
- Admin controls the quiz live — starting questions, managing timers, revealing answers
- A Display Screen (meant for a projector) shows questions, countdowns, and leaderboards to the audience
- Scoring is automatic and speed-based: first correct answer gets 10 pts, second gets 9, etc.
- Results can be exported as CSV or Excel

---

## Tech Stack & Why Each Was Chosen

### Backend

| Framework / Library | Version | Why |
|---|---|---|
| **FastAPI** | 0.104+ | High-performance async Python web framework with built-in WebSocket support, auto-generated API docs (Swagger/ReDoc), and Pydantic validation |
| **Uvicorn** | 0.24+ | ASGI server that runs FastAPI; supports async I/O needed for WebSocket connections |
| **SQLAlchemy** | 2.0+ | ORM for database models; works with both SQLite (dev) and PostgreSQL (prod) |
| **Pydantic / Pydantic-Settings** | 2.5+ | Request/response validation and environment variable management |
| **python-jose** | 3.3+ | JWT token creation and verification for authentication |
| **passlib[bcrypt]** | 1.7+ | Secure password hashing |
| **pandas + openpyxl** | 2.1+ / 3.1+ | CSV and Excel import/export for questions and results |
| **websockets** | 12.0+ | WebSocket protocol support for real-time communication |
| **SQLite** (dev) / **PostgreSQL** (prod) | — | SQLite for zero-config local development; PostgreSQL for production scalability |

### Frontend

| Framework / Library | Version | Why |
|---|---|---|
| **React** | 18.2 | Component-based UI library for building the three interactive screens |
| **TypeScript** | 5.3 | Type safety across the entire frontend codebase |
| **Vite** | 5.0 | Fast dev server with hot module replacement; instant builds |
| **Tailwind CSS** | 3.4 | Utility-first CSS for rapid UI development without writing custom stylesheets |
| **React Router** | 6.21 | Client-side routing between admin, participant, and display pages |
| **Framer Motion** | 10.18 | Smooth animations for question transitions, timers, and leaderboard reveals |
| **Lucide React** | 0.303 | Consistent icon set used across all interfaces |
| **react-hot-toast** | 2.4 | Lightweight toast notifications for user feedback |
| **clsx** | 2.1 | Conditional className utility |

### Infrastructure

| Tool | Why |
|---|---|
| **Docker & Docker Compose** | Containerized deployment with PostgreSQL, backend, and frontend in one command |
| **PostCSS + Autoprefixer** | CSS processing pipeline required by Tailwind |

---

## Features

- Real-time sync across all devices via WebSockets
- Two question types: Multiple Choice (A/B/C/D) and Type-the-Answer (case-insensitive text matching)
- Speed-based scoring (10, 9, 8, 7, 6, 5 points for ranks 1-6+)
- Per-question leaderboard and final standings with podium animation
- Configurable timer per question (5–300 seconds)
- Image support on questions (upload and display)
- Import questions from CSV/Excel
- Export results as CSV/Excel
- Dark/Light mode
- Mobile-first responsive design
- Session management (create, duplicate, archive, reuse)
- Keyboard shortcuts on admin live control (arrows to navigate, space/enter to start)

---

## Project Structure

```
quiz-app/
├── backend/
│   ├── app/
│   │   ├── api/              # REST endpoints (auth, sessions, questions, export, uploads)
│   │   ├── core/             # Config, database connection, JWT security
│   │   ├── models/           # SQLAlchemy ORM models (User, QuizSession, Question, Response, Participant)
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/         # Scoring engine, export logic
│   │   ├── websocket/        # WebSocket connection manager + event handlers
│   │   └── main.py           # FastAPI app entry point
│   ├── uploads/              # Uploaded question images
│   ├── quiz.db               # SQLite database (auto-created)
│   ├── seed_data.py          # Database initializer
│   ├── migrate_add_question_type.py  # Migration for text question type
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── admin/        # AdminDashboard, SessionManager, QuestionEditor, LiveControl
│   │   │   ├── participant/  # ParticipantLobby, ParticipantQuiz
│   │   │   └── display/      # DisplayEntry, DisplayScreen
│   │   ├── components/       # Shared components (ImageZoom)
│   │   ├── contexts/         # AuthContext, ThemeContext
│   │   ├── services/         # API client, WebSocket service
│   │   └── App.tsx           # Router
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## How to Run

### Prerequisites

- **Python 3.10+** (backend)
- **Node.js 18+** (frontend)
- **Docker** (optional, for containerized setup)

---

### Option 1: Local Development (Recommended for dev)

#### 1. Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Initialize database (creates quiz.db with tables)
python seed_data.py

# Run migration for text question type (if upgrading existing DB)
python migrate_add_question_type.py

# Start the backend server
uvicorn app.main:app --reload --port 8000
```

Backend runs at: **http://localhost:8000**
API docs at: **http://localhost:8000/docs**

#### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend runs at: **http://localhost:5173**

---

### Option 2: Docker Compose (Production-like)

```bash
cd quiz-app

# Start everything (PostgreSQL + Backend + Frontend)
docker-compose up --build

# Services:
# Frontend:  http://localhost:3000
# Backend:   http://localhost:8000
# PostgreSQL: localhost:5432
```

To stop:
```bash
docker-compose down
```

---

## Environment Variables

Create a `.env` file in `backend/` (see `.env.example` at project root):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./quiz.db` | DB connection string |
| `SECRET_KEY` | (change in prod) | JWT signing secret |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Token lifetime |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Allowed frontend origins |

Frontend env vars (set in shell or `.env` in `frontend/`):

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:8000` | Backend API URL |
| `VITE_WS_URL` | `ws://localhost:8000` | WebSocket URL |

---

## How to Use

### 1. Register & Login

- Open http://localhost:5173/register to create an admin account
- Login at http://localhost:5173/login

### 2. Create a Quiz

- Click "New Session" on the dashboard
- Go to Question Editor and add questions:
  - **Multiple Choice**: 4 options (A/B/C/D), select the correct one
  - **Type the Answer**: enter the correct text (participants type their answer, matched case-insensitively)
- Optionally upload images for questions
- Import questions from CSV/Excel

### 3. Run the Quiz

- Open the lobby (participants can now join with the session code)
- Open the **Display Screen** on a projector: `/display/{sessionId}`
- Go to **Live Control** to run the quiz
- Start each question, watch submissions come in, timer auto-ends or end manually
- Leaderboard updates automatically after each question

### 4. Participants Join

- Go to http://localhost:5173/join
- Enter the 6-character session code and a team name
- Answer questions on their phone/laptop in real-time

### 5. Export Results

- After the quiz, export leaderboard and responses as CSV or Excel from the session page

---

## Scoring System

| Rank (by speed) | Points |
|---|---|
| 1st correct | 10 |
| 2nd correct | 9 |
| 3rd correct | 8 |
| 4th correct | 7 |
| 5th correct | 6 |
| 6th+ correct | 5 |
| Wrong / No answer | 0 |

Ties (same response time) get the same rank and points.

**Leaderboard ranking priority**: Total Score > Correct Answers > Average Response Time (fastest wins)

---

## Importing Questions (CSV/Excel)

| Column | Required | Description |
|--------|----------|-------------|
| `question_text` | Yes | The question |
| `question_type` | No | `mcq` (default) or `text` |
| `option_a` | MCQ only | Option A text |
| `option_b` | MCQ only | Option B text |
| `option_c` | MCQ only | Option C text |
| `option_d` | MCQ only | Option D text |
| `correct_answer` | Yes | A/B/C/D for MCQ, or the text answer |
| `difficulty` | No | easy, medium, hard |
| `category` | No | Category name |
| `explanation` | No | Shown after answer reveal |
| `timer_seconds` | No | Default: 20 |

---

## WebSocket Architecture

All real-time communication flows through three WebSocket channels:

| Endpoint | Purpose |
|----------|---------|
| `/ws/admin/{sessionId}?token=JWT` | Admin sends commands (start question, end timer, show leaderboard) |
| `/ws/participant/{sessionId}?participant_id=ID` | Participants receive questions and submit answers |
| `/ws/display/{sessionId}` | Display screen receives all events for projection |

The server broadcasts a `server_time` timestamp with each question start so all clients sync their countdown timers regardless of network latency.

---

## API Documentation

Once the backend is running, visit:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## Production Deployment

1. Set a strong random `SECRET_KEY`
2. Use PostgreSQL: set `DATABASE_URL=postgresql://user:pass@host:5432/dbname`
3. Update `CORS_ORIGINS` with your production frontend domain
4. Build frontend: `cd frontend && npm run build`
5. Serve built files with nginx
6. Run backend: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4`

Or use Docker Compose with production env vars.

---

## License

MIT
