import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import zipfile

import gdown

REPO = os.environ["GITHUB_REPOSITORY"]
TAG = "templates-online-v1"
ROOT = Path(os.environ["RUNNER_TEMP"]) / TAG
BASE = f"https://github.com/{REPO}/releases/download/{TAG}"
CATEGORIES = {
    "cyber-template": ("Cyber Templates", "قوالب سايبر"),
    "green-lime-scene": ("Green Lime", "غرين لايم"),
    "hook-title": ("Hook Titles", "عناوين هوك"),
    "instagram-reel-scene": ("Instagram Reels", "ريلز إنستغرام"),
    "trendy-scene": ("Trendy Scenes", "مشاهد ترندي"),
}


def run(*args):
    return subprocess.run(args, check=True)


def download(source, path):
    for attempt in range(4):
        try:
            gdown.download(id=source["id"], output=str(path), quiet=True)
            if path.stat().st_size == source["size"]:
                return
            raise ValueError("Unexpected byte count")
        except (OSError, ValueError, RuntimeError, gdown.exceptions.FileURLRetrievalError):
            path.unlink(missing_ok=True)
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def build(source):
    slug = source["slug"]
    key, number = slug.rsplit("-", 1)
    category, category_ar = CATEGORIES[key]
    work = ROOT / slug
    work.mkdir()
    project = work / "item.aep"
    download(source["project"], project)
    preview = work / "preview.mov"
    download(source["preview"], preview)
    comp = work / "comp-name.txt"
    download(source["comp"], comp)
    main_comp = comp.read_text(encoding="utf-8-sig").strip()
    if not main_comp:
        raise ValueError(f"Missing composition name for {slug}")
    media_files = []
    for item in source["media"]:
        name = item["name"]
        if Path(name).name != name or "\\" in name or name in (".", ".."):
            raise ValueError(f"Invalid asset name for {slug}")
        asset = work / "media" / name
        asset.parent.mkdir(exist_ok=True)
        download(item, asset)
        media_files.append(asset)
    out = ROOT / "release"
    video = out / f"{slug}.mp4"
    poster = out / f"{slug}.jpg"
    package = out / f"{slug}.zip"
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(preview),
        "-an", "-vf", "scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-threads", "2",
        "-movflags", "+faststart", str(video))
    run("ffmpeg", "-nostdin", "-loglevel", "error", "-ss", "0.4", "-i", str(video),
        "-frames:v", "1", "-update", "1", "-threads", "1", str(poster))
    if not video.stat().st_size or not poster.stat().st_size:
        raise ValueError(f"Invalid preview for {slug}")
    with zipfile.ZipFile(package, "w", zipfile.ZIP_DEFLATED, compresslevel=4) as archive:
        for member in [project, *media_files]:
            archive.write(member, member.relative_to(work).as_posix())
    with zipfile.ZipFile(package) as archive:
        if archive.testzip() is not None or "item.aep" not in archive.namelist():
            raise ValueError(f"Invalid ZIP for {slug}")
    print(f"Validated {slug} with {len(media_files)} linked media files", flush=True)
    return {
        "id": slug, "title": f"{category} {number}", "titleAr": f"{category_ar} {number}",
        "category": category, "categoryAr": category_ar, "kind": "aep", "fit": "contain",
        "entry": "item.aep", "mainComp": main_comp, "sizeBytes": package.stat().st_size,
        "sha256": digest(package), "downloadUrl": f"{BASE}/{package.name}",
        "preview": f"{BASE}/{video.name}", "poster": f"{BASE}/{poster.name}",
    }


def release_assets():
    result = subprocess.run(
        ["gh", "release", "view", TAG, "--repo", REPO, "--json", "assets,isDraft"],
        check=True, capture_output=True, text=True
    )
    return json.loads(result.stdout)


def main():
    sources = json.loads(Path("templates/sources.json").read_text())
    if len(sources) != 35 or len({item["slug"] for item in sources}) != 35:
        raise ValueError("Expected 35 unique templates")
    output = ROOT / "release"
    output.mkdir(parents=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        items = list(pool.map(build, sources))
    catalog = output / "templates-catalog-v1.json"
    catalog.write_text(json.dumps({"version": 1, "items": items}, ensure_ascii=False), encoding="utf-8")
    assets = sorted(output.iterdir())
    expected = {asset.name: asset.stat().st_size for asset in assets}
    if len(expected) != 106:
        raise ValueError("Expected 35 ZIPs, MP4s and posters, plus the catalog")
    check = subprocess.run(["gh", "release", "view", TAG, "--repo", REPO], capture_output=True, text=True)
    if check.returncode:
        run("gh", "release", "create", TAG, "--repo", REPO, "--draft",
            "--target", os.environ["GITHUB_SHA"], "--title", "LOKAYA Templates — 35 projects",
            "--notes", "35 individually downloadable After Effects templates with MP4 previews and an online catalog.")
    before = release_assets()
    if not before["isDraft"]:
        if {item["name"]: item["size"] for item in before["assets"]} != expected:
            raise ValueError("Existing public release differs from this build")
        return
    for i in range(0, len(assets), 12):
        run("gh", "release", "upload", TAG, *map(str, assets[i:i+12]), "--repo", REPO, "--clobber")
    staged = release_assets()
    if {item["name"]: item["size"] for item in staged["assets"]} != expected:
        raise ValueError("Draft assets differ from the verified build")
    run("gh", "release", "edit", TAG, "--repo", REPO, "--draft=false", "--latest=false")
    if release_assets()["isDraft"]:
        raise ValueError("Release is still a draft")


if __name__ == "__main__":
    main()
