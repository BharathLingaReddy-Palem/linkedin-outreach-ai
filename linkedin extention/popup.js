'use strict';
// Preserve the original popup/settings/recent architecture; make review explicit.
const $ = id => document.getElementById(id);
let currentProfile=null, draftId='', hasGenerated=false, draftMode='', busy=false;
let savedSettings={}, resumeFileName='', extractedFileName='', saveRevision=0, replacementArmed=false;
let sourceContext=null, undoState=null, demoMode=false, savedCredentials={};
let recipientMismatch=false;
let providerBusy=false;
let highlightMode='auto',selectedHighlight='',recentRevision=0,recentBusy=false,deleteUndo=null,deleteTimer;
const providerConfigs=Object.entries(Providers.registry);
const settingsKeys=['userName','userBio','senderHighlights','userApiKey','resumeFileName','aiProvider',...providerConfigs.map(([,p])=>p.modelSetting)];
const fieldMap={'recipient-name':'name','recipient-headline':'headline','recipient-role':'currentTitle','recipient-company':'currentCompany'};
document.addEventListener('DOMContentLoaded',()=>boot().catch(error=>status('status-message',error.message,'error')));

async function boot() {
  $('app-version').textContent=' · v'+chrome.runtime.getManifest().version;
  document.querySelectorAll('.tab-btn').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.tab)));
  $('scrape-btn').addEventListener('click',readProfile);
  $('manual-btn').addEventListener('click',()=>beginRecipient({},false));
  $('demo-btn').addEventListener('click',()=>{
    beginRecipient({name:'Avery Demo',headline:'AI Engineer at Example Labs',currentTitle:'AI Engineer',currentCompany:'Example Labs'},false);
    demoMode=true;highlightMode='auto';selectedHighlight='';$('outreach-goal').value='';renderSenderSummary();persistDraft();
    status('status-message','Fictional demo: Avery Demo + Jordan Example. Your saved sender settings have not been changed. Review the recipient, then generate.','success');
  });
  $('edit-sender').addEventListener('click',()=>switchTab('settings'));
  $('generate-btn').addEventListener('click',()=>generate(false));
  $('generate-fix-btn').addEventListener('click',resolveGenerateBlocker);
  $('regenerate-btn').addEventListener('click',()=>generate(true));
  $('copy-btn').addEventListener('click',()=>copyText($('generated-message').value,'status-message',Number($('char-budget').value)));
  ['shorter','warmer','direct'].forEach(action=>$(action+'-btn').addEventListener('click',()=>rewrite(action)));
  $('undo-btn').addEventListener('click',undoRewrite);
  $('ai-provider').addEventListener('change',()=>{renderProviderSettings();updateGenerateState();});
  providerConfigs.forEach(([,p])=>[p.keyInput,p.modelInput].forEach(id=>$(id).addEventListener('input',()=>{
    $('key-validation-status').textContent='Key/model changed. Test again, then save.';
    
    if(id===p.keyInput) {populateModelChoices(p,$(p.modelInput).value);$('model-list-status').textContent='Key changed: showing supported choices. Check available models again for this key.';}
    updateGenerateState();
  })));
  $('save-settings-btn').addEventListener('click',saveSettings);
  $('validate-btn').addEventListener('click',testKey);
  $('load-models-btn').addEventListener('click',loadModels);
  $('forget-key-btn').addEventListener('click',()=>forgetKeys($('ai-provider').value));
  $('forget-all-keys-btn').addEventListener('click',()=>forgetKeys('all'));
  $('configure-provider-btn').addEventListener('click',()=>openProviderSettings($('writer-mode').value));
  $('compose-model').addEventListener('change',()=>{replacementArmed=false;updateGenerateState();});
  $('writer-mode').addEventListener('change',()=>{populateComposeModels();updateGenerateState();});
  $('highlight-choice').addEventListener('change',()=>{
    const value=$('highlight-choice').value;highlightMode=['auto','bio'].includes(value)?value:'selected';selectedHighlight=highlightMode==='selected'?value:'';
    replacementArmed=false;renderHighlightChoices();updateGenerateState();persistDraft();
    if(hasGenerated)status('status-message','Highlight set for the next draft. Your existing wording is unchanged.');
  });
  $('recipient-editor').addEventListener('toggle',()=>persistDraft());
  $('recent-search').addEventListener('input',()=>renderRecentContacts().catch(error=>status('recent-status',error.message,'error')));
  $('clear-recent-search').addEventListener('click',()=>{$('recent-search').value='';renderRecentContacts().catch(error=>status('recent-status',error.message,'error'));});
  $('undo-delete-btn').addEventListener('click',undoDraftDeletion);
  $('resume-upload').addEventListener('change',event=>processResumeFile(event.target.files[0]));
  $('use-resume-lines').addEventListener('click',()=>{
    const lines=Array.from($('resume-candidates').querySelectorAll('input:checked')).map(input=>input.value);
    const result=lines.join('\n');
    if (!result) return status('resume-status','Select at least one relevant line first.','warning');
    if (result.length>700) return status('resume-status','Select fewer lines (700 characters maximum), or edit the highlights manually.','warning');
    $('sender-highlights').value=result;
    resumeFileName=extractedFileName;
    status('resume-status','Selected evidence added. Review the highlights, then Save sender settings.','success');
  });
  Object.keys(fieldMap).forEach(id=>$(id).addEventListener('input',()=>{
    if(demoMode){highlightMode='auto';selectedHighlight='';}demoMode=false;renderSenderSummary();
    currentProfile={...(currentProfile || {}),[fieldMap[id]]:$(id).value};
    if (id==='recipient-role' || id==='recipient-company') {
      currentProfile.fieldSources={...currentProfile.fieldSources,[id==='recipient-role'?'role':'company']:'Manual entry'};
      if (currentProfile.fieldSources.role==='Manual entry' && currentProfile.fieldSources.company==='Manual entry') currentProfile.employmentLinked=true;
    }
    
    replacementArmed=false;
    renderProfileCard(); updateGenerateState(); persistDraft();
  }));
  ['message-type','tone','outreach-goal','writer-mode','message-format','char-budget'].forEach(id=>$(id).addEventListener(['outreach-goal','char-budget'].includes(id)?'input':'change',()=>{
    if(id==='message-format') {$('char-budget').max=$('message-format').value==='connection'?'500':'2000';$('char-budget').value=$('message-format').value==='connection'?'200':'700';}
    
    replacementArmed=false; updateGenerateState(); persistDraft();updateCharCount();
    $('goal-hint').textContent=$('message-type').value==='FollowUp'?'Use follow-up only if you really contacted this person before.':'Write it as you would say it. An empty field uses the purpose’s default ask.';
  }));
  $('generated-message').addEventListener('input',()=>{replacementArmed=false;undoState=null;updateCharCount();renderEvidence();updateGenerateState();persistDraft();});
  savedCredentials=(await send({action:'getProviderKeys'})).keys;
  savedSettings=await chrome.storage.local.get(settingsKeys);
  fillSettings(savedSettings);
  // Old versions kept a PDF blob but never used it. Remove that unused copy.
  await chrome.storage.local.remove('resumeBase64');
  const {currentDraft}=await chrome.storage.local.get('currentDraft');
  if (currentDraft) restoreDraft(currentDraft);
  await checkCurrentPage(); await renderRecentContacts(); updateGenerateState();
}
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(button=>{const active=button.dataset.tab===name;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  document.querySelectorAll('.tab-content').forEach(panel=>panel.classList.toggle('active',panel.id===`tab-${name}`));
  if (name==='recent') renderRecentContacts().catch(error=>status('recent-status',error.message,'error'));
}
function status(id,message,type='') {
  $(id).textContent=message; $(id).className=`status-bar ${type ? `status-${type}` : ''}`;
}
async function checkCurrentPage() {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const url=Outreach.profileUrl(tab?.url);
  $('page-warning').classList.toggle('hidden',!!url);
  $('scrape-btn').disabled=!url;
  recipientMismatch=!!(currentProfile?.profileUrl && url && currentProfile.profileUrl!==url);
  if (currentProfile?.profileUrl && url && currentProfile.profileUrl!==url) {
    status('profile-warning','This saved draft belongs to a different profile. Read the current profile to start its draft. Your previous draft remains in Recent.','warning');
  }
}
async function readProfile() {
  if (busy) return;
  busy=true; $('scrape-btn').disabled=true; $('scrape-btn').textContent='Reading…'; updateGenerateState();
  try {
    const response=await send({action:'scrapeProfile'});
    const same=!!currentProfile?.profileUrl && currentProfile.profileUrl===response.data.profileUrl;
    beginRecipient(response.data,same);
    status('status-message','Profile ready. You can generate now; checking or editing details is optional.','success');
  } catch(error) {
    status('status-message',error.message,'error');
    $('manual-btn').focus();
  } finally {busy=false;$('scrape-btn').textContent=currentProfile?'Refresh profile':'Read profile';await checkCurrentPage();updateGenerateState();}
}
function beginRecipient(raw,keepMessage) {
  recipientMismatch=false;
  demoMode=false;
  currentProfile=Outreach.normalizeProfile(raw);
  draftId=currentProfile.profileUrl || `manual:${crypto.randomUUID()}`;
  $('recipient-fields').classList.remove('hidden');
  $('recipient-editor').classList.remove('hidden');$('recipient-editor').open=!currentProfile.name;$('review-badge').textContent='Optional';
  Object.entries(fieldMap).forEach(([id,key])=>{$(id).value=currentProfile[key] || '';});
  
  if (!keepMessage) {hasGenerated=false;$('generated-message').value='';$('message-section').classList.add('hidden');draftMode='';sourceContext=null;undoState=null;}
  $('profile-source').textContent=currentProfile.profileUrl ? `Name source: ${raw.nameSource || 'Reviewed profile'}. Only visible page details; no web search.` : 'Manual recipient. Enter only details you know.';
  renderProfileCard();renderSenderSummary();updateGenerateState(); persistDraft();
  if (!currentProfile.name) $('recipient-name').focus();
}
function renderProfileCard() {
  if (!currentProfile) return;
  const p=Outreach.normalizeProfile(currentProfile);
  $('profile-section').classList.remove('hidden');
  $('profile-avatar').textContent=p.name.charAt(0).toUpperCase() || '?';
  $('manual-btn').textContent='New manual recipient';
  $('profile-name').textContent=p.name || 'Add recipient name';
  $('profile-headline').textContent=p.headline || 'No headline available';
  const missing=[!p.name && 'Name missing',!p.headline && 'Headline missing',!p.currentTitle && 'Role not verified',!p.currentCompany && 'Company not verified'].filter(Boolean);
  if (missing.length) status('profile-warning',`${missing.join(' · ')}. These fields may stay empty. Local drafts can use the headline instead.`,'warning');
  else $('profile-warning').classList.add('hidden');
  $('recipient-field-sources').textContent=[p.currentTitle?`Role source: ${p.fieldSources?.role || 'Provided details'}.`:'Role not shown; optional.',p.currentCompany?`Company source: ${p.fieldSources?.company || 'Provided details'}.`:'Company not identifiable; optional.','Headline/company labels are not proof of current employment.'].join(' ');
  $('company-candidates').replaceChildren();
  const candidates=!p.currentCompany && Array.isArray(p.companyCandidates)?p.companyCandidates:[];
  $('company-candidates').classList.toggle('hidden',!candidates.length);
  if (candidates.length) {
    const hint=document.createElement('p');hint.textContent='Visible organisation labels — choose one only if it is the relevant company:';$('company-candidates').append(hint);
    candidates.forEach(value=>{const button=document.createElement('button');button.type='button';button.className='btn btn-secondary btn-sm';button.textContent=value;button.disabled=busy;button.addEventListener('click',()=>{$('recipient-company').value=value;$('recipient-company').dispatchEvent(new Event('input',{bubbles:true}));});$('company-candidates').append(button);});
  }
}
function updateGenerateState() {
  $('review-badge').textContent='Optional';
  const provider=$('writer-mode').value,cloud=provider!=='local';
  const cfg=cloud?Providers.config(provider):null,name=cfg?.label || '';
  const key=cfg?savedCredentials[cfg.key]:'';
  providerConfigs.forEach(([id,p])=>{
    const option=$('writer-mode').querySelector(`option[value="${id}"]`);
    option.textContent=`${id==='openai'?'OpenAI · GPT (ChatGPT models)':p.label+' AI'} · ${savedCredentials[p.key]?'key saved':'add key'}`;
  });
  $('compose-model-row').classList.toggle('hidden',!cloud);
  $('cloud-data-notice').classList.toggle('hidden',!cloud);
  $('cloud-privacy-help').classList.toggle('hidden',!cloud);
  $('cloud-data-notice').textContent=cloud?`Generate/Rewrite shares selected context with ${name}. No PDF. API terms/charges apply.${provider==='nvidia'?' NVIDIA trial: use permitted non-identifying data.':''}`:'';
  $('cloud-data-details').textContent=cloud?'Shared: displayed recipient name/headline/role/company, sender name/bio, chosen highlights, goal/tone/budget and the existing draft for rewrites. No raw résumé, hidden profile sections or LinkedIn URL. Selecting a writer alone sends nothing.':'';
  $('writer-hint').textContent=cloud?'Choose a model, then generate. No checkboxes needed.':'Offline templates · no key or cloud sharing.';
  const blockers=[];
  if (!Outreach.cleanName($('recipient-name').value)) blockers.push({text:'Read a profile or enter the recipient’s name first.',target:'recipient-name',action:'Add recipient'});
  if (recipientMismatch) blockers.push({text:'The saved recipient differs from the open profile. Read the current profile first to avoid drafting for the wrong person.',target:'scrape-btn',action:'Read current profile'});
  try {Writer.options({format:$('message-format').value,budget:Number($('char-budget').value)});}
  catch(error) {blockers.push({text:error.message,target:'char-budget',action:'Fix character budget'});}
  try {Writer.selectHighlights(demoMode?Writer.demoSender:savedSettings,highlightMode,selectedHighlight);}
  catch(error){blockers.push({text:error.message,target:'highlight-choice',action:'Choose a reviewed highlight'});}
  if (cloud && !key) blockers.push({text:`Add and save an ${name} API key in Your context → AI providers. Saved keys stay on this device across reloads.`,target:cfg.keyInput,action:`Add ${name} key`});
  $('generate-btn').disabled=busy || providerBusy || blockers.length>0;
  $('generate-btn').title=busy?'A request is running.':blockers.map(item=>item.text).join('\n');
  $('generate-help').classList.toggle('hidden',busy || !blockers.length);
  const helpText=blockers.map(item=>item.text).join('');
  if ($('generate-help-list').textContent!==helpText) {
    $('generate-help-list').replaceChildren(...blockers.map(item=>{const li=document.createElement('li');li.textContent=item.text;return li;}));
  }
  $('generate-fix-btn').dataset.target=blockers[0]?.target || '';
  $('generate-fix-btn').textContent=blockers[0]?.action || 'Review recipient';
  $('generate-fix-btn').disabled=busy;
  $('company-candidates').querySelectorAll('button').forEach(button=>{button.disabled=busy;});
  $('regenerate-btn').disabled=$('generate-btn').disabled;
  $('generate-btn').textContent=busy?'Working…':hasGenerated?'Create replacement draft':'Generate draft';
  $('generate-btn').classList.toggle('btn-primary',!hasGenerated);$('generate-btn').classList.toggle('btn-secondary',hasGenerated);
  $('key-status').textContent=cloud?`${name} · cloud writer`:'Local template';
  ['shorter','warmer','direct'].forEach(action=>{$(action+'-btn').disabled=busy || !hasGenerated || (cloud && $('generate-btn').disabled);});
  $('undo-btn').disabled=busy || !undoState;
  // Freeze context during a read/write request so a response cannot land on a
  // different recipient or send context changed after the consent check.
  [...Object.keys(fieldMap),'message-type','tone','outreach-goal','highlight-choice','writer-mode','compose-model','manual-btn','demo-btn','save-settings-btn','message-format','char-budget','generated-message'].forEach(id=>{$(id).disabled=busy;});
  ['ai-provider','validate-btn','load-models-btn','save-settings-btn','forget-key-btn','forget-all-keys-btn','configure-provider-btn',...providerConfigs.flatMap(([,p])=>[p.keyInput,p.modelInput])].forEach(id=>{$(id).disabled=busy || providerBusy;});
  updateCharCount();
}
function resolveGenerateBlocker() {
  const id=$('generate-fix-btn').dataset.target;
  if (!id || busy) return;
  if (id==='scrape-btn') {readProfile();return;}
  if (id==='recipient-name') {
    if (!currentProfile) beginRecipient({},false);
    switchTab('current');$('recipient-editor').open=true;
  } else if (providerConfigs.some(([,p])=>p.keyInput===id)) {
    openProviderSettings(providerConfigs.find(([,p])=>p.keyInput===id)[0]);
  }
  $(id).scrollIntoView({block:'center'});$(id).focus({preventScroll:true});
}
async function generate(replace) {
  if (busy || $('generate-btn').disabled) return;
  if (hasGenerated && $('generated-message').value && !replacementArmed) {
    replacementArmed=true;
    status('status-message','This will replace your edited draft. Click either generate button again to confirm. Your current text is still saved.','warning');
    return;
  }
  replacementArmed=false;busy=true;updateGenerateState();
  try {
    const previous=hasGenerated?currentVersion():null;
    const response=await send({action:'generateMessage',data:{...requestData(),previous:previous?.message || ''}});
    undoState=previous;sourceContext=response.context;
    $('generated-message').value=response.generatedMessage;
    draftMode=response.mode;hasGenerated=true;
    $('draft-mode').textContent=draftMode;
    $('message-section').classList.remove('hidden');updateCharCount();renderEvidence();
    await persistDraft();
    status('status-message',response.warning || 'Draft ready. Edit it, then copy when you are happy with it.',response.warning?'warning':'success');
    $('message-section').scrollIntoView({block:'nearest'});
  } catch(error) {status('status-message',error.message,'error');}
  finally {busy=false;updateGenerateState();}
}
function draftSnapshot() {
  return {id:draftId,profile:currentProfile,message:$('generated-message').value,hasGenerated,mode:draftMode,
    messageType:$('message-type').value,tone:$('tone').value,goal:$('outreach-goal').value,recipientExpanded:$('recipient-editor').open,highlightMode,selectedHighlight,
    options:{format:$('message-format').value,budget:Number($('char-budget').value)},context:sourceContext,undo:undoState,demoMode};
}
async function persistDraft() {
  if (!currentProfile || !draftId) return;
  const revision=++saveRevision;
  $('save-status').textContent='Saving…';
  try {
    // Dispatch on every edit: persistence runs in the worker even if popup closes.
    await send({action:'saveDraft',draft:draftSnapshot()});
    if (revision===saveRevision) $('save-status').textContent='Saved on this device';
  } catch {if (revision===saveRevision) {$('save-status').textContent='Not saved';status('status-message','Could not save this draft. Copy it somewhere safe before closing.','error');}}
}
function restoreDraft(draft) {
  recipientMismatch=false;
  currentProfile=Outreach.normalizeProfile(draft.profile || {name:draft.name,headline:draft.headline,profileUrl:draft.profileUrl});
  draftId=draft.id || currentProfile.profileUrl || `manual:${crypto.randomUUID()}`;
  hasGenerated=draft.hasGenerated ?? !!draft.message;draftMode=draft.mode || 'Restored draft';
  Object.entries(fieldMap).forEach(([id,key])=>{$(id).value=currentProfile[key] || '';});
  $('recipient-fields').classList.remove('hidden');
  $('recipient-editor').classList.remove('hidden');$('recipient-editor').open=!!draft.recipientExpanded;
  $('review-badge').textContent='Optional';
  $('message-type').value=draft.messageType || 'Networking';$('tone').value=draft.tone || 'Neutral';
  $('outreach-goal').value=draft.goal || '';$('generated-message').value=draft.message || '';
  $('message-format').value=draft.options?.format || 'direct';$('char-budget').value=draft.options?.budget || 700;
  $('char-budget').max=$('message-format').value==='connection'?'500':'2000';
  sourceContext=draft.context || null;undoState=draft.undo || null;demoMode=!!draft.demoMode;
  highlightMode=draft.highlightMode || 'auto';selectedHighlight=draft.selectedHighlight || '';
  $('writer-mode').value='local';
  $('message-section').classList.toggle('hidden',!hasGenerated);
  $('draft-mode').textContent=draftMode;$('save-status').textContent='Restored from this device';
  renderProfileCard();renderSenderSummary();updateCharCount();updateGenerateState();renderEvidence();
  status('status-message','Your draft and edits have been restored.','success');
}
function updateCharCount() {
  const count=Writer.count($('generated-message').value),budget=Number($('char-budget').value);
  $('char-count').textContent=`${count} / ${budget}`;$('char-count').classList.toggle('over',count>budget);
  $('copy-btn').disabled=busy || count>budget || !count;
  $('char-count').title=count>budget?'Over your writing budget. Shorten the draft or raise the budget.':'Within your writing budget.';
}
async function copyText(value,statusId,budget=Infinity) {
  if (!value) return status(statusId,'There is no message to copy.','warning');
  if (Writer.count(value)>budget) return status(statusId,'This draft exceeds its writing budget. Shorten it or raise the budget first.','warning');
  try {await navigator.clipboard.writeText(value);status(statusId,'Copied. Nothing was sent on LinkedIn.','success');}
  catch {status(statusId,'Clipboard access failed. Select the message and copy it manually.','error');}
}
function fillSettings(settings) {
  $('user-name').value=settings.userName || '';$('user-bio').value=settings.userBio || '';
  $('sender-highlights').value=settings.senderHighlights || '';$('api-key').value=settings.userApiKey || '';
  providerConfigs.forEach(([id,p])=>{
    $(p.keyInput).value=savedCredentials[p.key] || (id==='anthropic'?settings.userApiKey:'') || '';
    populateModelChoices(p,settings[p.modelSetting]);
  });
  $('ai-provider').value=settings.aiProvider || (settings.userApiKey?'anthropic':'nvidia');
  renderProviderSettings();
  resumeFileName=settings.resumeFileName || '';
  $('resume-saved-note').textContent=resumeFileName ? `Last source: ${resumeFileName}. ${settings.senderHighlights?'Only reviewed highlights are saved.':'Re-upload to extract text; older versions did not use this PDF.'}` : '';
  renderSenderSummary();
}
function renderSenderSummary() {
  renderHighlightChoices();
  if(demoMode) {$('sender-summary').textContent='Fictional demo · Jordan Example · RAG project evidence. Saved sender context is unchanged.';return;}
  $('sender-summary').textContent=savedSettings.userName ? `From ${savedSettings.userName}${savedSettings.senderHighlights?' · selected evidence included':savedSettings.userBio?' · bio included':' · add background in Settings'}` : 'Add your name and background in Settings.';
}
function renderHighlightChoices() {
  const sender=demoMode?Writer.demoSender:savedSettings;
  const choices=Writer.highlightChoices(sender.senderHighlights),menu=$('highlight-choice');
  const options=[{value:'auto',label:choices.length?'Auto · choose one relevant detail':'Auto · use my introduction'},{value:'bio',label:'No project · use my introduction'},...choices.map(text=>({value:text,label:text.length>86?text.slice(0,83)+'…':text}))];
  if(highlightMode==='selected' && !choices.includes(selectedHighlight))options.push({value:selectedHighlight,label:'Saved choice unavailable · choose another'});
  menu.replaceChildren(...options.map(({value,label})=>{const option=document.createElement('option');option.value=value;option.textContent=label;return option;}));
  menu.value=highlightMode==='selected'?selectedHighlight:highlightMode;
  $('highlight-preview').textContent=highlightMode==='selected'?selectedHighlight:highlightMode==='bio'?(sender.userBio || 'No introduction saved. Add context when you want more than a greeting and ask.'):choices.length?`Auto selects one of ${choices.length} reviewed detail${choices.length===1?'':'s'}. Choose one above for control.`:(sender.userBio || 'Add reviewed skills/projects in Your context to personalise drafts.');
}
async function saveSettings() {
  try {
    const settings={userName:$('user-name').value.trim(),userBio:$('user-bio').value.trim(),senderHighlights:$('sender-highlights').value.trim(),aiProvider:$('ai-provider').value,resumeFileName,...Object.fromEntries(providerConfigs.map(([id,p])=>[p.modelSetting,Providers.selectedModel(id,$(p.modelInput).value)]))};
    savedCredentials=Object.fromEntries(providerConfigs.map(([,p])=>[p.key,$(p.keyInput).value.trim()]));
    savedCredentials=(await send({action:'saveProviderKeys',keys:savedCredentials})).keys;
    await chrome.storage.local.set(settings);savedSettings=settings;renderSenderSummary();
    await chrome.storage.local.remove('userApiKey');
    updateGenerateState();
    populateComposeModels({useSaved:true});updateGenerateState();
    status('settings-status','Saved. Keys are remembered on this device across reloads. Choose any saved provider in Compose.','success');
    $('resume-saved-note').textContent=resumeFileName ? `Source: ${resumeFileName}. Only reviewed highlights are saved.` : '';
  } catch {status('settings-status','Settings could not be saved. Your edits are still visible; try again.','error');}
}
async function testKey() {
  const provider=$('ai-provider').value;
  const cfg=Providers.config(provider),apiKey=$(cfg.keyInput).value.trim();
  if (!apiKey) return status('key-validation-status','Enter a key for this provider, or use local templates.','warning');
  if(providerBusy || busy)return;
  providerBusy=true;updateGenerateState();
  status('key-validation-status',`Testing ${cfg.label} key and selected model…`);
  try {
    const response=await send({type:'TEST_API_KEY',payload:{apiKey,provider,model:$(cfg.modelInput).value}});
    status('key-validation-status',response.valid?'Key and model worked. Save settings to keep them.':response.reason,response.valid?'success':'error');
  } catch {status('key-validation-status','Could not test the key. Check your connection.','error');}
  finally {providerBusy=false;updateGenerateState();}
}
function populateModelChoices(cfg,selected,choices=cfg.choices.map(([id,label])=>({id,label}))) {
  const menu=$(cfg.modelInput);
  menu.replaceChildren(...choices.map(({id,label})=>{const option=document.createElement('option');option.value=id;option.textContent=label;return option;}));
  menu.value=choices.some(item=>item.id===selected)?selected:choices[0]?.id || '';
}
async function loadModels() {
  if(providerBusy || busy)return;
  const provider=$('ai-provider').value,cfg=Providers.config(provider),apiKey=$(cfg.keyInput).value.trim();
  if(provider==='nvidia')return status('model-list-status','NVIDIA uses the two supported Nemotron choices. Test the selected key/model to check access.');
  if(!apiKey)return status('model-list-status','Enter the selected provider key first. No profile data is needed.','warning');
  providerBusy=true;updateGenerateState();status('model-list-status',`Checking ${cfg.label} supported text models…`);
  try {
    const response=await send({type:'LIST_MODELS',payload:{provider,key:apiKey}});
    populateModelChoices(cfg,$(cfg.modelInput).value,response.models);
    
    status('model-list-status',`${response.models.length} supported text model(s) listed for this key. Test your selection, then save. Listing does not guarantee generation access.`,'success');
    $('key-validation-status').textContent='Model choices updated. Test the selected key/model, then save.';
  } catch(error) {status('model-list-status',error.message,'error');}
  finally {providerBusy=false;updateGenerateState();}
}
async function processResumeFile(file) {
  if (!file) return;
  $('resume-review').classList.add('hidden');$('resume-candidates').replaceChildren();$('resume-text').value='';extractedFileName='';
  if (!/\.pdf$/i.test(file.name) || (file.type && file.type!=='application/pdf')) return status('resume-status','Choose a PDF file.','error');
  if (file.size>4*1024*1024) return status('resume-status','PDF too large. Maximum size is 4 MB.','error');
  $('resume-upload').disabled=true;$('save-settings-btn').disabled=true;
  status('resume-status','Extracting text on this device…');
  try {
    const {extractResume}=await import('./utils/resume.mjs');
    const result=await extractResume(new Uint8Array(await file.arrayBuffer()));
    extractedFileName=file.name;
    $('resume-text').value=result.text;
    result.candidates.forEach((line,index)=>{
      const label=document.createElement('label');label.className='check-row';
      const input=document.createElement('input');input.type='checkbox';input.value=line;input.id=`resume-line-${index}`;
      label.append(input,document.createTextNode(line));$('resume-candidates').append(label);
    });
    $('resume-review').classList.remove('hidden');$('resume-review').open=true;
    status('resume-status',`Read ${result.pages} page${result.pages===1?'':'s'} locally. Select relevant evidence below; your highlights have not been changed.`,'success');
  } catch(error) {status('resume-status',`${error.message || 'Could not read this PDF.'} You can paste relevant skills or projects into the highlights field instead.`,'error');}
  finally {$('resume-upload').disabled=false;$('save-settings-btn').disabled=false;$('resume-upload').value='';}
}
async function renderRecentContacts() {
  const revision=++recentRevision,contacts=await Cache.getContacts();if(revision!==recentRevision)return;
  const query=$('recent-search').value.trim().toLocaleLowerCase();
  const matches=contacts.filter(d=>[d.name,d.profile?.name,d.profile?.currentCompany,d.headline,d.profile?.headline].filter(Boolean).join(' ').toLocaleLowerCase().includes(query));
  $('recent-list').replaceChildren();$('no-recent').classList.toggle('hidden',contacts.length>0);
  $('no-recent-matches').classList.toggle('hidden',!contacts.length || matches.length>0);
  $('recent-count').textContent=query?`${matches.length} / ${contacts.length} drafts`:`${contacts.length} / 20 drafts`;
  matches.forEach(contact=>{
    const card=document.createElement('article');card.className='contact-card';
    card.dataset.draftId=contact.id;
    const name=document.createElement('h2');name.className='contact-name';name.textContent=contact.name || contact.profile?.name || 'Manual recipient';
    const company=document.createElement('p');company.className='contact-company';company.textContent=contact.profile?.currentCompany || 'Company not provided';
    const purpose=document.createElement('span');purpose.className='purpose-badge';purpose.textContent=({Internship:'Internship enquiry',Job:'Job opportunity',Referral:'Referral request',FollowUp:'Follow-up'})[contact.messageType] || contact.messageType || 'Networking';
    const meta=document.createElement('div');meta.className='contact-meta';
    const time=document.createElement('time');const date=new Date(contact.timestamp);
    if(Number.isFinite(date.getTime())){time.dateTime=date.toISOString();time.textContent='Updated '+new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);}else time.textContent='Updated earlier';
    meta.append(purpose,time);
    const preview=document.createElement('details');preview.className='draft-preview';
    const summary=document.createElement('summary'),snippet=document.createElement('span');snippet.textContent=Outreach.clean(contact.message).slice(0,140)+(Outreach.clean(contact.message).length>140?'…':'');summary.append(snippet);
    summary.setAttribute('aria-label',`Expand message for ${name.textContent}`);
    const text=document.createElement('p');text.className='contact-message-full';text.textContent=contact.message || '(Empty draft)';
    preview.append(summary,text);
    const actions=document.createElement('div');actions.className='contact-actions';
    const open=document.createElement('button');open.className='btn-link';open.textContent='Open & edit';
    open.disabled=recentBusy;
    open.addEventListener('click',()=>{restoreDraft(contact);switchTab('current');persistDraft();});
    const copy=document.createElement('button');copy.className='btn btn-secondary btn-sm';copy.textContent='Copy';copy.addEventListener('click',()=>copyText(contact.message,'recent-status',contact.options?.budget || Infinity));
    copy.disabled=recentBusy;
    const remove=document.createElement('button');remove.className='btn-link delete-draft';remove.textContent='Delete';remove.disabled=recentBusy;remove.addEventListener('click',()=>deleteSavedDraft(contact));
    actions.append(open,copy,remove);card.append(name,company,meta,preview,actions);$('recent-list').append(card);
  });
}
async function deleteSavedDraft(contact) {
  if(recentBusy)return;recentBusy=true;
  $('recent-list').querySelectorAll('button').forEach(button=>{button.disabled=true;});
  try {
    const result=await send({action:'deleteDraft',id:contact.id});
    deleteUndo={token:result.undoToken,expiresAt:result.expiresAt};clearTimeout(deleteTimer);
    $('delete-undo').classList.remove('hidden');$('delete-undo-text').textContent=`Deleted ${contact.name || contact.profile?.name || 'draft'}. Undo for 30 seconds while this popup stays open.`;
    deleteTimer=setTimeout(()=>{deleteUndo=null;$('delete-undo').classList.add('hidden');},Math.max(0,result.expiresAt-Date.now()));
    if(result.deletedCurrent && draftId===contact.id)clearDeletedComposer();
    status('recent-status','Draft deleted. No LinkedIn message was removed.','success');
  } catch(error){status('recent-status',error.message,'error');}
  finally{recentBusy=false;await renderRecentContacts().catch(error=>status('recent-status',error.message,'error'));}
}
async function undoDraftDeletion() {
  if(recentBusy || !deleteUndo)return;recentBusy=true;$('undo-delete-btn').disabled=true;
  try {
    const result=await send({action:'undoDeleteDraft',token:deleteUndo.token});
    if(result.restoredCurrent && !currentProfile)restoreDraft(result.restored);
    clearTimeout(deleteTimer);deleteUndo=null;$('delete-undo').classList.add('hidden');
    status('recent-status','Draft restored with its final edits.','success');
  } catch(error){status('recent-status',error.message,'error');}
  finally{recentBusy=false;$('undo-delete-btn').disabled=false;await renderRecentContacts().catch(error=>status('recent-status',error.message,'error'));}
}
function clearDeletedComposer() {
  currentProfile=null;draftId='';hasGenerated=false;sourceContext=null;undoState=null;recipientMismatch=false;demoMode=false;replacementArmed=false;
  Object.keys(fieldMap).forEach(id=>{$(id).value='';});$('generated-message').value='';
  ['profile-section','recipient-editor','recipient-fields','message-section','profile-warning'].forEach(id=>$(id).classList.add('hidden'));
  $('recipient-editor').open=false;$('save-status').textContent='';renderSenderSummary();updateGenerateState();
}
function send(message) {
  return new Promise((resolve,reject)=>chrome.runtime.sendMessage(message,response=>{
    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
    if (!response?.success) return reject(new Error(response?.error || 'Extension did not respond. Reload it and try again.'));
    resolve(response);
  }));
}

function requestData() {
  const provider=$('writer-mode').value;
  return {profileData:currentProfile,messageType:$('message-type').value,tone:$('tone').value,
    goal:$('outreach-goal').value,highlightMode,selectedHighlight,useCloud:provider!=='local',provider:provider==='local'?undefined:provider,
    model:provider==='local'?undefined:$('compose-model').value,demoMode,
    options:Writer.options({format:$('message-format').value,budget:Number($('char-budget').value)})};
}
function currentVersion() {
  return {message:$('generated-message').value,mode:draftMode,context:sourceContext,
    options:{format:$('message-format').value,budget:Number($('char-budget').value)}};
}
async function rewrite(action) {
  if(busy || !hasGenerated || $(action+'-btn').disabled) return;
  const before=currentVersion();busy=true;updateGenerateState();
  try {
    const response=await send({action:'rewriteMessage',data:{...requestData(),source:before.message,context:sourceContext,rewrite:action}});
    undoState=before;$('generated-message').value=response.generatedMessage;
    sourceContext=response.context;draftMode=response.mode;$('draft-mode').textContent=draftMode;
    renderEvidence();updateCharCount();await persistDraft();
    status('status-message',`${action==='shorter'?'Shortened':action==='warmer'?'Made warmer':'Made more direct'}. Your previous version is available with Undo.`,'success');
  } catch(error) {status('status-message',error.message,'error');}
  finally {busy=false;updateGenerateState();}
}
function undoRewrite() {
  if(!undoState || busy) return;
  const previous=undoState;undoState=null;
  $('generated-message').value=previous.message;draftMode=previous.mode;sourceContext=previous.context;
  $('message-format').value=previous.options?.format || 'direct';$('char-budget').value=previous.options?.budget || 700;
  $('draft-mode').textContent=draftMode;renderEvidence();updateCharCount();updateGenerateState();persistDraft();
  status('status-message','Previous version restored.','success');
}
function renderEvidence() {
  const evidence=Writer.explain($('generated-message').value,sourceContext);
  $('evidence-list').replaceChildren();$('evidence-count').textContent=`${evidence.length} match${evidence.length===1?'':'es'}`;
  $('no-evidence').classList.toggle('hidden',evidence.length>0);
  evidence.forEach(item=>{
    const row=document.createElement('li'),label=document.createElement('strong'),quote=document.createElement('span');
    label.textContent=item.label;quote.textContent=`“${item.quote}”`;row.append(label,quote);$('evidence-list').append(row);
  });
}
function renderProviderSettings() {
  const provider=$('ai-provider').value;
  providerConfigs.forEach(([id])=>$(id+'-settings').classList.toggle('hidden',id!==provider));
  $('key-validation-status').textContent='Test the selected key/model, then save. A saved key never enables cloud mode automatically.';
  $('model-list-status').textContent='Supported choices, not guaranteed account access. Check available models sends only this provider key, never profile/resume data. Save applies the provider to Compose.';
}
function openProviderSettings(provider) {
  Providers.config(provider);$('ai-provider').value=provider;
  switchTab('settings');$('cloud-settings').open=true;renderProviderSettings();
}
function populateComposeModels({useSaved=false}={}) {
  const provider=$('writer-mode').value;
  if(provider==='local')return;
  const cfg=Providers.config(provider),previous=$('compose-model').dataset.provider===provider?$('compose-model').value:'';
  const settingsMenu=$(cfg.modelInput);
  const choices=[...settingsMenu.options].map(option=>({id:option.value,label:option.textContent}));
  const selected=(useSaved?savedSettings[cfg.modelSetting]:previous || savedSettings[cfg.modelSetting]) || cfg.choices[0][0];
  const menu=$('compose-model');menu.replaceChildren(...choices.map(({id,label})=>{const option=document.createElement('option');option.value=id;option.textContent=label;return option;}));
  menu.value=choices.some(choice=>choice.id===selected)?selected:choices[0]?.id || '';
  menu.dataset.provider=provider;
}
async function forgetKeys(provider) {
  if(busy || providerBusy)return;
  providerBusy=true;updateGenerateState();
  try {
    savedCredentials=(await send({action:'forgetProviderKeys',provider})).keys;
    providerConfigs.forEach(([,p])=>{$(p.keyInput).value=savedCredentials[p.key] || '';});
    status('settings-status',provider==='all'?'All saved keys removed from this device. Re-enter them to use cloud AI.':'Selected key removed from this device. Other providers are unchanged.','success');
  } catch {status('settings-status','Could not remove the saved key. Please try again.','error');}
  finally {providerBusy=false;updateGenerateState();}
}
