'use strict';
// Scan the exact Git index before committing/publishing. Never print secrets.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const git = args => execFileSync('git', args, { maxBuffer: 20 * 1024 * 1024 });
const files = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).toString().split('\0').filter(Boolean);
assert.ok(files.length, 'No staged files to check.');
const secrets = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8').split(/\r?\n/).flatMap(line => {
  const match = line.match(/^\s*(?:export\s+)?\w+\s*=\s*(.*?)\s*$/);
  if (!match) return [];
  const value = match[1].replace(/^(['"])(.*)\1$/, '$2').replace(/\s+#.*$/, '').trim();
  return value.length >= 12 ? [Buffer.from(value)] : [];
}) : [];
const secretLike = /(?:nvapi-|sk-ant-api|gsk_|AIza|sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
for (const file of files) {
  assert.ok(!/(?:^|\/)(?:\.env(?:\..*)?|myresume|model-review|node_modules|browser-cache|browser-profile[^/]*)(?:\/|$)/i.test(file), 'Private path staged: ' + file);
  assert.ok(!/\.(?:pdf|zip|webm|pem|key)$/i.test(file), 'Private/generated binary staged: ' + file);
  const bytes = git(['show', ':' + file]);
  assert.ok(!secrets.some(secret => bytes.includes(secret)), 'Private env credential found in staged file: ' + file);
  assert.ok(!secretLike.test(bytes.toString('utf8')), 'Potential credential found in staged file: ' + file);
}
console.log(`PASS repository safety: ${files.length} staged files read; no private env values, token-shaped secrets, resumes, archives or browser data.`);
