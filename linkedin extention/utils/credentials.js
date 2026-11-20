'use strict';
// User-requested remembered BYOK keys. Local browser storage is NOT encrypted.
// All storage access is restricted to extension pages/worker before migration.
globalThis.CredentialStore=(()=>{
  const fields=Object.values(Providers.registry).map(p=>p.key),store='providerCredentials';
  let initialization;
  function clean(value={}) {
    return Object.fromEntries(fields.filter(key=>typeof value?.[key]==='string' && value[key].trim()).map(key=>{
      if(value[key].length>4096)throw new Error('API key is too long. Check the selected key.');
      return [key,value[key].trim()];
    }));
  }
  function initialize() {
    if(!initialization)initialization=(async()=>{
      if(!chrome.storage.local.setAccessLevel)throw new Error('Update your browser to support protected extension storage.');
      await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
      const local=await chrome.storage.local.get([store,'userApiKey',...fields]);
      const session=chrome.storage.session?await chrome.storage.session.get(fields):{};
      const migrated=clean({...clean(session),...clean(local),...(local.userApiKey?{anthropicApiKey:local.userApiKey}:{}),...clean(local[store])});
      await chrome.storage.local.set({[store]:migrated});
      await chrome.storage.local.remove(['userApiKey',...fields]);
      if(chrome.storage.session)await chrome.storage.session.remove(fields);
    })().catch(error=>{initialization=undefined;throw error;});
    return initialization;
  }
  async function read(){await initialize();return clean((await chrome.storage.local.get(store))[store]);}
  async function save(values){const existing=await read();const updates=clean(values);for(const key of fields)if(Object.hasOwn(values,key))delete existing[key];const next={...existing,...updates};await chrome.storage.local.set({[store]:next});return next;}
  async function forget(provider){const existing=await read();if(provider==='all'){await chrome.storage.local.set({[store]:{}});return {};}
    delete existing[Providers.config(provider).key];await chrome.storage.local.set({[store]:existing});return existing;}
  return {initialize,read,save,forget};
})();
