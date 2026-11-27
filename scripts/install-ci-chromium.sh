#!/usr/bin/env bash
# Use runner's existing libraries first. Only install OS packages when needed.
# Never replace or skip a gameplay suite; a real Chromium launch is mandatory.
set -euo pipefail
smoke() {
  python - <<'PY'
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("data:text/html,<title>chromium-ci-ready</title>")
    assert page.title() == "chromium-ci-ready"
    browser.close()
PY
}
for attempt in 1 2 3; do
  if python -m playwright install chromium; then break; fi
  if [ "$attempt" = 3 ]; then exit 1; fi
  sleep "$((attempt * 5))"
done
if smoke; then
  echo 'CHROMIUM_LAUNCH_VERIFIED_WITH_RUNNER_LIBRARIES'
  exit 0
fi
# Actual missing system libraries still require the supported installer.
for attempt in 1 2 3; do
  if python -m playwright install --with-deps chromium && smoke; then
    echo 'CHROMIUM_LAUNCH_VERIFIED_AFTER_DEPENDENCY_INSTALL'
    exit 0
  fi
  if [ "$attempt" = 3 ]; then exit 1; fi
  sleep "$((attempt * 5))"
done
