const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function worker(seed={},fetchImpl=async()=>{throw new Error('offline');},credentials={}) {
  const state=structuredClone(seed);let listener;
  const context=vm.createContext({URL,AbortController,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,fetch:fetchImpl,
    chrome:{runtime:{id:'test-extension',getURL:path=>`chrome-extension://test-extension/${path}`,onMessage:{addListener(fn){listener=fn;}}},storage:{local:{
      async get(keys){if(keys===null)return structuredClone(state);return Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in state).map(k=>[k,structuredClone(state[k])]));},
      async set(payload){await new Promise(resolve=>setTimeout(resolve,2));Object.assign(state,structuredClone(payload));},
      async remove(keys){for(const key of keys)delete state[key];},async setAccessLevel({accessLevel}){assert.equal(accessLevel,'TRUSTED_CONTEXTS');}
    },session:{async get(){return structuredClone(credentials);},async remove(keys){for(const key of keys)delete credentials[key];}}}}});
  context.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync('linkedin extention/'+file,'utf8'),context,{filename:require('node:path').resolve('linkedin extention',file)}));
  vm.runInContext(fs.readFileSync('linkedin extention/background.js','utf8'),context,{filename:require('node:path').resolve('linkedin extention/background.js')});
  const send=message=>new Promise(resolve=>listener(message,{id:'test-extension',url:'chrome-extension://test-extension/popup.html'},resolve));
  return {state,send,listener,context};
}
test('serialized draft updates keep final edited text in Current and Recent',async()=>{
  const w=worker();
  const draft={id:'manual:1',profile:{name:'Avery'},hasGenerated:true,message:'initial'};
  await Promise.all([w.send({action:'saveDraft',draft}),w.send({action:'saveDraft',draft:{...draft,message:'edited'}})]);
  assert.equal(w.state.currentDraft.message,'edited');assert.equal(w.state.recentContacts[0].message,'edited');assert.equal(w.state.recentContacts.length,1);
});
test('Recent retains twenty distinct recipient drafts and evicts only the oldest',async()=>{
  const w=worker();
  for(let i=0;i<25;i++) await w.send({action:'saveDraft',draft:{id:`manual:${i}`,profile:{name:`Person ${i}`},hasGenerated:true,message:`draft ${i}`}});
  assert.equal(w.state.recentContacts.length,20);assert.equal(w.state.recentContacts[0].id,'manual:24');assert.equal(w.state.recentContacts.at(-1).id,'manual:5');
});

test('delete active draft removes Current and Recent; Undo restores exact edited draft',async()=>{
  const w=worker();const draft={id:'manual:delete',profile:{name:'Avery'},hasGenerated:true,message:'Final edited text',highlightMode:'selected',selectedHighlight:'Built a RAG prototype.'};
  await w.send({action:'saveDraft',draft});
  const removed=await w.send({action:'deleteDraft',id:draft.id});
  assert.equal(removed.success,true);assert.equal(removed.deletedCurrent,true);assert.equal(w.state.recentContacts.length,0);assert.equal(w.state.currentDraft,undefined);
  const restored=await w.send({action:'undoDeleteDraft',token:removed.undoToken});
  assert.equal(restored.success,true);assert.equal(w.state.recentContacts[0].message,draft.message);assert.equal(w.state.currentDraft.selectedHighlight,draft.selectedHighlight);
});
test('deleting another draft preserves Current and Undo never overwrites a newer version',async()=>{
  const w=worker();for(const id of ['one','two'])await w.send({action:'saveDraft',draft:{id,profile:{name:id},hasGenerated:true,message:id}});
  const removed=await w.send({action:'deleteDraft',id:'one'});assert.equal(removed.success,true);assert.equal(w.state.currentDraft.id,'two');
  await w.send({action:'saveDraft',draft:{id:'one',profile:{name:'one'},hasGenerated:true,message:'NEW VERSION'}});
  const result=await w.send({action:'undoDeleteDraft',token:removed.undoToken});assert.equal(result.success,false);assert.equal(w.state.recentContacts[0].message,'NEW VERSION');
});
test('Undo preserves a different current draft and refuses expired tokens',async()=>{
  const w=worker();for(const id of ['one','two'])await w.send({action:'saveDraft',draft:{id,profile:{name:id},hasGenerated:true,message:id}});
  let removed=await w.send({action:'deleteDraft',id:'one'});
  assert.equal((await w.send({action:'undoDeleteDraft',token:removed.undoToken})).success,true);assert.equal(w.state.currentDraft.id,'two');
  removed=await w.send({action:'deleteDraft',id:'one'});
  vm.runInContext(`Date.now=()=>${removed.expiresAt+1}`,w.context);
  assert.equal((await w.send({action:'undoDeleteDraft',token:removed.undoToken})).success,false);assert.ok(!w.state.recentContacts.some(d=>d.id==='one'));
});
test('library read gives legacy drafts stable identities and drops malformed entries',async()=>{
  const w=worker({recentContacts:[{name:'Legacy',profileUrl:'https://www.linkedin.com/in/legacy/',message:'Existing draft'},null,{name:'Bad',message:42},{name:'Manual',message:'Manual saved text'}]});
  const first=await w.send({action:'getDrafts'});assert.equal(first.success,true);assert.equal(first.drafts.length,2);assert.equal(first.drafts[0].id,'https://www.linkedin.com/in/legacy/');
  const second=await w.send({action:'getDrafts'});assert.equal(second.drafts[1].id,first.drafts[1].id);
});
test('deleting unknown drafts or using incorrect Undo tokens leaves existing text untouched',async()=>{
  const w=worker({recentContacts:[{id:'one',message:'Keep me'}]});
  assert.equal((await w.send({action:'deleteDraft',id:'not-there'})).success,false);
  assert.equal((await w.send({action:'undoDeleteDraft',token:'wrong'})).success,false);
  assert.equal(w.state.recentContacts[0].message,'Keep me');
});
test('worker key validation sends only a fictional connection test and returns safe failure',async()=>{
  let body='';const w=worker({},async(url,opts)=>{body=opts.body;return {ok:true,json:async()=>({choices:[{message:{content:'{"message":"OK"}'}}]})};});
  const result=await w.send({type:'TEST_API_KEY',payload:{provider:'nvidia',apiKey:'fake-key'}});
  assert.equal(result.valid,true);assert.match(body,/connection test with no personal data/);
  const bad=await worker({},async()=>({ok:false,status:401})).send({type:'TEST_API_KEY',payload:{provider:'groq',apiKey:'fake-key'}});
  assert.equal(bad.valid,false);assert.doesNotMatch(bad.reason,/fake-key/);
});
test('scrape worker retries missing content script through injection, but rejects unsupported URLs',async()=>{
  const w=worker();let calls=0,injected=false;
  w.context.chrome.tabs={query:async()=>[{id:3,url:'https://www.linkedin.com/in/avery/'}],sendMessage:async()=>{if(++calls===1)throw new Error('No receiver');return {success:true,data:{name:'Avery'}};}};
  w.context.chrome.scripting={executeScript:async args=>{injected=true;assert.equal(args.target.tabId,3);}};
  assert.equal((await w.send({action:'scrapeProfile'})).data.name,'Avery');assert.equal(injected,true);
  w.context.chrome.tabs.query=async()=>[{id:3,url:'https://linkedin.com.evil.test/in/a'}];
  assert.equal((await w.send({action:'scrapeProfile'})).success,false);
});
test('a chosen reviewed project is the only highlighted fact given to local or cloud writers',async()=>{
  const settings={userName:'Jordan',userBio:'CS student',senderHighlights:'Built a RAG prototype.\nCreated a React dashboard.'};
  for(const useCloud of [false,true]) {
    let body='';const w=worker({...settings,providerCredentials:{groqApiKey:'fake-key'}},async(url,opts)=>{body=opts.body;return {ok:true,json:async()=>({choices:[{message:{content:'{"message":"Hi Avery. I created a React dashboard. Can we connect?"}'}}]})};});
    const result=await w.send({action:'generateMessage',data:{profileData:{name:'Avery'},useCloud,provider:'groq',highlightMode:'selected',selectedHighlight:'Created a React dashboard.',options:{format:'direct',budget:700}}});
    assert.equal(result.success,true);assert.equal(result.context.sender.highlights,'Created a React dashboard.');assert.doesNotMatch(result.generatedMessage,/RAG/);if(useCloud)assert.doesNotMatch(body,/RAG prototype/);
  }
});
test('an unreviewed or stale project selection is rejected before any cloud request',async()=>{
  let calls=0;const w=worker({senderHighlights:'Built a RAG prototype.',providerCredentials:{groqApiKey:'fake-key'}},async()=>{calls++;});
  const result=await w.send({action:'generateMessage',data:{profileData:{name:'Avery'},useCloud:true,provider:'groq',highlightMode:'selected',selectedHighlight:'Invented a company partnership.'}});
  assert.equal(result.success,false);assert.match(result.error,/selected.*(?:changed|available|reviewed)/i);assert.equal(calls,0);
});
test('content scripts and other senders cannot invoke cloud generation or draft writes',()=>{
  const w=worker();let answered=false;
  assert.equal(w.listener({action:'saveDraft'},{id:'test-extension',url:'https://www.linkedin.com/in/a',tab:{id:1}},()=>{answered=true;}),undefined);
  assert.equal(w.listener({action:'saveDraft'},{id:'other'},()=>{answered=true;}),undefined);
  assert.equal(answered,false);
});
test('local mode never calls fetch even when a key is saved',async()=>{
  let calls=0;const w=worker({userApiKey:'fake',senderHighlights:'Built a Python tool'},async()=>{calls++;});
  const result=await w.send({action:'generateMessage',data:{profileData:{name:'Avery'},messageType:'Internship',tone:'Neutral',useCloud:false}});
  assert.equal(result.success,true);assert.match(result.generatedMessage,/Python tool/);assert.equal(calls,0);
});

for (const provider of ['groq','gemini','anthropic','openai']) {
  test(`${provider} worker uses only the explicitly selected provider key and saved model`,async()=>{
    let request;
    const credentials={nvidiaApiKey:'wrong-nvidia-key',groqApiKey:'groq-test-key',geminiApiKey:'gemini-test-key',anthropicApiKey:'anthropic-test-key',openaiApiKey:'openai-test-key'};
    const w=worker({aiProvider:provider},async(url,opts)=>{
      request={url,...opts};return {ok:true,json:async()=>provider==='gemini'?{candidates:[{content:{parts:[{text:'{"message":"Hi Avery."}'}]}}]}:provider==='anthropic'?{content:[{type:'text',text:'{"message":"Hi Avery."}'}]}:{choices:[{message:{content:'{"message":"Hi Avery."}'}}]}};
    },credentials);
    const result=await w.send({action:'generateMessage',data:{demoMode:true,useCloud:true,provider}});
    assert.equal(result.success,true);assert.notEqual(result.mode,'Local fallback');assert.equal(result.generatedMessage,'Hi Avery.');
    const header=provider==='gemini'?request.headers['x-goog-api-key']:provider==='anthropic'?request.headers['x-api-key']:request.headers.Authorization;
    assert.ok(header.endsWith(`${provider}-test-key`));assert.ok(!JSON.stringify(request).includes('wrong-nvidia-key'));
  });
  test(`${provider} never borrows another provider key`,async()=>{
    let calls=0;const w=worker({aiProvider:provider,userApiKey:provider==='anthropic'?'':'wrong-legacy-key'},async()=>{calls++;},{nvidiaApiKey:'wrong-nvidia-key'});
    const result=await w.send({action:'generateMessage',data:{demoMode:true,useCloud:true,provider}});
    assert.equal(result.success,false);assert.match(result.error,/Save a key/);assert.equal(calls,0);
  });
}
test('cloud failure falls back locally without exposing error body or credential',async()=>{
  let calls=0;const w=worker({userApiKey:'fake-key'},async()=>{calls++;return {ok:false,status:429};});
  const result=await w.send({action:'generateMessage',data:{profileData:{name:'Avery'},tone:'Neutral',useCloud:true,provider:'anthropic'}});
  assert.equal(result.success,true);assert.equal(result.mode,'Local fallback');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(result),/fake-key/);
});
test('missing name blocks generation and invalid drafts are rejected',async()=>{
  const w=worker();
  assert.equal((await w.send({action:'generateMessage',data:{profileData:{name:'(20) LinkedIn'}}})).success,false);
  assert.equal((await w.send({action:'saveDraft',draft:{message:'not valid'}})).success,false);
});
test('cloud receives only the displayed recipient fields, not hidden scraped context or PDF bytes',async()=>{
  let body;
  const w=worker({userApiKey:'fake',senderHighlights:'Selected Python project',resumeBase64:'PRIVATE_PDF'},async(url,options)=>{
    body=options.body;return {ok:true,json:async()=>({content:[{type:'text',text:'{"message":"Hello Avery."}'}]})};
  });
  const result=await w.send({action:'generateMessage',data:{profileData:{name:'Avery',headline:'Engineer',about:'HIDDEN_ABOUT',skills:['HIDDEN_SKILL'],profileUrl:'https://www.linkedin.com/in/private-id/'},tone:'Neutral',useCloud:true,provider:'anthropic'}});
  assert.equal(result.mode,'Anthropic AI');assert.match(body,/Selected Python project/);
  assert.doesNotMatch(body,/HIDDEN_ABOUT|HIDDEN_SKILL|PRIVATE_PDF|private-id/);
});
test('NVIDIA demo sends fictional sender even when real sender settings exist',async()=>{
  let body;
  const w=worker({aiProvider:'nvidia',userName:'PRIVATE_REAL_NAME',userBio:'PRIVATE_REAL_BIO'},async(url,options)=>{
    body=options.body;return {ok:true,json:async()=>({choices:[{message:{content:'{"message":"Hi Avery, can we connect?"}'}}]})};
  },{nvidiaApiKey:'fake-test-key'});
  const result=await w.send({action:'generateMessage',data:{demoMode:true,useCloud:true,provider:'nvidia',options:{format:'connection',budget:200}}});
  assert.match(result.mode,/NVIDIA/);assert.match(body,/Jordan Example/);assert.doesNotMatch(body,/PRIVATE_REAL_NAME|PRIVATE_REAL_BIO/);
});
test('cloud requires an explicit named provider, not checkbox flags or a Settings fallback',async()=>{
  let calls=0;const w=worker({aiProvider:'nvidia'},async()=>{calls++;return {ok:true,json:async()=>({choices:[{message:{content:'{"message":"Hi Avery."}'}}]})};},{nvidiaApiKey:'fake-key'});
  const data={profileData:{name:'Avery'},useCloud:true};
  assert.equal((await w.send({action:'generateMessage',data})).success,false);
  assert.equal((await w.send({action:'generateMessage',data:{...data,cloudConsent:true}})).success,false);
  assert.equal(calls,0);
  const result=await w.send({action:'generateMessage',data:{...data,provider:'nvidia'}});
  assert.match(result.mode,/NVIDIA/);assert.equal(calls,1);
});

test('Compose provider and model override a different provider saved in Settings',async()=>{
  let url,body;const w=worker({aiProvider:'nvidia',providerCredentials:{groqApiKey:'groq-key'}},async(target,options)=>{url=target;body=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'{"message":"Hi Avery."}'}}]})};});
  const result=await w.send({action:'generateMessage',data:{demoMode:true,useCloud:true,provider:'groq',model:'llama-3.1-8b-instant'}});
  assert.match(result.mode,/Groq/);assert.match(url,/api.groq.com/);assert.equal(body.model,'llama-3.1-8b-instant');
});
test('legacy session keys migrate once; forgetting does not resurrect them',async()=>{
  const w=worker({},undefined,{geminiApiKey:'session-gemini-key',groqApiKey:'session-groq-key'});
  assert.equal((await w.send({action:'getProviderKeys'})).keys.geminiApiKey,'session-gemini-key');
  assert.equal(w.state.providerCredentials.groqApiKey,'session-groq-key');
  await w.send({action:'forgetProviderKeys',provider:'gemini'});
  const keys=(await w.send({action:'getProviderKeys'})).keys;
  assert.equal(keys.geminiApiKey,undefined);assert.equal(keys.groqApiKey,'session-groq-key');
  await w.send({action:'forgetProviderKeys',provider:'all'});
  assert.equal(Object.keys((await w.send({action:'getProviderKeys'})).keys).length,0);
});
test('invalid or over-budget cloud output falls back without silently clipping a message',async()=>{
  const w=worker({aiProvider:'nvidia'},async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({message:'x'.repeat(400)})}}]})}),{nvidiaApiKey:'fake'});
  const result=await w.send({action:'generateMessage',data:{profileData:{name:'Avery'},useCloud:true,provider:'nvidia',options:{format:'connection',budget:200}}});
  assert.equal(result.mode,'Local fallback');assert.ok(result.generatedMessage.length<=200);assert.match(result.warning,/budget/);
});
test('rewrite failure returns an error and never substitutes a template for user edits',async()=>{
  const w=worker({aiProvider:'nvidia'},async()=>({ok:false,status:401}),{nvidiaApiKey:'fake'});
  const result=await w.send({action:'rewriteMessage',data:{profileData:{name:'Avery'},source:'My manually edited message.',rewrite:'shorter',useCloud:true,provider:'nvidia'}});
  assert.equal(result.success,false);assert.match(result.error,/unchanged/);assert.equal(result.generatedMessage,undefined);
});
