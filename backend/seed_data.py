"""Initialize the database tables."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import engine, Base
from app.models import *  # noqa - import all models to register them


def init_database():
    """Create all database tables."""
    Base.metadata.create_all(bind=engine)
    print("Database initialized. Register your admin account at /register")


if __name__ == "__main__":
    init_database()
