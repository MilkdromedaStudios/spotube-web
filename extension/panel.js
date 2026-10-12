// The YouTube side panel: search with the YouTube Data API (your own free key)
// and play results in YouTube's own embedded player.

const $ = (id) => document.getElementById(id);
const els = {
  main: $("main"),
  settings: $("settings"),
  settingsButton: $("settings-button"),
  closeSettings: $("close-settings"),
  player: $("player"),
  video: $("video"),
  nowTitle: $("now-title"),
  nowChannel: $("now-channel"),
  next: $("next-button"),
  openLink: $("open-link"),
  form: $("search-form"),
  input: $("search-input"),
  follow: $("follow"),
  status: $("status"),
  results: $("results"),
  keyForm: $("key-form"),
  keyInput: $("key-input"),
  keyStatus: $("key-status"),
  musicOnly: $("music-only"),
  removeKey: $("remove-key"),
};

const YT = "https://www.youtube.com";
const MUSIC_CATEGORY = "10";

let key = "";
let musicOnly = true;
let follow = true;
let shown = []; // results on screen
let queue = []; // results the current song was picked from
let playing = -1; // position in queue
let endHandled = false;
let sawPlaying = false; // the current song has reported playing, so an "ended" is really about it
let token = 0; // tells this song's player updates apart from the previous song's
let searchSeq = 0;
let listenTimer;
const cache = new Map();

function setStatus(text) {
  els.status.textContent = text;
}

function showSettings(open) {
  els.settings.hidden = !open;
  els.main.hidden = open;
  if (open) els.keyInput.focus();
}

// Titles come back with HTML entities (&amp;, &#39;). An inert parsed document turns them into text.
function decode(text) {
  return new DOMParser().parseFromString(String(text ?? ""), "text/html").documentElement.textContent ?? "";
}

function errorMessage(status, body) {
  const err = body?.error ?? {};
  const reasons = [
    ...(err.errors ?? []).map((e) => e.reason),
    ...(err.details ?? []).map((d) => d.reason),
    err.status,
  ].filter(Boolean);
  const has = (...r) => r.some((x) => reasons.includes(x));
  if (has("quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "RATE_LIMIT_EXCEEDED"))
    return "You've used today's free YouTube searches. They reset tomorrow.";
  if (has("accessNotConfigured", "SERVICE_DISABLED"))
    return "Your key isn't switched on for YouTube yet. In Google Cloud, enable “YouTube Data API v3” for it.";
  if (has("keyInvalid", "API_KEY_INVALID", "keyExpired", "API_KEY_EXPIRED") || status === 400 || status === 403)
    return "YouTube didn't accept your key. Check it in Settings (⚙).";
  return "YouTube search isn't working right now. Try again in a moment.";
}

async function search(raw) {
  const q = String(raw ?? "").trim();
  if (!q) return;
  els.input.value = q;
  if (!key) {
    setStatus("Add your YouTube key in Settings to search.");
    showSettings(true);
    return;
  }
  const id = `${musicOnly ? "music" : "all"}:${q.toLowerCase()}`;
  const seq = ++searchSeq;
  if (cache.has(id)) {
    chrome.storage.session.set({ lastResults: { id, items: cache.get(id) } }).catch(() => {});
    return render(cache.get(id));
  }
  setStatus("Searching…");
  const params = new URLSearchParams({ part: "snippet", type: "video", videoEmbeddable: "true", maxResults: "20", q, key });
  if (musicOnly) params.set("videoCategoryId", MUSIC_CATEGORY);
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const body = await res.json().catch(() => ({}));
    if (seq !== searchSeq) return; // a newer search started
    if (!res.ok) {
      console.warn("[Spotube] YouTube search failed:", res.status, body);
      shown = [];
      els.results.replaceChildren();
      return setStatus(errorMessage(res.status, body));
    }
    const items = (body.items ?? [])
      .filter((i) => i?.id?.videoId)
      .map((i) => ({
        id: i.id.videoId,
        title: decode(i.snippet?.title),
        channel: decode(i.snippet?.channelTitle),
        thumb: i.snippet?.thumbnails?.medium?.url ?? i.snippet?.thumbnails?.default?.url ?? "",
      }));
    cache.set(id, items);
    chrome.storage.session.set({ lastResults: { id, items } }).catch(() => {});
    render(items);
  } catch (e) {
    console.warn("[Spotube] YouTube search failed:", e);
    if (seq === searchSeq) setStatus("Couldn't reach YouTube. Check your connection and try again.");
  }
}

function render(items) {
  shown = items;
  setStatus(items.length ? "" : "No results on YouTube for that.");
  els.results.replaceChildren(
    ...items.map((item, i) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `Play ${item.title} by ${item.channel}`);
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      if (item.thumb.startsWith("https://")) img.src = item.thumb;
      const text = document.createElement("span");
      text.className = "text";
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = item.title;
      const channel = document.createElement("span");
      channel.className = "channel";
      channel.textContent = item.channel;
      text.append(title, channel);
      button.append(img, text);
      button.addEventListener("click", () => {
        queue = shown;
        play(i);
      });
      li.append(button);
      return li;
    }),
  );
  markPlaying();
}

function markPlaying() {
  const current = queue[playing]?.id;
  els.results.querySelectorAll("li").forEach((li, i) => li.classList.toggle("playing", shown[i]?.id === current));
}

function play(i) {
  const item = queue[i];
  if (!item) return;
  playing = i;
  token += 1;
  endHandled = false;
  sawPlaying = false;
  els.player.hidden = false;
  // enablejsapi + origin let YouTube's player tell this panel when a song ends, as YouTube's own player library does.
  const params = new URLSearchParams({ autoplay: "1", enablejsapi: "1", rel: "0", playsinline: "1", origin: location.origin });
  els.video.src = `${YT}/embed/${encodeURIComponent(item.id)}?${params}`;
  els.nowTitle.textContent = item.title;
  els.nowChannel.textContent = item.channel;
  els.openLink.href = `https://music.youtube.com/watch?v=${encodeURIComponent(item.id)}`;
  els.next.disabled = i + 1 >= queue.length;
  markPlaying();
}

function next() {
  if (playing + 1 < queue.length) play(playing + 1);
  else setStatus("That was the last song in this list.");
}

// Ask the player to send its updates, then follow them to move on when a song ends.
els.video.addEventListener("load", () => {
  let tries = 0;
  clearInterval(listenTimer);
  listenTimer = setInterval(() => {
    els.video.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: token, channel: "widget" }), YT);
    if (++tries >= 20) clearInterval(listenTimer);
  }, 250);
});

window.addEventListener("message", (e) => {
  if (e.origin !== YT || e.source !== els.video.contentWindow) return;
  let data;
  try {
    data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
  } catch {
    return;
  }
  if (data?.id !== undefined && data.id !== token) return; // left over from the previous song
  clearInterval(listenTimer);
  const state = data?.event === "onStateChange" ? data.info : data?.event === "infoDelivery" ? data.info?.playerState : undefined;
  if (state === 1) sawPlaying = true;
  if (state === 0 && sawPlaying && !endHandled) {
    endHandled = true;
    next();
  }
  if (data?.event === "onError") {
    console.warn("[Spotube] YouTube player error:", data.info);
    setStatus("This video can't play here. Use “Open it on YouTube Music”, or press Next.");
  }
});

els.next.addEventListener("click", next);

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  search(els.input.value);
});

els.follow.addEventListener("change", () => {
  follow = els.follow.checked;
  chrome.storage.local.set({ follow });
});

els.musicOnly.addEventListener("change", () => {
  musicOnly = els.musicOnly.checked;
  chrome.storage.local.set({ musicOnly });
});

els.settingsButton.addEventListener("click", () => showSettings(els.settings.hidden));

els.closeSettings.addEventListener("click", () => {
  showSettings(false);
  if (key && els.input.value) search(els.input.value);
});

els.keyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = els.keyInput.value.trim();
  if (!value) return;
  key = value;
  await chrome.storage.local.set({ youtubeKey: key });
  els.keyInput.value = "";
  els.keyStatus.textContent = "Saved.";
  showSettings(false);
  setStatus(els.input.value ? "" : "Search for a song, or search on Spotify.");
  if (els.input.value) search(els.input.value);
});

els.removeKey.addEventListener("click", async () => {
  key = "";
  await chrome.storage.local.remove("youtubeKey");
  els.keyStatus.textContent = "Your key was removed from this browser.";
});

// Searches made on open.spotify.com arrive through session storage (see background.js).
chrome.storage.onChanged.addListener((changes, area) => {
  const q = area === "session" && changes.spotifySearch?.newValue?.query;
  if (q && follow) search(q);
});

async function start() {
  const saved = await chrome.storage.local.get({ youtubeKey: "", musicOnly: true, follow: true });
  key = saved.youtubeKey;
  musicOnly = saved.musicOnly;
  follow = saved.follow;
  els.follow.checked = follow;
  els.musicOnly.checked = musicOnly;
  if (!key) {
    setStatus("Add your YouTube key in Settings to search.");
    showSettings(true);
  }
  const { spotifySearch, lastResults } = await chrome.storage.session.get(["spotifySearch", "lastResults"]);
  // Reuse the last results when the panel reopens, so it doesn't spend another search.
  if (lastResults?.id && Array.isArray(lastResults.items)) cache.set(lastResults.id, lastResults.items);
  if (follow && spotifySearch?.query) search(spotifySearch.query);
  else if (key) setStatus("Search for a song, or search on Spotify.");
}

start();
