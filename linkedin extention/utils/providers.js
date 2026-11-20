'use strict';
globalThis.Providers = (() => {
  const models={super:'nvidia/nemotron-3.5-super-vl-120b-a12b',bolt:'nvidia/nemotron-3.5-bolt-e4b'};
  // Curated text-writing adapters, not every modality a provider may expose.
  const registry={
    nvidia:{label:'NVIDIA',key:'nvidiaApiKey',keyInput:'nvidia-key',modelSetting:'nvidiaModel',modelInput:'nvidia-model',choices:[[models.super,'Nemotron Super'],[models.bolt,'Nemotron Bolt']]},
    groq:{label:'Groq',key:'groqApiKey',keyInput:'groq-key',modelSetting:'groqModel',modelInput:'groq-model',choices:[['openai/gpt-oss-20b','GPT OSS 20B'],['openai/gpt-oss-120b','GPT OSS 120B'],['llama-3.1-8b-instant','Llama 3.1 8B'],['llama-3.3-70b-versatile','Llama 3.3 70B']]},
    gemini:{label:'Google Gemini',key:'geminiApiKey',keyInput:'gemini-key',modelSetting:'geminiModel',modelInput:'gemini-model',choices:[['gemini-3.5-flash-lite','Gemini 3.5 Flash-Lite'],['gemini-3.8-flash','Gemini 3.8 Flash'],['gemini-2.5-flash-lite','Gemini 2.5 Flash-Lite · legacy'],['gemini-2.5-flash','Gemini 2.5 Flash · legacy']]},
    anthropic:{label:'Anthropic · Claude',key:'anthropicApiKey',keyInput:'api-key',modelSetting:'anthropicModel',modelInput:'anthropic-model',choices:[['claude-haiku-5-5','Claude Haiku 5.5'],['claude-sonnet-5-5','Claude Sonnet 5.5'],['claude-opus-5-5','Claude Opus 5.5']]},
    openai:{label:'OpenAI',key:'openaiApiKey',keyInput:'openai-key',modelSetting:'openaiModel',modelInput:'openai-model',choices:[['gpt-5-mini','GPT-5 mini'],['gpt-5-nano','GPT-5 nano']]}
  };
  function config(provider) {
    if (!Object.hasOwn(registry,provider)) throw new ProviderError('provider','Choose a supported AI provider.');
    return registry[provider];
  }
  function selectedModel(provider,model) {
    const choices=config(provider).choices;
    const value=model || choices[0][0];
    if (!choices.some(([id])=>id===value)) throw new ProviderError('model','Choose a supported model for the selected provider.');
    return value;
  }
  const active=new Set();
  const lastCall=new Map();
  class ProviderError extends Error {
    constructor(code,message) {super(message);this.code=code;}
  }
  function publicError(error) {
    return error instanceof ProviderError ? error.message : 'AI request failed. Check your connection and try again.';
  }
  function httpError(status) {
    if ([401,403].includes(status)) return new ProviderError('auth','Key rejected or model access unavailable. Check your key and model in Settings.');
    if (status===404) return new ProviderError('model','Selected model is unavailable. Check available models in Settings or choose another model.');
    if (status===429) return new ProviderError('rate','Provider rate limit reached. Wait before trying again; no keys were rotated.');
    if (status>=500) return new ProviderError('server','The provider is temporarily unavailable. Try again later.');
    return new ProviderError('request','Provider rejected the request. Check the selected model and account access.');
  }
  async function request({provider='nvidia',key,model,prompt,test=false}) {
    config(provider);model=selectedModel(provider,model);
    if (typeof key!=='string' || !key.trim()) throw new ProviderError('key','Add a key for this provider in Settings, or choose Local template.');
    if (active.has(provider)) throw new ProviderError('busy','An AI request is already running. Wait for it to finish.');
    if (Date.now()-(lastCall.get(provider)||0)<2000) throw new ProviderError('cooldown','Please wait two seconds before another AI request.');
    active.add(provider);lastCall.set(provider,Date.now());
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    try {
      const anthropic=provider==='anthropic',gemini=provider==='gemini';
      const endpoints={nvidia:'https://integrate.api.nvidia.com/v1/chat/completions',groq:'https://api.groq.com/openai/v1/chat/completions',openai:'https://api.openai.com/v1/chat/completions',anthropic:'https://api.anthropic.com/v1/messages',gemini:`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`};
      const headers=anthropic?{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}:gemini?{'Content-Type':'application/json','x-goog-api-key':key}:{'Content-Type':'application/json',Authorization:`Bearer ${key}`};
      const messages=[{role:'system',content:prompt.system},{role:'user',content:prompt.user}];
      const body=anthropic?{model,max_tokens:test?256:1200,system:prompt.system,messages:[{role:'user',content:prompt.user}]}:
        gemini?{systemInstruction:{parts:[{text:prompt.system}]},contents:[{role:'user',parts:[{text:prompt.user}]}],generationConfig:{maxOutputTokens:test?512:2048,responseMimeType:'application/json'}}:
        provider==='openai'?{model,stream:false,store:false,max_completion_tokens:test?512:1600,reasoning_effort:'minimal',messages,response_format:{type:'json_object'}}:
        provider==='groq'?{model,stream:false,max_completion_tokens:test?512:1600,temperature:0.65,messages,response_format:{type:'json_object'},...(model.startsWith('openai/gpt-oss-')?{reasoning_effort:'low',include_reasoning:false}:{})}:
        {model,stream:false,max_tokens:test?64:1200,temperature:0.65,messages,response_format:{type:'json_object'},
          ...(model===models.super?{reasoning_effort:'none'}:{chat_template_kwargs:{enable_thinking:false}})};
      const response=await fetch(endpoints[provider],{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal,redirect:'error'});
      if (!response.ok) throw httpError(response.status);
      const data=await response.json();
      const output=anthropic?(data.content || []).filter(c=>c.type==='text').map(c=>c.text || '').join(''):gemini?(data.candidates?.[0]?.content?.parts || []).filter(p=>!p.thought).map(p=>p.text || '').join(''):data.choices?.[0]?.message?.content;
      if (typeof output!=='string' || !output.trim() || output.length>16000 || output.includes(key)) throw new ProviderError('output','Provider returned an unusable response. Your existing draft is safe.');
      return output;
    } catch(error) {
      if (controller.signal.aborted || error?.name==='AbortError') throw new ProviderError('timeout','AI request timed out after 25 seconds. Try again or use Local template.');
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('network','Could not reach the AI provider. Check your connection.');
    } finally {clearTimeout(timer);active.delete(provider);}
  }
  async function listModels({provider,key}) {
    const cfg=config(provider);
    if (!key?.trim()) throw new ProviderError('key','Enter the selected provider key first.');
    if (provider==='nvidia') return cfg.choices.map(([id,label])=>({id,label}));
    if (active.has(provider)) throw new ProviderError('busy','An AI request is already running. Wait for it to finish.');
    active.add(provider);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    const roots={groq:'https://api.groq.com/openai/v1/models',openai:'https://api.openai.com/v1/models',anthropic:'https://api.anthropic.com/v1/models?limit=100',gemini:'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100'};
    const headers=provider==='anthropic'?{'x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}:provider==='gemini'?{'x-goog-api-key':key}:{Authorization:`Bearer ${key}`};
    try {
      const ids=new Set();let next='';
      for(let page=0;page<5;page++) {
        const url=roots[provider]+(next?`${roots[provider].includes('?')?'&':'?'}${provider==='gemini'?'pageToken':'after_id'}=${encodeURIComponent(next)}`:'');
        const response=await fetch(url,{headers,signal:controller.signal,redirect:'error'});
        if (!response.ok) throw httpError(response.status);
        const data=await response.json();
        for(const item of (provider==='gemini'?data.models:data.data) || []) {
          if (provider==='gemini' && !item.supportedGenerationMethods?.includes('generateContent')) continue;
          if (item.active===false) continue;
          ids.add(provider==='gemini'?String(item.name || '').replace(/^models\//,''):item.id);
        }
        next=provider==='gemini'?data.nextPageToken:provider==='anthropic' && data.has_more?data.last_id:'';
        if (!next) break;
        if(page===4) throw new ProviderError('models','Model list was too large to finish. Existing choices are unchanged; test a selected model instead.');
      }
      const available=cfg.choices.filter(([id])=>ids.has(id)).map(([id,label])=>({id,label}));
      if (!available.length) throw new ProviderError('models','No supported text-writing models were listed for this key. Existing choices are unchanged. Check account access or test a selected model.');
      return available;
    } catch(error) {
      if (controller.signal.aborted || error?.name==='AbortError') throw new ProviderError('timeout','Model lookup timed out. Existing choices are unchanged.');
      if(error instanceof ProviderError) throw error;
      throw new ProviderError('network','Could not load models. Existing choices are unchanged.');
    } finally {clearTimeout(timer);active.delete(provider);}
  }
  return {models,registry,config,selectedModel,request,listModels,publicError};
})();
