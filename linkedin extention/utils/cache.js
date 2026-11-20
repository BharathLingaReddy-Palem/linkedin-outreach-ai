'use strict';

// History mutations belong to the worker's serialized write queue.

const Cache = (() => {
  async function getContacts() {
    return new Promise((resolve,reject) => {
      chrome.runtime.sendMessage({action:'getDrafts'},result=>{
        if(chrome.runtime.lastError || !result?.success)return reject(new Error('Could not load saved drafts. Please reopen Recent.'));
        resolve(result.drafts);
      });
    });
  }
  return { getContacts };
})();
