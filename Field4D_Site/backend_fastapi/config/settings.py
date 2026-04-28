import os
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices
from pydantic import Field as PydField
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BASE_DIR / ".env"


def resolve_env_file() -> str:
    # Cloud Run can mount a Secret Manager file and point to it with ENV_FILE_PATH.
    env_file_path = os.getenv("ENV_FILE_PATH")
    if env_file_path and env_file_path.strip():
        return env_file_path.strip()
    return str(ENV_FILE)


class Settings(BaseSettings):
    google_cloud_project: str = PydField(
        default="iucc-f4d",
        validation_alias=AliasChoices("GOOGLE_CLOUD_PROJECT", "GCP_PROJECT_ID"),
    )
    auth_url: str | None = PydField(
        default=None,
        validation_alias=AliasChoices("AUTH_URL", "GCP_AUTH_URL"),
    )
    gcp_auth_url: str | None = PydField(
        default=None,
        validation_alias=AliasChoices("GCP_AUTH_URL"),
    )
    analytics_url: str | None = PydField(
        default=None,
        validation_alias=AliasChoices("ANALYTICS_URL", "GCP_ANALYTICS_URL"),
    )
    gcp_analytics_url: str | None = PydField(
        default=None,
        validation_alias=AliasChoices("GCP_ANALYTICS_URL"),
    )
    access_manager_url: str | None = PydField(
        default="https://f4d-user-access-manager-1000435921680.europe-west1.run.app",
        validation_alias=AliasChoices("ACCESS_MANAGER_URL"),
    )
    cors_allow_origins: str | None = PydField(
        default="http://localhost:5173",
        validation_alias=AliasChoices("CORS_ALLOW_ORIGINS"),
    )

    sensors_data_table: str = "iucc-f4d.Field4D.F4D_sensors_data"
    permissions_table: str = "iucc-f4d.Field4D.F4D_permissions"
    mac_to_device_table: str = "iucc-f4d.Field4D.F4D_mac_to_device"
    user_table: str = "iucc-f4d.Field4D.F4D_user_table"

    @field_validator(
        "google_cloud_project",
        "auth_url",
        "gcp_auth_url",
        "analytics_url",
        "gcp_analytics_url",
        "access_manager_url",
        "cors_allow_origins",
        mode="before",
    )
    @classmethod
    def strip_string_values(cls, value: str | None) -> str | None:
        if isinstance(value, str):
            return value.strip()
        return value

    model_config = SettingsConfigDict(
        env_file=resolve_env_file(),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
