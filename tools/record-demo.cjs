// Silent before/after walkthrough for the user to narrate in Loom.
const fs=require('node:fs'),path=require('node:path');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('qa/browser-cache');
const testRequire=process.env.TEST_NODE_MODULES?require('node:module').createRequire(path.resolve(process.env.TEST_NODE_MODULES,'package.json')):require;
const {chromium}=testRequire('playwright');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const extension=path.resolve('linkedin extention');
  const context=await chromium.launchPersistentContext(fs.mkdtempSync(path.resolve('qa/browser-profile-video-')),{channel:'chromium',headless:true,viewport:{width:400,height:600},recordVideo:{dir:path.resolve('qa/demo-video'),size:{width:400,height:600}},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const page=await context.newPage(),video=page.video();
  try {
    const {pathToFileURL}=require('node:url');
    await page.goto(pathToFileURL(path.resolve('original-extension-test.jpg')).href);await pause(4000);
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);await pause(3000);
    await page.locator('#demo-btn').click();await pause(3000);
    await page.locator('#recipient-reviewed').check();await pause(1500);
    await page.locator('#message-type').selectOption('Internship');
    await page.locator('#outreach-goal').fill('Are there AI engineering internships on your team?');await pause(1500);
    await page.locator('#generate-btn').click();await page.locator('#message-section').waitFor({state:'visible'});await pause(3000);
    await page.locator('#why-panel > summary').click();await page.locator('#evidence-list').scrollIntoViewIfNeeded();await pause(4000);
    await page.locator('#shorter-btn').click();await pause(2000);await page.locator('#undo-btn').click();await pause(1500);
    await page.locator('#message-format').selectOption('connection');await pause(1800);
    await page.locator('#generate-btn').click();await pause(1200);await page.locator('#generate-btn').click();await pause(3000);
    await page.reload();await page.locator('#generated-message').scrollIntoViewIfNeeded();await pause(3000);
    await page.locator('.tab-btn[data-tab=recent]').click();await pause(3000);
    await page.close();
    await video.saveAs(path.resolve('qa/phase-two-demo.webm'));
  } finally {await context.close();}
  console.log('Saved qa/phase-two-demo.webm: silent, local-only, fictional after-demo; no API keys or outreach sent.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
