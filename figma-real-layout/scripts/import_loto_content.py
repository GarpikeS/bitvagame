"""Import the public LotoDoma catalog and printable blanks from Yandex Disk.

The song media stays on the public disk and is resolved by the frontend on
demand. Printable blanks are extracted into the site because purchased packs
must remain stable and downloadable without exposing the 150-page source PDF.
"""

from __future__ import annotations

import json
import re
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

from pypdf import PdfReader, PdfWriter


PUBLIC_KEY = "https://disk.yandex.ru/d/5Ch7zpuhfTzXUg"
RESOURCE_API = "https://cloud-api.yandex.net/v1/disk/public/resources"
DOWNLOAD_API = f"{RESOURCE_API}/download"
TRACK_LIMIT = 60
BLANK_LIMIT = 30
FIRST_BLANK_PAGE = 2  # zero-based: PDF pages 1–2 are service/template pages

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = ROOT / "public" / "loto"

CATEGORIES = {
    "Девичник": {
        "disk": "девичник",
        "slug": "devichnik",
        "pdf": "лотодома девичник.pdf",
        "figma": "https://www.figma.com/design/67iWQ2xCePE45Bnop6TLCh/лотодома-девичник",
    },
    "Хиты 90-х": {
        "disk": "90е",
        "slug": "hits-90",
        "pdf": "лотодома 90е.pdf",
        "figma": "https://www.figma.com/design/L9vKUhV7ka3emYVZdOVHl3/лотодома-90е",
    },
    "Хиты 2000-х": {
        "disk": "2000е",
        "slug": "hits-2000",
        "pdf": "лотодома 2000е.pdf",
        "figma": "https://www.figma.com/design/H6v0SnLWZB3x1GCDsdvwlQ/лотодома-2000е",
    },
    "Хиты караоке": {
        "disk": "Хиты караоке",
        "slug": "karaoke",
        "pdf": "лотодома хиты караоке.pdf",
        "figma": "https://www.figma.com/design/ihbpsJ7mT085ichvqqTLmH/лотодома-хиты-караоке",
    },
}


def api_json(endpoint: str, **params: object) -> dict:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{endpoint}?{query}",
        headers={"User-Agent": "BitvaIgr-LotoImporter/1.0"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def list_files(path: str) -> list[dict]:
    payload = api_json(
        RESOURCE_API,
        public_key=PUBLIC_KEY,
        path=path,
        limit=1000,
    )
    return [item for item in payload.get("_embedded", {}).get("items", []) if item.get("type") == "file"]


def numbered_files(items: list[dict]) -> dict[int, dict]:
    result: dict[int, dict] = {}
    for item in items:
        match = re.match(r"^(\d+)\s+", str(item.get("name", "")))
        if match:
            result[int(match.group(1))] = item
    return result


def song_label(filename: str) -> tuple[str, str]:
    stem = Path(filename).stem
    stem = re.sub(r"^\d+\s+", "", stem)
    if " - " not in stem:
        return stem, stem
    artist, title = stem.split(" - ", 1)
    return artist.strip(), title.strip()


def build_song_catalog() -> dict[str, dict]:
    catalog: dict[str, dict] = {}
    for category, config in CATEGORIES.items():
        disk = config["disk"]
        audio = numbered_files(list_files(f"/{disk}/музыка"))
        square = numbered_files(list_files(f"/{disk}/картинки квадрат"))
        album = numbered_files(list_files(f"/{disk}/картинки альбомные"))
        missing = [
            number
            for number in range(1, TRACK_LIMIT + 1)
            if number not in audio or number not in square or number not in album
        ]
        if missing:
            raise RuntimeError(f"{category}: missing media for tracks {missing}")

        songs = []
        for number in range(1, TRACK_LIMIT + 1):
            artist, title = song_label(audio[number]["name"])
            songs.append(
                {
                    "number": number,
                    "artist": artist,
                    "title": title,
                    "listTitle": f"{artist} — {title}",
                    "audioPath": audio[number]["path"],
                    "squarePath": square[number]["path"],
                    "albumPath": album[number]["path"],
                }
            )

        catalog[category] = {
            "slug": config["slug"],
            "diskFolder": disk,
            "figma": config["figma"],
            "songs": songs,
        }
        print(f"catalog: {category}: {len(songs)} songs")
    return catalog


def download_public_file(path: str, destination: Path) -> None:
    payload = api_json(DOWNLOAD_API, public_key=PUBLIC_KEY, path=path)
    href = payload.get("href")
    if not href:
        raise RuntimeError(f"No download URL for {path}")
    request = urllib.request.Request(href, headers={"User-Agent": "BitvaIgr-LotoImporter/1.0"})
    with urllib.request.urlopen(request, timeout=300) as response, destination.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)


def extract_blank_pages(category: str, config: dict) -> list[str]:
    output_dir = PUBLIC_ROOT / "blanks" / config["slug"]
    output_dir.mkdir(parents=True, exist_ok=True)
    source_path = Path(tempfile.gettempdir()) / f"loto-{config['slug']}-source.pdf"
    disk_path = f"/{config['disk']}/{config['pdf']}"

    print(f"download: {category}: {disk_path}")
    try:
        download_public_file(disk_path, source_path)
        reader = PdfReader(source_path)
        last_page = FIRST_BLANK_PAGE + BLANK_LIMIT
        if len(reader.pages) < last_page:
            raise RuntimeError(f"{category}: expected at least {last_page} PDF pages, got {len(reader.pages)}")

        files = []
        for blank_index in range(BLANK_LIMIT):
            filename = f"blank-{blank_index + 1:02}.pdf"
            destination = output_dir / filename
            writer = PdfWriter()
            writer.add_page(reader.pages[FIRST_BLANK_PAGE + blank_index])
            with destination.open("wb") as output:
                writer.write(output)
            files.append(f"/loto/blanks/{config['slug']}/{filename}")
        print(f"blanks: {category}: {len(files)} pages")
        return files
    finally:
        source_path.unlink(missing_ok=True)


def main() -> None:
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    catalog = build_song_catalog()
    for category, config in CATEGORIES.items():
        catalog[category]["blanks"] = extract_blank_pages(category, config)

    output_path = PUBLIC_ROOT / "catalog.json"
    output_path.write_text(
        json.dumps(
            {
                "source": PUBLIC_KEY,
                "trackLimit": TRACK_LIMIT,
                "blankLimit": BLANK_LIMIT,
                "categories": catalog,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"written: {output_path}")


if __name__ == "__main__":
    main()
