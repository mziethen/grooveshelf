from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, Query, Response
from .database import Database
from .models import Record, RecordInput
from .repository import CollectionRepository


def create_app(database_path=None):
    database = Database(database_path or os.getenv("GROOVESHELF_DATABASE", "data/grooveshelf.sqlite3"))
    repository = CollectionRepository(database)

    @asynccontextmanager
    async def lifespan(app):
        database.initialize()
        yield

    app = FastAPI(title="GrooveShelf", version="0.1.0", lifespan=lifespan)

    @app.get("/api/health")
    def health():
        with database.connect() as db:
            db.execute("SELECT 1")
        return {"status": "ok"}

    @app.get("/api/records", response_model=list[Record])
    def list_records(q: str = Query(default="", max_length=300)):
        return repository.list(q)

    @app.get("/api/records/{record_id}", response_model=Record)
    def get_record(record_id: str):
        return repository.get(record_id)

    @app.post("/api/records", response_model=Record, status_code=201)
    def create_record(data: RecordInput):
        return repository.save(data)

    @app.put("/api/records/{record_id}", response_model=Record)
    def update_record(record_id: str, data: RecordInput):
        return repository.save(data, record_id)

    @app.delete("/api/records/{record_id}", status_code=204)
    def delete_record(record_id: str):
        repository.delete(record_id)
        return Response(status_code=204)

    return app


app = create_app()
