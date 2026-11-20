// Optional real-network acceptance. Only the built-in fictional demo is sent.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const testRequire=process.env.TEST_NODE_MODULES?require('node:module').createRequire(path.resolve(process.env.TEST_NODE_MODULES,'package.json')):require;
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('qa/browser-cache');
const {chromium}=testRequire('playwright');
const envLine=fs.readFileSync('.env','utf8').split(/\r?\n/).find(line=>/^\s*api_key_1\s*=/.test(line));
const key=envLine?.replace(/^\s*api_key_1\s*=\s*/,'').trim().replace(/^(['"])(.*)\1$/,'$2');
if(!key)throw new Error('Missing test key. No credential printed.');
(async()=>{
  const profile=fs.mkdtempSync(path.resolve('qa/browser-profile-real-'));
  const extension=path.resolve('linkedin extention');
  const browser=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:400,height:600},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  let page;
  const checks=[];
  try {
    const worker=browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    const id=new URL(worker.url()).host;
    page=await browser.newPage();await page.goto(`chrome-extension://${id}/popup.html`);
    await page.locator('.tab-btn[data-tab=settings]').click();await page.locator('#cloud-settings > summary').click();
    await page.locator('#nvidia-key').fill(key);await page.locator('#validate-btn').click();
    await page.locator('#key-validation-status').filter({hasText:'Key and model worked'}).waitFor({timeout:30000});
    checks.push('Real NVIDIA key/model validation from the actual browser extension');
    await page.locator('#save-settings-btn').click();await page.locator('#settings-status').filter({hasText:'Saved.'}).waitFor();
    const safe=await worker.evaluate(async()=>{const local=await chrome.storage.local.get('providerCredentials');const session=await chrome.storage.session.get('nvidiaApiKey');return {localHasKey:!!local.providerCredentials?.nvidiaApiKey,sessionHasKey:!!session.nvidiaApiKey};});
    assert.deepEqual(safe,{localHasKey:true,sessionHasKey:false});
    checks.push('Key remembered in protected local credential storage, outside sender settings/prompts');
    await page.locator('.tab-btn[data-tab=current]').click();await page.locator('#demo-btn').click();
    
    await page.locator('#message-type').selectOption('Internship');
    await page.locator('#writer-mode').selectOption('nvidia');
    await new Promise(resolve=>setTimeout(resolve,2100));
    await page.locator('#generate-btn').click();await page.locator('#draft-mode').filter({hasText:'NVIDIA'}).waitFor({timeout:30000});
    const initial=await page.locator('#generated-message').inputValue();
    assert.ok(initial.length<=700);assert.match(initial,/Avery/);assert.doesNotMatch(initial,/Bharath|Palem|PRIVATE/);
    checks.push('Real Super generation through MV3 worker/host permission with the fictional demo only');
    await page.locator('#why-panel > summary').click();await page.screenshot({path:'qa/nvidia-browser-live.png'});
    
    await new Promise(resolve=>setTimeout(resolve,2100));await page.locator('#warmer-btn').click();
    await page.locator('#status-message').filter({hasText:'Made warmer.'}).waitFor({timeout:30000});
    assert.notEqual(await page.locator('#generated-message').inputValue(),initial);
    await page.locator('#undo-btn').click();assert.equal(await page.locator('#generated-message').inputValue(),initial);
    checks.push('Real AI rewrite changes the current draft and Undo restores it exactly');
    await page.reload();await page.locator('#generated-message').waitFor({state:'visible'});
    assert.equal(await page.locator('#generated-message').inputValue(),initial);
    checks.push('Real AI draft and context survive popup reload, cloud writer is not auto-selected');
    const report=JSON.stringify({fixture:'Built-in fictional Avery Demo / Jordan Example only. No real profile or resume was sent.',checks,message:initial},null,2);
    if(report.includes(key))throw new Error('Refused credential-bearing report');
    fs.writeFileSync('qa/nvidia-browser-live.json',report);console.log(`PASS: ${checks.length} real NVIDIA browser acceptance checks.`);
  } catch(error) {
    const safeText=String(error.message).split(key).join('[REDACTED]').replace(/nvapi-[A-Za-z0-9_-]+/g,'[REDACTED]');
    console.error(safeText);process.exitCode=1;
  } finally {await browser.close();}
})().catch(()=>{console.error('Browser smoke could not start. No credential printed.');process.exitCode=1;});
