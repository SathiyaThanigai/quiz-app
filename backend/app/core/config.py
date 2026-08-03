from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    DATABASE_URL: str = "sqlite:///./quiz.db"

    # JWT Authentication
    SECRET_KEY: str = "changeme-generate-a-random-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Admin Registration Whitelist
    ADMIN_ALLOWED_EMAILS: str = ""

    # CORS
    CORS_ORIGINS: str = (
    "http://localhost:3000,"
    "http://localhost:5173,"
    "https://quiz-app-git-main-sathiya1.vercel.app,"
    "https://quiz-kkljqe9h4-sathiya1.vercel.app"
     )

    # Environment: "development" or "production"
    ENVIRONMENT: str = "development"

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def admin_allowed_emails_list(self) -> List[str]:
        """Return normalized list of allowed admin emails (lowercased, trimmed)."""
        if not self.ADMIN_ALLOWED_EMAILS.strip():
            return []
        return [
            email.strip().lower()
            for email in self.ADMIN_ALLOWED_EMAILS.split(",")
            if email.strip()
        ]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
