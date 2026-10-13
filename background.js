chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ enabled: true }, (data) => {
    if (typeof data.enabled !== 'boolean') {
      chrome.storage.sync.set({ enabled: true });
    }
  });
});
