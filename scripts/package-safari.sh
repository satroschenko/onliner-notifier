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

configuration=Debug
signing_settings=(CODE_SIGNING_ALLOWED=NO)
if [[ "${SAFARI_SIGNING:-0}" == "1" ]]; then
  : "${APPLE_TEAM_ID:?APPLE_TEAM_ID is required for signing}"
  configuration=Release
  signing_settings=(
    CODE_SIGNING_ALLOWED=YES
    CODE_SIGN_STYLE=Manual
    CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO
    CODE_SIGN_IDENTITY='Developer ID Application'
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID"
    ENABLE_HARDENED_RUNTIME=YES
    OTHER_CODE_SIGN_FLAGS=--timestamp
    PROVISIONING_PROFILE_SPECIFIER=
  )
fi

xcodebuild -quiet \
  -project 'dist/safari-app/Onliner Notifier/Onliner Notifier.xcodeproj' \
  -scheme 'Onliner Notifier' \
  -configuration "$configuration" \
  -derivedDataPath dist/safari-derived-data \
  "${signing_settings[@]}" \
  build

mkdir -p dist/safari-build
rm -rf 'dist/safari-build/Onliner Notifier.app'
cp -R "dist/safari-derived-data/Build/Products/$configuration/Onliner Notifier.app" dist/safari-build/
rm -rf dist/safari-derived-data
