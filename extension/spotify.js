// Runs on open.spotify.com. It only reads the address of Spotify's search page
// (open.spotify.com/search/<words>) and passes the words to the YouTube panel.
// It doesn't change Spotify's page or touch Spotify's player.
(() => {
  const WAIT_MS = 1200; // wait until the words stop changing, so typing doesn't use up YouTube searches
  let pending = "";
  let sent = "";
  let timer;

  function spotifyQuery() {
    const m = /^\/search\/([^/]+)/.exec(location.pathname);
    if (!m) return "";
    try {
      return decodeURIComponent(m[1]).trim();
    } catch {
      return "";
    }
  }

  function check() {
    const q = spotifyQuery();
    if (q === pending) return;
    pending = q;
    clearTimeout(timer);
    if (!q || q === sent) return;
    timer = setTimeout(() => {
      sent = q;
      try {
        chrome.runtime.sendMessage({ type: "spotify-search", query: q }).catch(() => {});
      } catch {
        // The extension was reloaded or removed; this old copy of the script can't reach it anymore.
        clearInterval(poll);
      }
    }, WAIT_MS);
  }

  // Spotify changes pages without reloading, so check the address regularly.
  const poll = setInterval(check, 500);
  check();
})();
