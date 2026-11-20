const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(fetch,fastTimeout=false) {
  const ctx=vm.createContext({fetch,AbortController,URL,setTimeout:fastTimeout?(fn=>setTimeout(fn,5)):setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync('linkedin extention/utils/providers.js','utf8'),ctx,{filename:require('node:path').resolve('linkedin extention/utils/providers.js')});
  return ctx.Providers;
}
const base=P=>({provider:'nvidia',key:'test-secret',model:P.models.super,prompt:{system:'Return JSON.',user:'Fictional test only.'}});
test('NVIDIA uses official endpoint, allowlisted model and separate system/data messages',async()=>{
  let request;
  const P=setup(async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({choices:[{message:{content:'{"message":"Hello."}'}}]})};});
  const output=await P.request(base(P));
  assert.equal(output,'{"message":"Hello."}');assert.equal(request.url,'https://integrate.api.nvidia.com/v1/chat/completions');
  const body=JSON.parse(request.body);assert.equal(body.reasoning_effort,'none');assert.equal(body.stream,false);
  assert.equal(body.messages[0].role,'system');assert.equal(request.headers.Authorization,'Bearer test-secret');
});
test('Bolt disables hidden reasoning and never receives an Anthropic key header',async()=>{
  let request;const P=setup(async(url,options)=>{request=options;return {ok:true,json:async()=>({choices:[{message:{content:'{"message":"Hi."}'}}]})};});
  await P.request({...base(P),model:P.models.bolt});
  assert.equal(JSON.parse(request.body).chat_template_kwargs.enable_thinking,false);assert.equal(request.headers['x-api-key'],undefined);
});
for (const [status,code] of [[401,'auth'],[403,'auth'],[404,'model'],[429,'rate'],[503,'server']]) {
  test(`HTTP ${status} produces a safe actionable ${code} error without raw response body`,async()=>{
    const P=setup(async()=>({ok:false,status,json:async()=>({error:'test-secret raw internal data'})}));
    await assert.rejects(P.request(base(P)),error=>error.code===code && !error.message.includes('test-secret'));
  });
}
test('invalid provider/model rejected before fetch',async()=>{
  let calls=0;const P=setup(async()=>{calls++;});
  await assert.rejects(P.request({...base(P),model:'unapproved/model'}));
  await assert.rejects(P.request({...base(P),provider:'unknown'}));assert.equal(calls,0);
});
test('timeout aborts the provider request and clears the busy guard',async()=>{
  const P=setup(async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))),true);
  await assert.rejects(P.request(base(P)),error=>error.code==='timeout');
});
test('duplicate in-flight requests are rejected without issuing another request',async()=>{
  let release,calls=0;
  const P=setup(async()=>{calls++;await new Promise(resolve=>{release=resolve;});return {ok:true,json:async()=>({choices:[{message:{content:'{"message":"Hi."}'}}]})};});
  const first=P.request(base(P));await assert.rejects(P.request(base(P)),error=>error.code==='busy');
  release();await first;assert.equal(calls,1);
});
test('credential echo and missing completion are never returned as draft text',async()=>{
  const P=setup(async()=>({ok:true,json:async()=>({choices:[{message:{content:'test-secret'}}]})}));
  await assert.rejects(P.request(base(P)),error=>error.code==='output');
});

for (const provider of ['groq','gemini','anthropic','openai']) {
  test(`${provider} routes only its own auth and request schema to its official endpoint`,async()=>{
    let seen;
    const P=setup(async(url,opts)=>{seen={url,...opts};return {ok:true,json:async()=>provider==='gemini'?{candidates:[{content:{parts:[{text:'private reasoning',thought:true},{text:'{"message":"Hi."}'}]}}]}:provider==='anthropic'?{content:[{type:'thinking',thinking:'private reasoning'},{type:'text',text:'{"message":"Hi."}'}]}:{choices:[{message:{content:'{"message":"Hi."}'}}]}};});
    const cfg=P.config(provider);
    assert.equal(await P.request({provider,key:'selected-provider-secret',model:cfg.choices[0][0],prompt:{system:'Return JSON.',user:'Fictional only'}}),'{"message":"Hi."}');
    const body=JSON.parse(seen.body);assert.equal(seen.redirect,'error');
    const urls={groq:'https://api.groq.com/openai/v1/chat/completions',gemini:'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',anthropic:'https://api.anthropic.com/v1/messages',openai:'https://api.openai.com/v1/chat/completions'};
    assert.equal(seen.url,urls[provider]);assert.ok(!seen.url.includes('selected-provider-secret'));
    if(provider==='gemini') {
      assert.equal(seen.headers['x-goog-api-key'],'selected-provider-secret');assert.equal(seen.headers.Authorization,undefined);
      assert.equal(body.generationConfig.responseMimeType,'application/json');assert.equal(body.systemInstruction.parts[0].text,'Return JSON.');
    } else if(provider==='anthropic') {
      assert.equal(seen.headers['x-api-key'],'selected-provider-secret');assert.equal(body.system,'Return JSON.');assert.equal(body.messages[0].role,'user');
    } else {
      assert.equal(seen.headers.Authorization,'Bearer selected-provider-secret');assert.equal(seen.headers['x-goog-api-key'],undefined);assert.equal(seen.headers['x-api-key'],undefined);
      assert.equal(body.messages[0].role,'system');assert.equal(body.response_format.type,'json_object');assert.equal(body.chat_template_kwargs,undefined);
      if(provider==='openai'){assert.equal(body.temperature,undefined);assert.equal(body.reasoning_effort,'minimal');assert.equal(body.store,false);}
      else {assert.equal(body.reasoning_effort,'low');assert.equal(body.include_reasoning,false);}
    }
  });
  test(`${provider} model lookup filters to supported text models and sends no personal prompt`,async()=>{
    let seen;
    const P=setup(async(url,opts)=>{seen={url,...opts};return {ok:true,json:async()=>provider==='gemini'?{models:[{name:'models/gemini-3.5-flash-lite',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.8-flash',supportedGenerationMethods:['embedContent']},{name:'models/private-unhandled',supportedGenerationMethods:['generateContent']}]}:{data:[{id:provider==='groq'?'openai/gpt-oss-20b':provider==='openai'?'gpt-5-mini':'claude-haiku-5-5'},{id:'unhandled-model'},{id:'whisper-large-v3'}]}};});
    const result=await P.listModels({provider,key:'selected-provider-secret'});
    assert.equal(result.length,1);assert.equal(seen.body,undefined);assert.ok(!seen.url.includes('selected-provider-secret'));
    assert.equal(seen.redirect,'error');assert.ok(!JSON.stringify(result).includes('selected-provider-secret'));
  });
}
test('models cannot be swapped across providers or used as URLs',async()=>{
  let calls=0;const P=setup(async()=>{calls++;});
  for(const provider of Object.keys(P.registry)) {
    for(const model of ['https://evil.test/key','../foo','gpt-unknown'])await assert.rejects(P.request({provider,key:'fake-key',model}),e=>e.code==='model');
  }
  assert.equal(calls,0);
});
test('Gemini models pagination stays on fixed host and filters generation capability',async()=>{
  const urls=[];const P=setup(async(url)=>{urls.push(url);return {ok:true,json:async()=>urls.length===1?{models:[],nextPageToken:'token /?'}:{models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']}]}};});
  assert.equal((await P.listModels({provider:'gemini',key:'fake'}))[0].id,'gemini-3.8-flash');
  assert.match(urls[1],/pageToken=token%20%2F%3F$/);assert.equal(urls.length,2);
});
test('model lookup errors never expose key or provider response body',async()=>{
  const P=setup(async()=>({ok:false,status:401,json:async()=>({error:'fake-private-key'})}));
  await assert.rejects(P.listModels({provider:'groq',key:'fake-private-key'}),e=>e.code==='auth' && !e.message.includes('fake-private-key'));
});
test('model lookup aborts on timeout and rejects malformed lists safely',async()=>{
  const P=setup(async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))),true);
  await assert.rejects(P.listModels({provider:'gemini',key:'fake'}),e=>e.code==='timeout');
  const Q=setup(async()=>({ok:true,json:async()=>({data:{private:'not an array'}})}));
  await assert.rejects(Q.listModels({provider:'groq',key:'fake'}),e=>e.code==='network');
});
test('model listing prevents simultaneous generation on the same provider',async()=>{
  let release;const P=setup(async()=>{await new Promise(resolve=>{release=resolve;});return {ok:true,json:async()=>({data:[{id:'gpt-5-mini'}]})};});
  const listing=P.listModels({provider:'openai',key:'fake'});
  await assert.rejects(P.request({provider:'openai',key:'fake',prompt:{}}),e=>e.code==='busy');
  release();assert.equal((await listing).length,1);
});
