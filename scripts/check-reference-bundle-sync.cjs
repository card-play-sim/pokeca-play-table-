'use strict';
// Guard the actual shipped PWA against source/bundle drift.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const bundle = fs.readFileSync(path.join(root, 'ui/engine.bundle.js'), 'utf8');
for (const name of ['pokeca_effect_extensions','pokeca_selection_constraints','pokeca_reference_effect_runtime', 'pokeca_reference_validation_adapter']) {
  const source = fs.readFileSync(path.join(root, 'engine', name + '.cjs'), 'utf8').trimEnd();
  const prefix = '"' + name + '":function(require,module,exports){\n';
  const start = bundle.indexOf(prefix);
  assert.ok(start >= 0, 'MISSING_BUNDLE_MODULE:' + name);
  const bodyStart = start + prefix.length;
  const bodyEnd = bundle.indexOf('\n},"pokeca_', bodyStart);
  assert.ok(bodyEnd > bodyStart, 'MISSING_BUNDLE_BOUNDARY:' + name);
  assert.equal(bundle.slice(bodyStart, bodyEnd).trimEnd(), source, 'STALE_BUNDLE_MODULE:' + name);
}
console.log('REFERENCE_BUNDLE_SOURCE_SYNC PASS');
