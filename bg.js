// Forward batches from any iframe to the top frame so we can log once.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "pickerBatch" && sender.tab?.id != null) {
    chrome.tabs.sendMessage(sender.tab.id, msg, { frameId: 0 });
  }
});
