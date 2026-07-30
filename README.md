# QuizMaster - Real-Time Quiz & Speed-Based Leaderboard

A production-ready real-time quiz web application where an administrator hosts live multiple-choice quizzes while multiple teams participate simultaneously. The app prioritizes speed and accuracy, automatically ranking participants based on how quickly they submit correct answers.

## Features

- **Real-Time Synchronization** - WebSocket-powered instant updates across all connected devices
- **Speed-Based Scoring** - Faster correct answers earn more points (10, 9, 8, 7, 6, 5 for subsequent ranks)
- **Three Interfaces** - Admin Dashboard, Participant View, and Public Display/Projector Screen
- **Individual Timers** - Each question has its own configurable countdown timer
- **Live Leaderboard** - Auto-updating rankings based on score, correct answers, and speed
- **Dark/Light Mode** - Full theme support across all interfaces
- **Mobile-First** - Responsive design works on all devices
- **Import/Export** - CSV and Excel support for questions and results
- **Session Management** - Create, save, duplicate, archive, and reuse quiz sessions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS, Framer Motion |
| Backend | FastAPI (Python), SQLAlchemy |
| Database | PostgreSQL (production) / SQLite (development) |
| Real-Time | WebSockets |
| Auth | JWT (JSON Web Tokens) |
| Deployment | Docker & Docker Compose |

## Quick Start

### Prerequisites

- Python 3.10+ (backend)
- Node.js 18+ (frontend)
- Docker & Docker Compose (optional, for containerized setup)

### Option 1: Docker (Recommended)

```bash
cd quiz-app

# Start all services
docker-compose up --build

# The app will be available at:
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Option 2: Local Development

#### Backend Setup

```bash
cd quiz-app/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Seed database with sample data
python seed_data.py

# Start the server
uvicorn app.main:app --reload --port 8000
```

#### Frontend Setup

```bash
cd quiz-app/frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:3000` and the backend at `http://localhost:8000`.

## Default Credentials

After running the seed script:

- **Admin Login**: `admin` / `admin123`
- **API Documentation**: http://localhost:8000/docs

## How It Works

### 1. Admin Creates a Quiz

1. Log in at `/login`
2. Create a new session from the dashboard
3. Add questions (manually or import from CSV/Excel)
4. Configure individual timers per question

### 2. Open the Lobby

1. Click "Open Lobby" to allow participants to join
2. Share the 6-character session code with participants
3. Optionally open the Display Screen (`/display/{sessionId}`) on a projector

### 3. Participants Join

1. Navigate to `/join` (or the root URL)
2. Enter the session code and team name
3. Wait in the lobby until the admin starts

### 4. Run the Quiz

1. Admin clicks "Start Quiz" to begin
2. For each question:
   - Admin clicks "Start Question" to show it to everyone
   - Timer counts down, participants submit answers
   - Admin can end the timer early or wait for it to expire
   - Admin reveals the correct answer
   - Admin shows the leaderboard
   - Admin moves to the next question

### 5. View Results

- Real-time leaderboard updates after each question
- Export results as CSV or Excel when the quiz ends
- Archive completed sessions for later reference

## Scoring System

| Submission Rank | Points Awarded |
|----------------|---------------|
| 1st correct | 10 points |
| 2nd correct | 9 points |
| 3rd correct | 8 points |
| 4th correct | 7 points |
| 5th correct | 6 points |
| 6th+ correct | 5 points |
| Wrong/No answer | 0 points |

Ties (identical response times) receive the same score.

### Leaderboard Ranking Priority

1. Total Score (highest first)
2. Correct Answers (most first)
3. Average Response Time (fastest first)

## Project Structure

```
quiz-app/
├── backend/
│   ├── app/
│   │   ├── api/           # REST API endpoints
│   │   │   ├── auth.py    # Authentication routes
│   │   │   ├── sessions.py # Session management
│   │   │   ├── questions.py # Question CRUD
│   │   │   ├── export.py  # Export & scoring endpoints
│   │   │   └── deps.py    # Dependencies (auth guards)
│   │   ├── core/          # Configuration & security
│   │   │   ├── config.py  # Settings from env vars
│   │   │   ├── database.py # DB connection
│   │   │   └── security.py # JWT & password hashing
│   │   ├── models/        # SQLAlchemy ORM models
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── services/      # Business logic
│   │   │   ├── scoring.py # Speed-based scoring engine
│   │   │   └── export.py  # CSV/Excel export
│   │   ├── websocket/     # Real-time communication
│   │   │   ├── manager.py # Connection manager
│   │   │   └── handlers.py # WebSocket event handlers
│   │   └── main.py        # FastAPI app entry point
│   ├── seed_data.py       # Database seeder
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── admin/     # Admin dashboard, session manager, question editor, live control
│   │   │   ├── participant/ # Lobby and quiz interface
│   │   │   └── display/   # Public projector screen
│   │   ├── contexts/      # React contexts (auth, theme)
│   │   ├── services/      # API client & WebSocket service
│   │   └── App.tsx        # Router configuration
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── sample_questions.csv    # Sample import file
└── README.md
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register admin account |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions/` | List all sessions |
| POST | `/api/sessions/` | Create session |
| GET | `/api/sessions/{id}` | Get session details |
| PUT | `/api/sessions/{id}` | Update session |
| DELETE | `/api/sessions/{id}` | Delete session |
| POST | `/api/sessions/{id}/duplicate` | Duplicate session |
| POST | `/api/sessions/{id}/open-lobby` | Open lobby |
| POST | `/api/sessions/{id}/start` | Start quiz |
| POST | `/api/sessions/{id}/pause` | Pause quiz |
| POST | `/api/sessions/{id}/resume` | Resume quiz |
| POST | `/api/sessions/{id}/end` | End quiz |
| POST | `/api/sessions/join` | Join as participant |

### Questions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions/{id}/questions/` | List questions |
| POST | `/api/sessions/{id}/questions/` | Create question |
| PUT | `/api/sessions/{id}/questions/{qid}` | Update question |
| DELETE | `/api/sessions/{id}/questions/{qid}` | Delete question |
| POST | `/api/sessions/{id}/questions/{qid}/duplicate` | Duplicate question |
| POST | `/api/sessions/{id}/questions/import` | Import from file |

### Export & Scoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions/{id}/leaderboard` | Get leaderboard |
| GET | `/api/sessions/{id}/export/csv` | Export CSV |
| GET | `/api/sessions/{id}/export/excel` | Export Excel |
| POST | `/api/sessions/{id}/adjust-score` | Manual score adjust |
| GET | `/api/sessions/{id}/participants` | List participants |

### WebSocket Endpoints
| Endpoint | Description |
|----------|-------------|
| `ws://host/ws/admin/{sessionId}?token=JWT` | Admin control channel |
| `ws://host/ws/participant/{sessionId}?participant_id=ID` | Participant channel |
| `ws://host/ws/display/{sessionId}` | Public display channel |

## Importing Questions

Questions can be imported from CSV or Excel files with these columns:

| Column | Required | Description |
|--------|----------|-------------|
| question_text | Yes | The question |
| option_a | Yes | Option A text |
| option_b | Yes | Option B text |
| option_c | Yes | Option C text |
| option_d | Yes | Option D text |
| correct_answer | Yes | A, B, C, or D |
| difficulty | No | easy, medium, hard |
| category | No | Category name |
| explanation | No | Answer explanation |
| timer_seconds | No | Timer (default: 20) |

A sample file is included at `sample_questions.csv`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | sqlite:///./quiz.db | Database connection string |
| SECRET_KEY | (change this) | JWT signing secret |
| ALGORITHM | HS256 | JWT algorithm |
| ACCESS_TOKEN_EXPIRE_MINUTES | 480 | Token expiration |
| CORS_ORIGINS | localhost:3000,5173 | Allowed CORS origins |
| VITE_API_URL | http://localhost:8000 | Backend API URL |
| VITE_WS_URL | ws://localhost:8000 | WebSocket URL |

## Production Deployment

1. Update `SECRET_KEY` to a strong random value
2. Set `DATABASE_URL` to your PostgreSQL instance
3. Update `CORS_ORIGINS` with your frontend domain
4. Build the frontend: `cd frontend && npm run build`
5. Serve the built frontend with nginx or similar
6. Run the backend with a production server: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4`

Or use Docker Compose:

```bash
# Set production environment variables
export SECRET_KEY=$(openssl rand -hex 32)

# Build and run
docker-compose up --build -d
```

## License

MIT
