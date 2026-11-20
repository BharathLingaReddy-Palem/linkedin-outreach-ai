// Opt-in live acceptance: Groq and Gemini ONLY, built-in fictional data ONLY.
// Never displays credentials, visits LinkedIn or uploads a real resume.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const testRequire=process.env.TEST_NODE_MODULES?require('node:module').createRequire(path.resolve(process.env.TEST_NODE_MODULES,'package.json')):require;
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('qa/browser-cache');
const {chromium}=testRequire('playwright');
const env={};
for(const line of fs.readFileSync('.env','utf8').split(/\r?\n/)) {
  const match=line.match(/^\s*(?:export\s+)?([\w]+)\s*=\s*(.*?)\s*$/);
  if(match)env[match[1].toLowerCase()]=match[2].replace(/^(['"])(.*)\1$/,'$2').replace(/\s+#.*$/,'').trim();
}
const selected=process.argv.find(value=>value.startsWith('--provider='))?.slice('--provider='.length);
if(selected && !['groq','gemini'].includes(selected))throw new Error('Only Groq/Gemini live tests are allowed.');
const cases=[['groq',env.groq_api_key || env.groq || env.qroq,'groq-key','Groq'],['gemini',env.gemini_api_key || env.gemini,'gemini-key','Google Gemini']].filter(([provider])=>!selected || provider===selected);
const secrets=Object.values(env).filter(value=>value.length>10);
const safe=text=>secrets.reduce((s,key)=>s.split(key).join('[REDACTED]'),String(text)).replace(/(?:gsk_|AIza|nvapi-|sk-proj-)[\w-]+/g,'[REDACTED]');
(async()=>{
  const results=[];
  for(const [provider,key,keyInput,label] of cases) {
    if(!key){results.push({provider,status:'NOT PERFORMED',reason:'Missing provider key in local .env'});continue;}
    const profile=fs.mkdtempSync(path.resolve('qa/browser-profile-live-'+provider+'-'));
    const browser=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:400,height:600},args:[`--disable-extensions-except=${path.resolve('linkedin extention')}`,`--load-extension=${path.resolve('linkedin extention')}`]});
    const checks=[];let selectedModel='',message='',worker;
    try {
      worker=browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
      const page=await browser.newPage();await page.goto(`chrome-extension://${id}/popup.html`);
      await page.locator('.tab-btn[data-tab=settings]').click();await page.locator('#cloud-settings > summary').click();
      await page.locator('#ai-provider').selectOption(provider);await page.locator('#'+keyInput).fill(key);
      await page.locator('#load-models-btn').click();
      await page.waitForFunction(()=>!document.getElementById('load-models-btn').disabled,{},{timeout:30000});
      const listing=await page.locator('#model-list-status').innerText();
      if(!listing.includes('supported text model(s) listed'))throw new Error('Model lookup: '+listing);
      selectedModel=await page.locator('#'+provider+'-model').inputValue();checks.push('Live account-model lookup through actual MV3 worker, no personal data');
      await page.locator('#validate-btn').click();
      await page.waitForFunction(()=>!document.getElementById('validate-btn').disabled,{},{timeout:30000});
      const validation=await page.locator('#key-validation-status').innerText();
      if(!validation.includes('Key and model worked'))throw new Error('Key/model validation: '+validation);
      checks.push('Live key/model connection test');
      await page.locator('#save-settings-btn').click();await page.locator('#settings-status').filter({hasText:'Saved.'}).waitFor();
      const stored=await worker.evaluate(async keyName=>({persistentHasKey:!!(await chrome.storage.local.get('providerCredentials')).providerCredentials?.[keyName],sessionHasKey:!!(await chrome.storage.session.get(keyName))[keyName]}),provider+'ApiKey');
      assert.deepEqual(stored,{persistentHasKey:true,sessionHasKey:false});checks.push('Key remembered in protected local credential storage, not prompt/settings context');
      await page.locator('.tab-btn[data-tab=current]').click();await page.locator('#demo-btn').click();
      await page.locator('#highlight-choice').selectOption('Built a RAG assistant with Python and FastAPI.');
      await page.locator('#message-type').selectOption('Internship');await page.locator('#outreach-goal').fill('Are there AI engineering internships on your team?');
      await page.locator('#writer-mode').selectOption(provider);
      assert.equal(await page.locator('#recipient-reviewed').count(),0);await page.waitForTimeout(2100);
      const start=performance.now();await page.locator('#generate-btn').click();
      await page.waitForFunction(()=>!document.getElementById('generate-btn').textContent.includes('Working'),{},{timeout:30000});
      const mode=await page.locator('#draft-mode').innerText();
      if(!mode.includes(label))throw new Error('Generation: '+await page.locator('#status-message').innerText());
      message=await page.locator('#generated-message').inputValue();
      assert.ok(message.length>20 && [...message].length<=700);assert.match(message,/Avery/);assert.doesNotMatch(message,/Bharath|Palem/);
      const milliseconds=Math.round(performance.now()-start);
      checks.push('Live fictional-demo generation, optional review unchecked, <=700 characters');
      assert.equal(await page.locator('#cloud-consent, #nvidia-test-context').count(),0);
      await page.locator('#generated-message').scrollIntoViewIfNeeded();await page.screenshot({path:`qa/${provider}-browser-live.png`});
      await page.waitForTimeout(2100);await page.locator('#shorter-btn').click();
      await page.waitForFunction(()=>!document.getElementById('generate-btn').textContent.includes('Working'),{},{timeout:30000});
      const rewritten=await page.locator('#generated-message').inputValue();
      if(rewritten===message)throw new Error('Rewrite: '+await page.locator('#status-message').innerText());
      assert.ok(rewritten.length<message.length);await page.locator('#undo-btn').click();assert.equal(await page.locator('#generated-message').inputValue(),message);
      checks.push('Live shorter rewrite and exact Undo');
      await page.reload();await page.locator('#generated-message').waitFor({state:'visible'});
      assert.equal(await page.locator('#generated-message').inputValue(),message);assert.equal(await page.locator('#writer-mode').inputValue(),'local');
      checks.push('Draft recovery; reopening restores local mode with cloud not auto-selected');
      results.push({provider,status:'VERIFIED',selectedModel,checks,milliseconds,characters:[...message].length,message});
      console.log(`PASS ${provider}: ${checks.length} live browser checks, model ${selectedModel}, ${message.length}/700 characters.`);
    } catch(error) {results.push({provider,status:'FAILED',selectedModel,checks,reason:safe(error.message)});console.log(`${provider}: FAILED - ${safe(error.message)}`);}
    finally {try{if(worker)await worker.evaluate(()=>CredentialStore.forget('all'));}catch{}await browser.close();}
  }
  let previous={};try{previous=JSON.parse(fs.readFileSync('qa/multi-provider-live.json','utf8'));}catch{}
  const retained=previous.version==='3.7.0'?(previous.results || []).filter(result=>!cases.some(([provider])=>provider===result.provider)):[];
  const attempts=previous.version==='3.7.0'?[...(previous.previousAttempts || []),...(previous.results || []).filter(result=>result.status==='FAILED')]:[];
  const report=JSON.stringify({version:'3.7.0',fixture:'Built-in fictional Avery Demo / Jordan Example only. Real API calls from isolated unpacked Chromium extension, not the installed Edge copy. No real profile/resume sent. No Claude/OpenAI/NVIDIA live calls in this test.',results:[...retained,...results],previousAttempts:attempts},null,2);
  assert.ok(!secrets.some(key=>report.includes(key)),'Refused credential-bearing report');
  fs.writeFileSync('qa/multi-provider-live.json',report);
  if(results.some(r=>r.status!=='VERIFIED'))process.exitCode=1;
})().catch(error=>{console.log('Live acceptance could not complete: '+safe(error.message));process.exitCode=1;});
