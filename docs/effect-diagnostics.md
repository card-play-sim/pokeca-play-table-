# Shared effect implementation diagnostics

Run `node scripts/run-offline-tests.cjs` from the repository root. Every run writes `artifacts/effect-test-diagnostics.json` even when tests fail.

The JSON records the test file, PASS/FAIL, exit status, failure excerpt, and preliminary failure category. Categories are hints, not verified root causes. Investigate the original test logs before changing code.

Use the same diagnostics for Goods, Supporters, Stadiums, attacks and abilities. Fix shared Rule Engine/Effect Command behavior instead of patching individual cards when failures share a cause. Never modify the formal 1945-card read-only catalog, infer missing official evidence, or mark reference prints adopted.

This initial change adds diagnostics only; it does not autonomously repair effects, connect normal-mode effects, deploy a release, or verify an Android device. Those are separate gated stages.
