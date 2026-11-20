'use strict';
importScripts('utils/outreach.js','utils/writer.js','utils/providers.js','utils/credentials.js');
// Restrict local storage as soon as the worker starts, including after Reload.
CredentialStore.initialize().catch(()=>{});
let writeQueue = Promise.resolve();
const RECENT_LIMIT=20;
let deletedDraft=null;
function serializeWrite(task) {
  const work=writeQueue.then(task);
  writeQueue=work.catch(()=>{});
  return work;
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if (sender.id!==chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  const handle = async () => {
    await CredentialStore.initialize();
    if(message.action==='getProviderKeys')return {success:true,keys:await CredentialStore.read()};
    if(message.action==='saveProviderKeys')return {success:true,keys:await serializeWrite(()=>CredentialStore.save(message.keys || {}))};
    if(message.action==='forgetProviderKeys')return {success:true,keys:await serializeWrite(()=>CredentialStore.forget(message.provider))};
    if(message.action==='getDrafts')return serializeWrite(async()=>{
      const {recentContacts=[]}=await chrome.storage.local.get('recentContacts');
      const contacts=recentContacts.filter(d=>d && typeof d.message==='string').map(d=>({...d,id:d.id || d.profileUrl || `manual:${crypto.randomUUID()}`})).slice(0,RECENT_LIMIT);
      if(JSON.stringify(contacts)!==JSON.stringify(recentContacts))await chrome.storage.local.set({recentContacts:contacts});
      return {success:true,drafts:contacts};
    });
    if(message.action==='deleteDraft')return serializeWrite(async()=>{
      const {recentContacts=[],currentDraft}=await chrome.storage.local.get(['recentContacts','currentDraft']);
      const entry=recentContacts.find(d=>d.id===message.id);
      if(!entry)throw new Error('This draft is no longer in Recent. Refresh the list.');
      const deletedCurrent=currentDraft?.id===entry.id;
      await chrome.storage.local.set({recentContacts:recentContacts.filter(d=>d.id!==entry.id)});
      if(deletedCurrent)await chrome.storage.local.remove(['currentDraft']);
      deletedDraft={draft:entry,token:crypto.randomUUID(),expiresAt:Date.now()+30000};
      return {success:true,undoToken:deletedDraft.token,expiresAt:deletedDraft.expiresAt,deletedCurrent};
    });
    if(message.action==='undoDeleteDraft')return serializeWrite(async()=>{
      if(!deletedDraft || deletedDraft.token!==message.token || Date.now()>deletedDraft.expiresAt)throw new Error('Undo expired. Only the most recent deletion can be undone for 30 seconds.');
      const {recentContacts=[],currentDraft}=await chrome.storage.local.get(['recentContacts','currentDraft']);
      if(recentContacts.some(d=>d.id===deletedDraft.draft.id))throw new Error('A newer draft already exists for this recipient. Undo will not overwrite it.');
      const restored=deletedDraft.draft;
      const update={recentContacts:[restored,...recentContacts].slice(0,RECENT_LIMIT)};
      if(!currentDraft)update.currentDraft=restored;
      await chrome.storage.local.set(update);deletedDraft=null;
      return {success:true,restored,restoredCurrent:!currentDraft};
    });
    if (message.action==='scrapeProfile') return {success:true,data:await scrapeActiveProfile()};
    if (message.action==='saveDraft') {
      await serializeWrite(async()=>{
        const draft=message.draft;
        if (!draft?.id || typeof draft.message!=='string' || draft.message.length>12000) throw new Error('Invalid draft.');
        const {recentContacts=[]}=await chrome.storage.local.get('recentContacts');
        const update={currentDraft:draft};
        if (draft.hasGenerated) update.recentContacts=[{...draft,name:draft.profile?.name || 'Manual recipient',profileUrl:draft.profile?.profileUrl || '',headline:draft.profile?.headline || '',timestamp:Date.now()},...recentContacts.filter(c=>(c.id || c.profileUrl)!==draft.id)].slice(0,RECENT_LIMIT);
        await chrome.storage.local.set(update);
      });
      return {success:true};
    }
    if (['generateMessage','rewriteMessage'].includes(message.action)) return writeMessage(message);
    if (message.type==='LIST_MODELS') {
      try {return {success:true,models:await Providers.listModels(message.payload || {})};}
      catch(error) {return {success:false,error:Providers.publicError(error)};}
    }
    if (message.type==='TEST_API_KEY') {
      try {
        await Providers.request({provider:message.payload.provider || 'anthropic',key:message.payload.apiKey,model:message.payload.model,
          test:true,prompt:{system:'Reply with exactly a JSON object with key message and value OK.',user:'This is a connection test with no personal data.'}});
        return {success:true,valid:true};
      } catch(error) {return {success:true,valid:false,reason:Providers.publicError(error)};}
    }
    throw new Error('Unknown request.');
  };
  handle().then(reply).catch(error=>reply({success:false,error:error.message}));
  return true;
});
async function scrapeActiveProfile() {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if (!Outreach.profileUrl(tab?.url)) throw new Error('Open a LinkedIn /in/ profile, or enter recipient details manually.');
  let response;
  try {response=await chrome.tabs.sendMessage(tab.id,{action:'scrapeProfile'});}
  catch {
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['utils/outreach.js','content_script.js']});
    response=await chrome.tabs.sendMessage(tab.id,{action:'scrapeProfile'});
  }
  if (!response?.success) throw new Error(response?.error || 'Profile could not be read. Enter details manually.');
  return response.data;
}
async function writeMessage(message) {
  const data=message.data || {}, rewriting=message.action==='rewriteMessage';
  const settings=await chrome.storage.local.get(['userName','userBio','senderHighlights','userApiKey','aiProvider',...Object.values(Providers.registry).map(p=>p.modelSetting)]);
  const sender=rewriting?settings:Writer.selectHighlights(data.demoMode?Writer.demoSender:settings,data.highlightMode,data.selectedHighlight);
  const ctx=data.demoMode && !rewriting
    ? Writer.context({name:'Avery Demo',headline:'AI Engineer at Example Labs',currentTitle:'AI Engineer',currentCompany:'Example Labs'},
        sender,data.messageType,data.tone,data.goal)
    : rewriting && data.context
    ? Writer.context(data.context.recipient,{userName:data.context.sender?.name,userBio:data.context.sender?.bio,senderHighlights:data.context.sender?.highlights},data.context.purpose,data.context.tone,data.context.ask)
    : Writer.context(data.profileData,sender,data.messageType,data.tone,data.goal);
  if (!ctx.recipient.name) throw new Error('Add and check the recipient’s name before generating.');
  const opts=Writer.options(data.options),action=rewriting?data.rewrite:'generate';
  if (rewriting && (!['shorter','warmer','direct'].includes(action) || typeof data.source!=='string' || !data.source.trim() || data.source.length>12000)) throw new Error('Choose a rewrite action and a valid current draft.');
  const finish=(text,mode,warning='')=>({success:true,generatedMessage:text,mode,warning,context:ctx,evidence:Writer.explain(text,ctx),options:opts});
  const previous=typeof data.previous==='string'?data.previous.slice(0,12000):'';
  const local=()=>rewriting ? Writer.localRewrite(data.source,action,opts.budget,ctx.ask) : Writer.localDraft(ctx,opts,previous).message;
  if (!data.useCloud) return finish(local(),rewriting?'Local editing rules':'Local template');
  // Selecting a named cloud writer and pressing Generate/Rewrite is the action;
  // no repeated consent checkboxes. Never infer the provider from Settings.
  const provider=data.provider;
  const cfg=Providers.config(provider);
  const credentials=await CredentialStore.read();
  const key=credentials[cfg.key];
  if (!key) throw new Error('Save a key for the selected provider in Your context, or choose Local template.');
  const model=Providers.selectedModel(provider,data.model || settings[cfg.modelSetting]);
  try {
    const raw=await Providers.request({provider,key,model,prompt:Writer.prompt(ctx,opts,action,rewriting?data.source:'')});
    const text=Writer.parseResponse(raw,opts.budget);
    if (!rewriting && previous && text.trim()===previous.trim()) throw new Error('The AI repeated the previous draft.');
    if (rewriting && action==='shorter' && Writer.count(text)>=Writer.count(data.source)) throw new Error('The AI did not shorten this draft.');
    if (rewriting && text.trim()===data.source.trim()) throw new Error('The AI returned the same draft. Try another rewrite; your draft is unchanged.');
    return finish(text,provider==='nvidia'?`NVIDIA · ${model===Providers.models.bolt?'Bolt':'Super'}`:provider==='anthropic'?'Anthropic AI':`${cfg.label} · ${model}`);
  } catch(error) {
    const safeWritingErrors=['The AI draft exceeded the character budget.','The AI response was not a valid draft.','The AI returned an empty draft.','The AI repeated the previous draft.','The AI did not shorten this draft.','The AI returned the same draft. Try another rewrite; your draft is unchanged.'];
    const reason=safeWritingErrors.includes(error.message)?error.message:Providers.publicError(error);
    if (rewriting) throw new Error(`${reason} Your existing draft is unchanged.`);
    return finish(local(),'Local fallback',`${reason} A local template was created instead; no automatic retry or provider/key rotation was made.`);
  }
}
