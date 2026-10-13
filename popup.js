const enabledEl = document.getElementById('enabled');

chrome.storage.sync.get({ enabled: true }, (data) => {
  enabledEl.checked = data.enabled !== false;
});

enabledEl.addEventListener('change', () => {
  const enabled = enabledEl.checked;
  chrome.storage.sync.set({ enabled });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'MINI_PLAYER_SET_ENABLED', enabled }).catch(() => {});
  });
});
