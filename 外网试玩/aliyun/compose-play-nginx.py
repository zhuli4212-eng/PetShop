"""Attach the direct player site to the current release's web configuration."""
from pathlib import Path
import sys


def compose(release_config, direct_config, output):
    source = release_config.read_text(encoding="utf-8").rstrip()
    if not source.endswith("}") or "http {" not in source:
        raise ValueError(f"Invalid production Nginx configuration: {release_config}")
    if not direct_config.is_file():
        raise FileNotFoundError(direct_config)
    combined = source[:-1] + f"    include {direct_config};\n}}\n"
    temporary = output.with_suffix(".next")
    temporary.write_text(combined, encoding="utf-8")
    temporary.replace(output)


if __name__ == "__main__":
    compose(*(Path(argument) for argument in sys.argv[1:]))
