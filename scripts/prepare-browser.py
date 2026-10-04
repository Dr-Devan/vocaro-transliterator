"""Reproducible, lossless browser assets from the pinned Python dictionary."""
import gzip
import hashlib
import importlib.metadata
import json
import shutil
from pathlib import Path
import sudachidict_core

root = Path(__file__).resolve().parent.parent
target = root / 'frontend/public/dictionary'
target.mkdir(parents=True, exist_ok=True)
source = Path(sudachidict_core.__file__).parent / 'resources/system.dic'
compressed = target / 'system-20250825.dic.gz'
with source.open('rb') as inp, compressed.open('wb') as raw:
    with gzip.GzipFile(fileobj=raw, mode='wb', compresslevel=9, mtime=0) as out:
        shutil.copyfileobj(inp, out)
data = dict(version=importlib.metadata.version('sudachidict_core'), file=compressed.name,
            bytes=compressed.stat().st_size, rawBytes=source.stat().st_size,
            sha256=hashlib.file_digest(compressed.open('rb'), 'sha256').hexdigest())
(target/'manifest.json').write_text(json.dumps(data), encoding='utf-8')
print(json.dumps(data))
