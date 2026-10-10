// Keep workflows sequential: they share one disposable backend database.
const {spawnSync} = require('node:child_process');
const {join} = require('node:path');
const workflows = [
  'browser', 'discogs', 'listening', 'heartbeat', 'covers', 'sync',
  'personal', 'wishlist', 'capture', 'collection-tools', 'discovery',
  'statistics', 'identifiers', 'labels', 'settings', 'locations',
  'archive', 'appearance', 'bulk', 'qr', 'exports', 'streaming', 'tracks', 'credits', 'pressings', 'usability', 'retention', 'reader-feedback', 'corrections', 'photos', 'release-notes', 'workspace', 'browsing', 'startup', 'sync-review', 'sync-accounts', 'sync-ratings', 'sync-personal', 'backups', 'backup-inspection',
];
for (const workflow of workflows) {
  const result = spawnSync(process.execPath, [join(__dirname, `${workflow}.cjs`)], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) console.error(result.error);
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`${workflows.length} browser workflows passed.`);
