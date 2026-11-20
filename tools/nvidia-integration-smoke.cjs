// Actual extension worker/provider code, real API, FICTIONAL context only.
// Never loads a real profile or resume; never saves a key into the extension.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const env={};
for(const line of fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/)) {
  const match=line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if(match) env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2').replace(/\s+#.*$/,'').trim();
}
const key=env.api_key_1;
if(!key) throw new Error('api_key_1 is missing. No credentials were printed.');
const store={providerCredentials:{nvidiaApiKey:key},userName:'Jordan Example',userBio:'Computing student seeking AI product engineering internships.',senderHighlights:'Built a RAG assistant with Python and FastAPI.',aiProvider:'nvidia',nvidiaModel:'nvidia/nemotron-3.5-super-vl-120b-a12b'};
let listener;
const ctx=vm.createContext({URL,AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{
  assert.equal(url,'https://integrate.api.nvidia.com/v1/chat/completions');return fetch(url,options);
},chrome:{runtime:{id:'integration-smoke',getURL:p=>`chrome-extension://integration-smoke/${p}`,onMessage:{addListener(fn){listener=fn;}}},storage:{
  local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in store).map(k=>[k,store[k]])),set:async value=>Object.assign(store,value),remove:async keys=>{for(const k of keys)delete store[k];},setAccessLevel:async()=>{}},
  session:{get:async()=>({}),remove:async()=>{}}
}}});
ctx.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(root,'linkedin extention',file),'utf8'),ctx));
vm.runInContext(fs.readFileSync(path.join(root,'linkedin extention/background.js'),'utf8'),ctx);
const send=message=>new Promise(resolve=>listener(message,{id:'integration-smoke',url:'chrome-extension://integration-smoke/popup.html'},resolve));
const results=[];
const data={profileData:{name:'Avery Demo',currentTitle:'AI Engineer',currentCompany:'Example Labs',headline:'Builds retrieval products'},messageType:'Internship',tone:'Neutral',goal:'Are there AI engineering internships on your team?',useCloud:true,provider:'nvidia'};
(async()=>{
  for(const [model,format,budget] of [['super','connection',200],['bolt','direct',700]]) {
    store.nvidiaModel=ctx.Providers.models[model];
    const start=performance.now();
    const result=await send({action:'generateMessage',data:{...data,options:{format,budget}}});
    if(!result.success || !result.mode.includes('NVIDIA')) throw new Error(`${model} generation: ${result.error || result.warning || result.mode}`);
    assert.equal(result.success,true);assert.match(result.mode,/NVIDIA/);assert.ok(ctx.Writer.count(result.generatedMessage)<=budget);
    results.push({case:`${model}-${format}`,mode:result.mode,milliseconds:Math.round(performance.now()-start),characters:ctx.Writer.count(result.generatedMessage),budget,message:result.generatedMessage,evidence:result.evidence});
    console.log(`PASS ${model} ${format}: ${results.at(-1).characters}/${budget} characters`);
    await new Promise(resolve=>setTimeout(resolve,2100));
  }
  const previous=results[1];store.nvidiaModel=ctx.Providers.models.super;
  const result=await send({action:'rewriteMessage',data:{...data,source:previous.message,context:ctx.Writer.context(data.profileData,store,data.messageType,data.tone,data.goal),rewrite:'shorter',options:{format:'direct',budget:700}}});
  if(!result.success)throw new Error(`Shorter: ${result.error}`);
  assert.equal(result.success,true);assert.match(result.mode,/NVIDIA/);assert.notEqual(result.generatedMessage,previous.message);
  assert.ok(ctx.Writer.count(result.generatedMessage)<ctx.Writer.count(previous.message));
  results.push({case:'super-shorter',mode:result.mode,message:result.generatedMessage,characters:ctx.Writer.count(result.generatedMessage),evidence:result.evidence});
  const report=JSON.stringify({fixture:'All names, companies and sender evidence fictional. Actual extension worker/provider code. One key only; no account/key rotation.',results},null,2);
  if(report.includes(key))throw new Error('Credential detected in report; refused to save.');
  fs.writeFileSync(path.join(root,'qa/nvidia-live-smoke.json'),report);
  console.log('PASS real shorter rewrite. Saved secret-free fictional-data report.');
})().catch(error=>{console.error('Live smoke failed: '+String(error.message).split(key).join('[REDACTED]').replace(/nvapi-[A-Za-z0-9_-]+/g,'[REDACTED]'));process.exitCode=1;});
