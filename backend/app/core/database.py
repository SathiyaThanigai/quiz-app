import os
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool, QueuePool

from app.core.config import settings

# Resolve SQLite relative paths to absolute (prevents different DBs per working directory)
database_url = settings.DATABASE_URL
if database_url.startswith("sqlite:///./") or database_url.startswith("sqlite:///quiz"):
    db_filename = database_url.replace("sqlite:///./", "").replace("sqlite:///", "")
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    db_path = os.path.join(backend_dir, db_filename)
    database_url = f"sqlite:///{db_path}"

# Configure engine based on database type
connect_args = {}
engine_kwargs = {}

if database_url.startswith("sqlite"):
    # SQLite: use WAL mode for concurrent reads/writes, increase busy timeout
    connect_args = {"check_same_thread": False, "timeout": 30}
    # StaticPool for SQLite ensures single connection with thread safety
    # For production with 50+ users, PostgreSQL is recommended
    engine_kwargs = {
        "pool_pre_ping": True,
    }
else:
    # PostgreSQL: proper connection pooling for production
    engine_kwargs = {
        "pool_size": 20,
        "max_overflow": 30,
        "pool_timeout": 30,
        "pool_recycle": 1800,
        "pool_pre_ping": True,
    }

engine = create_engine(database_url, connect_args=connect_args, **engine_kwargs)

# Enable WAL mode for SQLite (allows concurrent reads during writes)
if database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA cache_size=-64000")  # 64MB cache
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
