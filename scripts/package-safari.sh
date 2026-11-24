#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

xcrun safari-web-extension-converter dist/safari \
  --app-name 'Onliner Notifier' \
  --bundle-identifier 'io.github.satroschenko.onliner-notifier' \
  --swift \
  --macos-only \
  --project-location dist/safari-app \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force

python3 scripts/configure-safari-bundle-id.py \
  'io.github.satroschenko.onliner-notifier' \
  'dist/safari-app/Onliner Notifier/Onliner Notifier.xcodeproj'

xcodebuild -quiet \
  -project 'dist/safari-app/Onliner Notifier/Onliner Notifier.xcodeproj' \
  -scheme 'Onliner Notifier' \
  -configuration Debug \
  -derivedDataPath dist/safari-derived-data \
  CODE_SIGNING_ALLOWED=NO \
  build

mkdir -p dist/safari-build
rm -rf 'dist/safari-build/Onliner Notifier.app'
cp -R 'dist/safari-derived-data/Build/Products/Debug/Onliner Notifier.app' dist/safari-build/
rm -rf dist/safari-derived-data
