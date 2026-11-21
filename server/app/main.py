from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import router
from .lexicon.api import router as lexicon_router
from .llm.api import router as llm_router
from .settings import settings
from .srs.api import router as srs_router

app = FastAPI(title="Quadernote", version="0.5.0")
app.include_router(router)
app.include_router(lexicon_router)
app.include_router(llm_router)
app.include_router(srs_router)

# Files the browser must re-check on every start, or a phone keeps an old app version forever (M3).
NO_CACHE = {"index.html", "sw.js", "registerSW.js", "manifest.webmanifest"}
MEDIA_TYPES = {".webmanifest": "application/manifest+json"}


def mount_web(app: FastAPI, dist: Path) -> None:
    """Serve the built React app from the same origin, so the phone only needs one address."""
    root = dist.resolve()
    app.mount("/assets", StaticFiles(directory=root / "assets"), name="assets")

    def send(file: Path) -> FileResponse:
        headers = {"Cache-Control": "no-cache"} if file.name in NO_CACHE else None
        return FileResponse(file, media_type=MEDIA_TYPES.get(file.suffix), headers=headers)

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        file = (root / path).resolve()
        if path and file.is_file() and root in file.parents:
            return send(file)
        return send(root / "index.html")


if settings.web_dist.is_dir():
    mount_web(app, settings.web_dist)
