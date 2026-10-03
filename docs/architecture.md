# Architecture

## Initial choices

- FastAPI exposes a JSON API under `/api`.
- SQLite stores albums separately from physical copies. A copy has an immutable UUID and a unique mutable inventory number. Identical manually entered album data can be shared; editing a copy's album metadata changes its association rather than silently modifying other copies.
- JavaScript modules and semantic HTML implement the initial UI without a production Node dependency or frontend build step. Feature modules can be introduced as the interface grows.
- Nginx serves the frontend and forwards `/api` to the backend. Browsers use one origin; the backend port is not published by Compose.
- Compose persists SQLite in a named volume. Both base images support ARM64; CI builds ARM64 and AMD64 and checks an AMD64 Compose deployment. Physical Raspberry Pi validation remains outstanding.

## Extension boundaries

Input/output schemas, persistence and API routing are separate modules. Metadata adapters, NFC readers and listening-session services should be added as separate modules. Internet metadata must not overwrite protected manual fields. Provider credentials stay server-side.

Schema version 2 adds Discogs provenance, field protection and freshness metadata. Startup migrates version 1 in place and rejects newer schemas. Covers are stored alongside SQLite. Exact pressing models, NFC associations and listening history are not implemented yet. Future schema changes require explicit migrations and migration tests.

## Current limitations

User authentication, NFC and complete portable backup are not implemented yet. Discogs lookup, confirmed import, local cover storage and freshness refresh are available. Deployment is for a trusted home network. Do not expose this version publicly. Operational backup is required before using it as the sole copy of a real collection.

The full collection is returned in one request, which is appropriate for the initial approximately 300-record collection. Pagination can be added when needed. API search is case-insensitive across artist, album, track title and inventory number.

The Discogs adapter and metadata service are separate from routing and persistence. Metadata credentials are configured server-side. See [integration details](discogs.md).
