// Clicking the toolbar button opens the YouTube panel beside the current tab.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// spotify.js reports what you searched for on open.spotify.com. Keeping it in
// session storage lets the panel pick it up whether it's open now or opened later.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "spotify-search" || typeof msg.query !== "string") return;
  const query = msg.query.trim().slice(0, 200);
  if (query) chrome.storage.session.set({ spotifySearch: { query, at: Date.now() } });
});
