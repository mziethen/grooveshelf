class SettingsService:
    defaults = {'automatic_refresh': True, 'confirm_import': True, 'show_expired_metadata': False}

    def __init__(self, database):
        self.database = database

    def get(self):
        with self.database.connect() as db:
            stored = {row['key']: bool(row['value']) for row in db.execute('SELECT key, value FROM settings')}
        return {key: stored.get(key, value) for key, value in self.defaults.items()}

    def save(self, values):
        with self.database.connect() as db:
            for key, value in values.items():
                db.execute('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, int(value)))
        return self.get()
