from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field, field_validator, model_validator

from .person import ISO_PARTIAL_RE, SAFE_PATH_RE


def _validate_partial_date(value: str) -> str:
    if not value:
        return value
    if not ISO_PARTIAL_RE.match(value):
        raise ValueError("Invalid date format. Use YYYY, YYYY-MM, or YYYY-MM-DD")
    return value


def _validate_media_path(value: str) -> str:
    if not value:
        return value
    if value.startswith("/"):
        raise ValueError("Media paths must be bundle-relative")
    if ".." in value.replace("\\", "/"):
        raise ValueError("Media paths must not contain '..'")
    if not SAFE_PATH_RE.match(value):
        raise ValueError("Media paths contain invalid characters")
    return value


class GlobalEventMedia(BaseModel):
    file: str = ""
    type: str = "photo"
    title: str = ""
    caption: str = ""

    @field_validator("file")
    @classmethod
    def validate_file(cls, value: str) -> str:
        return _validate_media_path(value)


class GlobalEventSource(BaseModel):
    key: str = ""
    title: str = ""
    url: str = ""
    accessed: str = ""
    notes: str = ""

    @field_validator("accessed")
    @classmethod
    def validate_accessed(cls, value: str) -> str:
        if not value:
            return value
        return _validate_partial_date(value)


class GlobalEventRecord(BaseModel):
    title: str
    slug: str = ""
    start_date: str
    end_date: str = ""
    event_type: str = "historical"
    location: str = ""
    story_md: str = ""
    media: List[GlobalEventMedia] = Field(default_factory=list)
    sources: List[GlobalEventSource] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    featured: str = ""
    draft: bool = False

    @field_validator("start_date", "end_date")
    @classmethod
    def validate_dates(cls, value: str) -> str:
        return _validate_partial_date(value)

    @field_validator("featured")
    @classmethod
    def validate_featured(cls, value: str) -> str:
        return _validate_media_path(value)

    @model_validator(mode="after")
    def validate_range(self) -> "GlobalEventRecord":
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        keys = [s.key for s in self.sources if s.key]
        if len(keys) != len(set(keys)):
            raise ValueError("sources.key must be unique within a global event")
        return self
