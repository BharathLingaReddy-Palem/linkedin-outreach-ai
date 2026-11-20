// No real keys / no network. Actual MV3 extension reload and browser restart.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const testRequire=process.env.TEST_NODE_MODULES?require('node:module').createRequire(path.resolve(process.env.TEST_NODE_MODULES,'package.json')):require;
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('qa/browser-cache');
const {chromium}=testRequire('playwright');
const profile=fs.mkdtempSync(path.resolve('qa/browser-profile-recovery-'));
const extension=path.resolve('linkedin extention'),checks=[];
const launch=()=>chromium.launchPersistentContext(profile,{headless:true,channel:'chromium',args:['--enable-unsafe-extension-debugging',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:400,height:600}});
const workerOf=async browser=>browser.serviceWorkers()[0] || browser.waitForEvent('serviceworker');
async function popupOf(browser,worker){const popup=await browser.newPage();await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);await popup.locator('#app-version').filter({hasText:'3.7.0'}).waitFor();await popup.locator('.tab-btn[data-tab=settings]').click();await popup.locator('#cloud-settings > summary').click();return popup;}
async function verifyKeys(popup,groq=true,gemini=true){for(const provider of ['groq','gemini']){await popup.locator('#ai-provider').selectOption(provider);assert.equal(await popup.locator('#'+provider+'-key').inputValue(),(provider==='groq'?groq:gemini)?provider+'-recovery-fake-key':'');}}
(async()=>{
  let browser=await launch(),worker=await workerOf(browser);
  try {
    let popup=await popupOf(browser,worker);
    for(const provider of ['groq','gemini']) {
      await popup.locator('#ai-provider').selectOption(provider);await popup.locator('#'+provider+'-key').fill(provider+'-recovery-fake-key');
    }
    await popup.locator('#save-settings-btn').click();await popup.locator('#settings-status').filter({hasText:'Saved.'}).waitFor();
    await verifyKeys(popup);checks.push('Saving two provider keys retains both, despite a different last Settings selection');
    const tab=await browser.newPage();await browser.route('https://www.linkedin.com/**',r=>r.fulfill({contentType:'text/html',body:'<main><h1>Fictional Example</h1></main>'}));await tab.goto('https://www.linkedin.com/in/fictional-example/');
    const tabId=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url.includes('/in/fictional-example/')).id);
    const denied=await worker.evaluate(async id=>(await chrome.scripting.executeScript({target:{tabId:id},world:'ISOLATED',func:async()=>{try{await chrome.storage.local.get('providerCredentials');return false;}catch{return true;}}}))[0].result,tabId);
    assert.equal(denied,true);checks.push('Real LinkedIn content-script context cannot read local credential storage');
    // Reload the EXTENSION, not just the popup document.
    const oldWorker=worker;
    const nextWorker=browser.waitForEvent('serviceworker').catch(()=>null);
    // Reload/update the same unpacked path through the developer API, matching
    // the extension-manager update path rather than runtime self-unloading.
    const cdp=await browser.browser().newBrowserCDPSession();
    const reloaded=await cdp.send('Extensions.loadUnpacked',{path:extension});
    assert.equal(new URL(oldWorker.url()).host,reloaded.id);
    popup=await popupOf(browser,{url:()=>`chrome-extension://${reloaded.id}/background.js`});worker=await nextWorker;
    if(!worker)throw new Error('Reloaded extension worker did not become available.');
    await verifyKeys(popup);checks.push('Keys survive developer reload/update of the same unpacked path and extension ID');
    await browser.close();browser=await launch();worker=await workerOf(browser);popup=await popupOf(browser,worker);
    await verifyKeys(popup);checks.push('Keys survive closing/restarting the browser with the same extension identity');
    await popup.locator('.tab-btn[data-tab=current]').click();await popup.locator('#demo-btn').click();
    const values=await popup.locator('#writer-mode option').evaluateAll(options=>options.map(o=>o.value));
    assert.deepEqual(values,['local','nvidia','groq','gemini','anthropic','openai']);
    for(const provider of ['groq','gemini']) {
      await popup.locator('#writer-mode').selectOption(provider);assert.ok(await popup.locator('#compose-model option').count()>=2);
      assert.equal(await popup.locator('#generate-btn').isEnabled(),true);
      assert.equal(await popup.locator('#cloud-consent, #nvidia-test-context').count(),0);
    }
    checks.push('Compose exposes every provider plus matching model menus; both saved writers ready without checkboxes');
    await popup.locator('#writer-mode').selectOption('groq');
    await popup.locator('#compose-model').selectOption('llama-3.1-8b-instant');
    await popup.locator('#configure-provider-btn').click();assert.equal(await popup.locator('#ai-provider').inputValue(),'groq');
    await popup.locator('#groq-model').selectOption('openai/gpt-oss-120b');await popup.locator('#save-settings-btn').click();await popup.locator('#settings-status').filter({hasText:'Saved.'}).waitFor();
    await popup.locator('.tab-btn[data-tab=current]').click();assert.equal(await popup.locator('#writer-mode').inputValue(),'groq');assert.equal(await popup.locator('#compose-model').inputValue(),'openai/gpt-oss-120b');
    checks.push('Saving a model update changes the current Compose model without switching its provider or retaining stale choice');
    await popup.locator('#cloud-data-notice').scrollIntoViewIfNeeded();await popup.screenshot({path:'qa/compose-all-providers.png'});
    await popup.locator('#writer-mode').evaluate(el=>{el.size=6;});await popup.locator('#writer-mode').scrollIntoViewIfNeeded();await popup.screenshot({path:'qa/compose-provider-options.png'});await popup.locator('#writer-mode').evaluate(el=>{el.size=0;});
    await popup.locator('#configure-provider-btn').click();await popup.locator('#forget-key-btn').click();
    await popup.locator('#settings-status').filter({hasText:'Selected key removed'}).waitFor();await verifyKeys(popup,false,true);
    await popup.reload();await popup.locator('.tab-btn[data-tab=settings]').click();await popup.locator('#cloud-settings > summary').click();await verifyKeys(popup,false,true);
    checks.push('Forget selected key removes only that key and does not resurrect on reopening');
    await popup.locator('#forget-all-keys-btn').click();await popup.locator('#settings-status').filter({hasText:'All saved keys removed'}).waitFor();await verifyKeys(popup,false,false);
    await popup.reload();await popup.locator('.tab-btn[data-tab=settings]').click();await popup.locator('#cloud-settings > summary').click();await verifyKeys(popup,false,false);
    checks.push('Forget all keys removes remembered credentials, without re-importing old session values');
    fs.writeFileSync('qa/key-recovery.json',JSON.stringify({version:'3.7.0',fixture:'Isolated Chromium with actual extension reload/browser restart; fake keys only, no API requests. Provider-options screenshot temporarily expands native select to show all options.',checks},null,2));
    console.log(`PASS ${checks.length} actual extension-reload/browser-restart and key-protection checks.`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
