"""Build an Aliyun archive from a verified release or an explicit local candidate."""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile


HERE = Path(__file__).resolve().parent
OUTPUT_DIR = HERE.parents[1] / "output" / "aliyun"
WORKER_SHA = "93f10e81c3eac5d8e0fe90a58c8dd674e3f7b034fca02dcd4c0ec4a566e2a7af"
# Sorted public names and (name, SHA-256) pairs from the released standalone site.
PUBLIC_NAMES_SHA = "ae670665724f3cb684a08e64bed590af679220dcd3b386591815bee0ed24efc5"
PUBLIC_CONTENT_SHA = "b3abf9769b9e3ba7e3df60897b95eb09155e3099fc3d893c21d472425ecf76a6"
PUBLIC_ROOT_FILES = (
    "application.js", "index.html", "index.js", "legacy.js", "style.css",
    "trial-crypto-LICENSE.txt", "trial-login.css", "trial-shopfront.png",
    "trial-start.js", "trial-worker.js",
)
INSTALL_FILES = (
    "server.mjs", "sqlite.mjs", "check.mjs", "install.sh", "nginx.conf", "README.md",
    "petshop-trial-test.service", "petshop-trial-test-web.service",
)
PRODUCTION_FILES = ("production.sh", "petshop.service", "nginx-production.conf", "petshop-web.service", "migrate.py", "renew-certificate.sh")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def manifest_digest(items):
    return digest(json.dumps(items, ensure_ascii=True, separators=(",", ":")).encode("ascii"))


def public_files(pages, candidate):
    names = list(PUBLIC_ROOT_FILES)
    for prefix in ("assets", "cocos-js", "src"):
        directory = pages / prefix
        if not directory.is_dir() or directory.is_symlink():
            raise ValueError(f"Missing static release directory: {prefix}")
        names.extend(p.relative_to(pages).as_posix() for p in directory.rglob("*") if p.is_file())
    names.sort()
    if not candidate and manifest_digest(names) != PUBLIC_NAMES_SHA:
        raise ValueError("The public file list differs from the verified game release.")
    return names


def read_release_file(pages, name):
    file = pages / name
    if file.is_symlink() or not file.resolve(strict=True).is_relative_to(pages):
        raise ValueError(f"Unexpected release path: {name}")
    return file.read_bytes()


def add_bytes(archive, name, data):
    member = tarfile.TarInfo(name)
    member.size = len(data)
    member.mode = 0o755 if name in ("install.sh", "production.sh") else 0o644
    archive.addfile(member, io.BytesIO(data))


def build(pages, output, production, candidate=False):
    pages = pages.resolve(strict=True)
    names = public_files(pages, candidate)
    worker = read_release_file(pages, "_worker.js")
    if not candidate and digest(worker) != WORKER_SHA:
        raise ValueError("Account Worker differs from the verified game release.")
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    scratch = None
    try:
        with tempfile.NamedTemporaryFile(dir=output.parent, delete=False) as target:
            scratch = Path(target.name)
            with gzip.GzipFile(filename="", mode="wb", fileobj=target, mtime=0, compresslevel=6) as zipped:
                with tarfile.open(fileobj=zipped, mode="w|") as archive:
                    files = INSTALL_FILES + PRODUCTION_FILES if production else INSTALL_FILES
                    if candidate and production:
                        files += ("reset-shops.mjs",)
                    for name in files:
                        add_bytes(archive, name, (HERE / name).read_bytes().replace(b"\r\n", b"\n"))
                    schema = HERE.parent / "accounts" / "schema.sql"
                    add_bytes(archive, "schema.sql", schema.read_bytes().replace(b"\r\n", b"\n"))
                    add_bytes(archive, "account-service.mjs", worker)
                    hashes = []
                    for name in names:
                        data = read_release_file(pages, name)
                        hashes.append((name, digest(data)))
                        add_bytes(archive, "public/" + name, data)
                    if not candidate and manifest_digest(hashes) != PUBLIC_CONTENT_SHA:
                        raise ValueError("Public asset contents differ from the verified game release.")
        os.replace(scratch, output)
    finally:
        if scratch is not None:
            scratch.unlink(missing_ok=True)
    print(f"{output}\n{len(names)} public game files; SHA-256 {digest(output.read_bytes())}")
    if candidate:
        print(f"Account service SHA-256 {digest(worker)}; public asset manifest SHA-256 {manifest_digest(hashes)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pages", type=Path, required=True, help="Standalone Pages release directory with account Worker")
    parser.add_argument("--out", type=Path, help="Output tar.gz path")
    parser.add_argument("--production", action="store_true", help="Include the private staging and public cutover tools")
    parser.add_argument("--candidate", action="store_true", help="Package newly built assets to a separate archive")
    args = parser.parse_args()
    name = "petshop-production.tar.gz" if args.production else "petshop-test.tar.gz"
    if args.candidate and (not args.out or args.out.exists()):
        parser.error("--candidate requires --out pointing to a new archive")
    build(args.pages, args.out or OUTPUT_DIR / name, args.production, args.candidate)
