from __future__ import annotations

import re
import uuid
from typing import List

from pydantic import BaseModel, Field, field_validator, model_validator

ISO_PARTIAL_RE = re.compile(r"^\d{4}(-\d{2})?(-\d{2})?$")
SAFE_PATH_RE = re.compile(r"^[a-zA-Z0-9/_\-.]+$")
PERSON_ID_RE = re.compile(r"^[a-f0-9\\-]{36}$")


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


class Names(BaseModel):
    full: str = ""
    given: str = ""
    middle: str = ""
    surname: str = ""
    suffix: str = ""
    maiden: str = ""
    also_known_as: List[str] = Field(default_factory=list)


class Vitals(BaseModel):
    born: str = ""
    died: str = ""
    birth_place: str = ""
    death_place: str = ""
    burial_place: str = ""
    cause_of_death: str = ""

    @field_validator("born", "died")
    @classmethod
    def validate_partial_dates(cls, value: str) -> str:
        return _validate_partial_date(value)


class Parents(BaseModel):
    father: str = ""
    mother: str = ""


class Spouse(BaseModel):
    person: str = ""
    from_: str = Field("", alias="from")
    to: str = ""
    place: str = ""
    notes: str = ""

    @field_validator("from_", "to")
    @classmethod
    def validate_partial_dates(cls, value: str) -> str:
        return _validate_partial_date(value)


class Relations(BaseModel):
    parents: Parents = Field(default_factory=Parents)
    spouses: List[Spouse] = Field(default_factory=list)
    children: List[str] = Field(default_factory=list)
    siblings: List[str] = Field(default_factory=list)


class MediaItem(BaseModel):
    file: str = ""
    type: str = "photo"
    title: str = ""
    caption: str = ""
    date: str = ""
    source_key: str = ""

    @field_validator("file")
    @classmethod
    def validate_file(cls, value: str) -> str:
        return _validate_media_path(value)

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        return _validate_partial_date(value)


class Media(BaseModel):
    featured: str = ""
    gallery: List[MediaItem] = Field(default_factory=list)

    @field_validator("featured")
    @classmethod
    def validate_featured(cls, value: str) -> str:
        return _validate_media_path(value)


class Ids(BaseModel):
    findagrave: str = ""
    familysearch: str = ""
    wikitree: str = ""
    geni: str = ""
    ancestry: str = ""


class Source(BaseModel):
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


class Confidence(BaseModel):
    identity: str = ""
    vitals: str = ""
    parents: str = ""
    notes: str = ""


class Provenance(BaseModel):
    imported_from: str = ""
    wp_slug: str = ""
    wp_type: str = ""


class TimelineMedia(BaseModel):
    file: str = ""
    type: str = "photo"
    title: str = ""
    caption: str = ""

    @field_validator("file")
    @classmethod
    def validate_file(cls, value: str) -> str:
        return _validate_media_path(value)


class TimelineEvent(BaseModel):
    start_date: str = ""
    end_date: str = ""
    title: str = ""
    event_type: str = ""
    location: str = ""
    story_md: str = ""
    media: List[TimelineMedia] = Field(default_factory=list)
    source_refs: List[str] = Field(default_factory=list)
    related_people: List[str] = Field(default_factory=list)
    sort_weight: int = 0

    @field_validator("start_date", "end_date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        return _validate_partial_date(value)


class PersonRecord(BaseModel):
    title: str = ""
    date: str = ""
    draft: bool = False
    person_id: str
    slug: str = ""
    aliases: List[str] = Field(default_factory=list)
    names: Names = Field(default_factory=Names)
    sex: str = "U"
    vitals: Vitals = Field(default_factory=Vitals)
    relations: Relations = Field(default_factory=Relations)
    media: Media = Field(default_factory=Media)
    ids: Ids = Field(default_factory=Ids)
    sources: List[Source] = Field(default_factory=list)
    confidence: Confidence = Field(default_factory=Confidence)
    provenance: Provenance = Field(default_factory=Provenance)
    story_md: str = ""
    timeline: List[TimelineEvent] = Field(default_factory=list)

    @field_validator("person_id")
    @classmethod
    def validate_person_id(cls, value: str) -> str:
        if not value:
            raise ValueError("person_id is required")
        if not PERSON_ID_RE.match(value):
            raise ValueError("person_id contains invalid characters")
        try:
            parsed = uuid.UUID(value)
            if parsed.version != 4:
                raise ValueError("person_id must be UUID4")
        except ValueError:
            raise ValueError("person_id must be UUID4")
        return value

    @field_validator("sex")
    @classmethod
    def validate_sex(cls, value: str) -> str:
        if value not in {"M", "F", "U"}:
            raise ValueError("sex must be M, F, or U")
        return value

    @model_validator(mode="after")
    def validate_sources_unique(self) -> "PersonRecord":
        keys = [s.key for s in self.sources if s.key]
        if len(keys) != len(set(keys)):
            raise ValueError("sources.key must be unique within a record")
        for event in self.timeline:
            if event.start_date and event.end_date and event.end_date < event.start_date:
                raise ValueError("timeline end_date cannot be before start_date")
        return self
