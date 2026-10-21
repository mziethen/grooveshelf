# Run GrooveShelf with Portainer

These instructions target a **Docker Standalone** environment on a 64-bit Linux server (AMD64 or ARM64) inside a trusted home network. Swarm deployment is not configured. The current application has no authentication. Use your server's LAN address and do not publish its port through your router.

## Build on the target server, deploy in Portainer

This works independently of Portainer's support for building Git-based stacks, including environments connected through an Agent. Run these commands over SSH **on the Docker host managed by Portainer**, not on your laptop:

```sh
git clone https://github.com/mziethen/grooveshelf.git
cd grooveshelf
docker build -t grooveshelf-backend:local ./backend
docker build -t grooveshelf-frontend:local ./frontend
```

If the directory already exists, use `git pull --ff-only` inside it before building. Use the account/privileges needed to access Docker on that server. The backend image includes Tesseract; no separate host OCR installation is needed.

In Portainer:

1. Select the **same Docker environment** on which you built the images.
2. Open **Stacks → Add stack**, and name it `grooveshelf`.
3. Choose **Web editor**, and paste [compose.portainer.yaml](../compose.portainer.yaml). Alternatively use the repository method with URL `https://github.com/mziethen/grooveshelf`, reference `refs/heads/main`, and Compose path `compose.portainer.yaml`.
4. Add environment variables `GROOVESHELF_PORT=8080` and your own `DISCOGS_TOKEN`. The token is optional for manual collection management and local image comparison, but needed for Discogs search. Enter it in Portainer, not Git.
5. Choose **Deploy the stack**. Use the existing local images; do not request a registry pull for these `:local` tags. If the UI offers forced image pulling or re-pulling, leave it disabled.

Open `http://SERVER-LAN-IP:8080`. If port 8080 is occupied, choose another host port through `GROOVESHELF_PORT`, for example `8085`, then use that URL. Only the frontend port is exposed; it forwards API requests to the backend internally. Both containers should be running and the backend should become healthy.

Portainer's [stack documentation](https://docs.portainer.io/user/docker/stacks/add) describes its deployment methods and environment variables. Some Portainer/Agent setups have [reported Git build failures](https://github.com/portainer/portainer/issues/13255); the host-build method above avoids depending on that path.

## Alternative: build directly from Git in Portainer

If your Docker Standalone environment supports Git builds, choose **Repository** with the same repository and `refs/heads/main`, but use **Compose path `compose.yaml`**. That file contains `build:` contexts for both images. Supply the same environment variables. If the environment cannot resolve/build the contexts, use the host-build method above. Pasting `compose.yaml` into an empty Web editor does not supply its source directories.

## Data and updates

The named `collection-data` volume holds the database, personal photos and cached covers. Keep the stack name stable so redeployment continues to use the same volume. A fresh deployment starts with an empty collection; your Mac's local database is not copied automatically. Before moving an existing collection, export a ZIP through **Backups → Export current collection** and follow the [validated archive restoration guide](archives.md). Archive restoration creates a new data directory and does not overwrite the live database. Do not simply upload a ZIP into the volume.

Before updates, export a complete archive and keep it outside the server. For the host-built method, pull Git changes and rerun both `docker build` commands, then recreate/redeploy both services in Portainer using the local images. For Git builds, rebuild the images when deploying new source. Never remove the collection volume as part of a routine update. Changing the Discogs token requires recreating/redeploying the backend with the updated environment; a plain container restart does not replace container environment variables.

## Troubleshooting

- **Port already in use:** change `GROOVESHELF_PORT` and redeploy.
- **Local image not found / pull denied:** check that you built the exact tags on the selected Docker host, and that forced pulling is disabled.
- **Backend unhealthy:** inspect its logs in Portainer. Check the persistent volume is writable by UID 10001; the supplied named-volume setup initializes its permissions through the image.
- **Browser blank but backend healthy:** refresh the browser and verify packaged modules with `python3 scripts/check_frontend_modules.py http://SERVER-LAN-IP:8080` from a machine that has the repository and Python.
- **Cannot reach from another device:** check the server LAN address, chosen port, host firewall and network isolation.
