from typing import Literal
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator, model_serializer


class Credit(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=300)
    role: str = Field(min_length=1, max_length=500)
    tracks: str = Field(default="", max_length=1000)


class Track(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    position: str = Field(default="", max_length=20)
    title: str = Field(min_length=1, max_length=300)
    duration: str = Field(default="", max_length=10,
                          pattern=r"^$|^[0-9]{1,3}:[0-5][0-9]$|^[0-9]{1,2}:[0-5][0-9]:[0-5][0-9]$")

    @model_serializer(mode="wrap")
    def serialize_track(self, handler):
        result = handler(self)
        if not self.duration:
            result.pop('duration', None)
        return result


Condition = Literal["M", "NM", "VG+", "VG", "G+", "G", "F", "P"]
SleeveCondition = Literal["M", "NM", "VG+", "VG", "G+", "G", "F", "P", "Generic", "No Cover"]


class PersonalFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    storage_location: str = Field(default="", max_length=200)
    rating: int | None = Field(default=None, ge=1, le=5, strict=True)
    media_condition: Condition | None = None
    sleeve_condition: SleeveCondition | None = None
    notes: str = Field(default="", max_length=10000)


class RecordInput(PersonalFields):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    inventory_number: str = Field(pattern=r"^LP-[0-9]{5}$")
    artist: str = Field(min_length=1, max_length=300)
    title: str = Field(min_length=1, max_length=300)
    format: Literal["LP", "EP", "Single", "Maxi", "Box set", "Other"] = "LP"
    year: int | None = Field(default=None, ge=1900, le=2100)
    tracks: list[Track] = Field(default_factory=list, max_length=300)
    notes: str = Field(default="", max_length=10000)
    album_id: str | None = None
    discogs_master_id: int | None = Field(default=None, ge=1)
    discogs_release_id: int | None = Field(default=None, ge=1)
    cover_image_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")

    @field_validator("inventory_number")
    @classmethod
    def valid_number(cls, value):
        if value == "LP-00000":
            raise ValueError("Inventory numbers start at LP-00001")
        return value

    @field_validator("artist", "title")
    @classmethod
    def non_blank(cls, value):
        if not value.strip():
            raise ValueError("This field must not be blank")
        return value


class Record(RecordInput):
    id: str
    album_id: str
    created_at: str
    cover_url: str | None = None
    cover_selection_status: str = "default"
    source_url: str | None = None
    source_name: str | None = None
    reference_release_url: str | None = None
    genres: list[str] = Field(default_factory=list)
    styles: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    description: str = ""
    credits: list[Credit] = Field(default_factory=list, max_length=300)
    credits_source_url: str | None = None
    metadata_status: str = "manual"
    metadata_expires_at: float | None = None
    protected_fields: list[str] = Field(default_factory=list)
    favorite: bool = False
    play_count: int = 0
    last_played_at: str | None = None
    nfc_uid: str | None = None


class TagAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    copy_id: str
    replace: bool = False


class ScanInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    uid: str


class PlayInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    played_at: datetime

    @field_validator("played_at")
    @classmethod
    def aware_time(cls, value):
        if value.tzinfo is None:
            raise ValueError("Use a timestamp with a timezone")
        return value


class FavoriteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    favorite: bool


class ReaderStatusInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["connected", "disconnected", "error", "simulation"]


class CoverSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    image_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")


class ReleaseLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    release_id: int = Field(ge=1)


class SyncAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan_id: str
    action_id: str
    choice: Literal["import", "export", "link"]
    copy_id: str | None = None


class ExportRetry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    checked_discogs: Literal[True]


class WishInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    artist: str = Field(min_length=1, max_length=300)
    title: str = Field(min_length=1, max_length=300)
    notes: str = Field(default="", max_length=10000)
    discogs_master_id: int | None = Field(default=None, ge=1)


class Wish(WishInput):
    id: str
    created_at: str
    updated_at: str
    source_url: str | None = None


class CaptureQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    artist: str = Field(default="", max_length=300)
    title: str = Field(default="", max_length=300)
    discogs_master_id: int | None = Field(default=None, ge=1)
    discogs_release_id: int | None = Field(default=None, ge=1)
    exclude_id: str | None = Field(default=None, max_length=100)


class MetadataSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    automatic_refresh: bool
    confirm_import: bool


class BulkPersonalChanges(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    storage_location: str | None = Field(default=None, max_length=200)
    rating: int | None = Field(default=None, ge=1, le=5)
    media_condition: Condition | None = None
    sleeve_condition: SleeveCondition | None = None
    favorite: bool | None = None

    @model_validator(mode="after")
    def valid_changes(self):
        if not self.model_fields_set:
            raise ValueError("Choose at least one field to change")
        for field in ["storage_location", "favorite"]:
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class BulkPersonalInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    record_ids: list[str] = Field(min_length=1, max_length=500)
    changes: BulkPersonalChanges

    @field_validator("record_ids")
    @classmethod
    def distinct_ids(cls, values):
        if any(not value or len(value) > 100 for value in values):
            raise ValueError("Invalid record ID")
        if len(set(values)) != len(values):
            raise ValueError("Select each record only once")
        return values
