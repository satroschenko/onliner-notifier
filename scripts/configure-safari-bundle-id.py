import json
import re
import sys
from pathlib import Path

bundle_id = sys.argv[1]
project = Path(sys.argv[2])
classic_project = project / "project.pbxproj"
modern_project = project / "project.xcproj"


def update_settings(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "PRODUCT_BUNDLE_IDENTIFIER" and isinstance(item, str):
                suffix = ".Extension" if item.endswith(".Extension") else ""
                value[key] = bundle_id + suffix
            else:
                update_settings(item)
    elif isinstance(value, list):
        for item in value:
            update_settings(item)


if classic_project.exists():
    lines = classic_project.read_text().splitlines()
    updated = []
    for line in lines:
        if line.strip().startswith("PRODUCT_BUNDLE_IDENTIFIER ="):
            indent = line[: len(line) - len(line.lstrip())]
            suffix = ".Extension" if ".Extension" in line else ""
            line = f"{indent}PRODUCT_BUNDLE_IDENTIFIER = {bundle_id}{suffix};"
        updated.append(line)
    classic_project.write_text("\n".join(updated) + "\n")
elif modern_project.exists():
    source = modern_project.read_text()
    settings = json.loads(re.sub(r",(\s*[}\]])", r"\1", source))
    update_settings(settings)
    modern_project.write_text(json.dumps(settings, indent=2, ensure_ascii=False) + "\n")
else:
    raise SystemExit("Xcode project settings not found")
