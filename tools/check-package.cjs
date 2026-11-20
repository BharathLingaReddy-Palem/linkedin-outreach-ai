// Read private credentials only to check for accidental inclusion; never log them.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('linkedin extention');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const secrets=fs.existsSync('.env')?fs.readFileSync('.env','utf8').split(/\r?\n/).filter(s=>!/^\s*#/.test(s)).map(s=>s.slice(s.indexOf('=')+1).trim().replace(/^(['"])(.*)\1$/,'$2')).filter(s=>s.length>=12):[];
const files=walk(root);
for(const file of files){
  assert.ok(!/(^|[\\/])(?:\.env(?:\..*)?|node_modules|myresume|qa)(?:[\\/]|$)/i.test(path.relative(root,file)),'Unexpected private/development file in extension');
  const data=fs.readFileSync(file);
  assert.ok(!secrets.some(s=>data.includes(Buffer.from(s))),'Private credential found in package; do not distribute');
  assert.ok(!/(?:nvapi-|sk-ant-api|gsk_|AIza|sk-proj-)[A-Za-z0-9_-]{20,}/.test(data.toString('utf8')),'Potential embedded credential found; do not distribute');
}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.equal(manifest.version,'3.7.0');
assert.ok(manifest.host_permissions.includes('https://integrate.api.nvidia.com/*'));
for(const host of ['https://api.groq.com/*','https://generativelanguage.googleapis.com/*','https://api.openai.com/*','https://api.anthropic.com/*'])assert.ok(manifest.host_permissions.includes(host));
assert.ok(!manifest.host_permissions.includes('<all_urls>'));
console.log(`PASS package safety: ${files.length} extension files, no private env credentials or development/resume files; expected version and NVIDIA host.`);
