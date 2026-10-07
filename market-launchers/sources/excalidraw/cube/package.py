"""Package a built, patched Excalidraw checkout as a Cube static bundle."""
import gzip
import hashlib
import io
from pathlib import Path
import sys
import tarfile

source, output = map(Path, sys.argv[1:])
recipe = Path(__file__).resolve().parent
public = source / "excalidraw-app/build"
if 'window.name ||= "_excalidraw"' not in (public / "index.html").read_text():
    raise SystemExit("Build is missing the Cube iframe compatibility patch")
files = {f"cube/{file.name}": file.read_bytes() for file in recipe.iterdir() if file.is_file()}
files["cube/.market-launcher"] = b"excalidraw\n"
files["cube/LICENSE"] = (source / "LICENSE").read_bytes()
files["cube/icon.svg"] = (source / "public/favicon.svg").read_bytes()
for file in public.rglob("*"):
    if file.is_symlink():
        raise SystemExit(f"Refusing build symlink: {file}")
    if file.is_file():
        files[f"cube/public/{file.relative_to(public).as_posix()}"] = file.read_bytes()
buffer = io.BytesIO()
with gzip.GzipFile(fileobj=buffer, mode="wb", filename="", mtime=0) as zipped:
    with tarfile.open(fileobj=zipped, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name, data in sorted(files.items()):
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o644
            archive.addfile(info, io.BytesIO(data))
data = buffer.getvalue()
digest = hashlib.sha256(data).hexdigest()
output.mkdir(parents=True, exist_ok=True)
bundle = output / f"excalidraw-{digest[:16]}.tar.gz"
if bundle.exists() and bundle.read_bytes() != data:
    raise SystemExit("Refusing to overwrite a different published bundle")
bundle.write_bytes(data)
print(f"{digest}  {bundle}")
