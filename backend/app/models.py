from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Track(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    position: str = Field(default="", max_length=20)
    title: str = Field(min_length=1, max_length=300)


class RecordInput(BaseModel):
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
    source_url: str | None = None
    source_name: str | None = None
    genres: list[str] = Field(default_factory=list)
    styles: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    description: str = ""
    metadata_status: str = "manual"
    metadata_expires_at: float | None = None
    protected_fields: list[str] = Field(default_factory=list)
