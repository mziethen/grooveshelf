"""Account-bound, explicitly saved mappings; definitions must retain their meaning."""
import json
from .models import SyncFieldMapping
from .sync_fields import FIELDS


def validate_saved_mapping(account, content):
    saved = json.loads(content)
    if not isinstance(saved, dict) or set(saved) != {'mapping', 'definitions'}:
        raise ValueError('Invalid saved Discogs mapping.')
    mapping = SyncFieldMapping.model_validate(saved['mapping'])
    if mapping.account_id != account:
        raise ValueError('Saved Discogs mapping belongs to another account.')
    definitions = saved['definitions']
    if not isinstance(definitions, dict) or set(definitions) != {name for name in FIELDS if getattr(mapping, name) is not None}:
        raise ValueError('Invalid saved Discogs field definitions.')
    from .sync_fields import field_definitions
    for name, definition in definitions.items():
        parsed = field_definitions({'fields': [definition]})
        if parsed.get(getattr(mapping, name)) != definition:
            raise ValueError('Invalid saved Discogs field definition.')
    return saved
