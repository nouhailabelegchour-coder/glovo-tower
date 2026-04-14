/* Background service worker — provides a toolbar-button manual re-scan. */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.includes("portal.glovoapp.com/dashboard")) return;
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.__ctScan?.(),
  });
});
