'use strict';
// Match the explicit cache used by the isolated extension browser suites.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.resolve('qa/browser-cache') }
});
if (result.error) {
  console.error('Browser installer could not start. Run npm ci first.');
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
