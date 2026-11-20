"""Convert the three Cocos store fonts in a copied Web Mobile build."""
import hashlib
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from functools import partial
from pathlib import Path

from fontTools.ttLib import TTFont, woff2


FONT_NAMES = ('NotoSansCJKsc-Regular', 'NotoSansCJKsc-Bold', 'NotoSerifCJKsc-Bold')


def fingerprint(data):
    return hashlib.sha256(data).hexdigest()[:16]


def convert(native_font):
    uuid = native_font.parent.name
    temporary = native_font.parent.with_suffix('.woff2')
    # Compress the existing tables at build time without rewriting glyph outlines.
    # Brotli quality 6 keeps this practical for full CJK files.
    compress_brotli = woff2.brotli.compress
    woff2.brotli.compress = partial(compress_brotli, quality=6)
    try:
        woff2.compress(native_font, temporary, transform_tables=set())
    finally:
        woff2.brotli.compress = compress_brotli
    with TTFont(native_font) as original, TTFont(temporary) as compressed:
        if any(original.getTableData(tag) != compressed.getTableData(tag)
               for tag in ('cmap', 'glyf', 'loca', 'hmtx', 'GSUB', 'GPOS')):
            raise ValueError(f'Font tables changed for {native_font.name}')
    size = temporary.stat().st_size
    version = fingerprint(temporary.read_bytes())
    temporary.rename(temporary.with_name(f'{uuid}.{version}.woff2'))
    native_font.unlink()
    print(f'{native_font.name} -> {size} bytes', flush=True)
    return version


def main(resources):
    config_path = resources / 'config.json'
    config = json.loads(config_path.read_text(encoding='utf-8'))
    fonts = []
    for name in FONT_NAMES:
        indices = [int(index) for index, asset in config['paths'].items()
                   if asset[0] == f'fonts/{name}']
        native_paths = list((resources / 'native').glob(f'*/*/{name}.ttf'))
        if len(indices) != 1 or len(native_paths) != 1:
            raise ValueError(f'Wrong Cocos font layout for {name}')
        native_font = native_paths[0]
        uuid = native_font.parent.name
        importer = resources / 'import' / uuid[:2] / f'{uuid}.json'
        metadata = importer.read_bytes()
        old_name = json.dumps(native_font.name).encode()
        if metadata.count(old_name) != 1 or b'"cc.TTFFont"' not in metadata:
            raise ValueError(f'Unexpected Cocos font import for {name}')
        metadata = metadata.replace(old_name, json.dumps(name+'.woff2').encode())
        fonts.append((indices[0], native_font, importer, metadata))

    versions = config['versions']
    if any(index in versions[kind][::2] for index, *_ in fonts
           for kind in ('native', 'import')):
        raise ValueError('Expected unversioned Cocos input fonts')
    with ProcessPoolExecutor(max_workers=len(fonts)) as executor:
        compressed = executor.map(convert, (native_font for _, native_font, _, _ in fonts))
        for (index, _, importer, metadata), native_version in zip(fonts, compressed):
            import_version = fingerprint(metadata)
            importer.with_suffix(f'.{import_version}.json').write_bytes(metadata)
            importer.unlink()
            versions['import'].extend([index, import_version])
            versions['native'].extend([index, native_version])
    config_path.write_text(json.dumps(config, separators=(',', ':')), encoding='utf-8')


if __name__ == '__main__':
    main(Path(sys.argv[1]))
