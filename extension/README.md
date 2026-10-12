# Spotube: YouTube next to Spotify

A browser extension for Chrome and Edge. It opens a side panel next to Spotify's web player
(open.spotify.com) where you can search YouTube and YouTube Music and play the results, without leaving
Spotify's tab.

- When you search on Spotify, the panel searches YouTube for the same words.
- You can also type your own search in the panel.
- Click a result to play it in YouTube's own player inside the panel. When a song ends, the next result starts.
- "Open it on YouTube Music" opens the current song on music.youtube.com if it won't play in the panel.

The extension doesn't change Spotify's page or its player. It only reads the words in Spotify's search address
(open.spotify.com/search/…). Spotify and YouTube can both play at the same time, so pause one yourself.

## Install

1. Get the `extension` folder onto your computer. Either download the zip from the project, or on GitHub press
   **Code → Download ZIP**. Then unzip it.
2. In Chrome, open `chrome://extensions`. In Edge, open `edge://extensions`.
3. Turn on **Developer mode** and press **Load unpacked**. Choose the `extension` folder (the one with
   `manifest.json` in it).
4. Pin it: press the puzzle-piece button in the toolbar, then the pin next to **Spotube**.
5. Open open.spotify.com and press the Spotube button. The panel opens on the right.

## First time: your free YouTube key

YouTube only lets apps search with a key. It's free and takes a few minutes:

1. Open [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com), sign in with
   Google, create a project if it asks, and press **Enable**.
2. Open [Credentials](https://console.cloud.google.com/apis/credentials), choose **Create credentials → API key**,
   and copy it. Optionally, under **API restrictions**, limit the key to YouTube Data API v3.
3. Paste it into the panel's Settings (⚙) and press **Save**.

The key stays in this browser only (Chrome's extension storage). The free amount is about 100 searches a day, and
it resets every day.

## Notes

- Works in Chrome and Edge 116 or newer. Safari and Firefox aren't supported.
- YouTube's own ads may play in its player; the extension doesn't block them.
- Spotube is not made by or connected to Spotify, YouTube or Google.
- After changing these files, press the reload button on the extension's card in `chrome://extensions`.
