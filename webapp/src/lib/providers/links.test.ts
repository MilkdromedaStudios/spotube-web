import { describe, expect, it } from "vitest";
import { looksLikeLink, parseMusicLink } from "./links";

describe("parseMusicLink", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "youtube", "track", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "youtube", "track", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM", "youtube", "track", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "youtube", "track", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/playlist?list=PL1234567890abc", "youtube", "playlist", "PL1234567890abc"],
    ["youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "track", "dQw4w9WgXcQ"],
    ["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=x", "spotify", "track", "4cOdK2wGLETKBW3PvgPWqT"],
    ["https://open.spotify.com/intl-de/album/1DFixLWuPkv3KT3TnV35m3", "spotify", "album", "1DFixLWuPkv3KT3TnV35m3"],
    ["spotify:playlist:37i9dQZF1DXcBWIGoYBM5M", "spotify", "playlist", "37i9dQZF1DXcBWIGoYBM5M"],
    ["https://soundcloud.com/forss/flickermood", "soundcloud", "track", "https://soundcloud.com/forss/flickermood"],
    ["https://soundcloud.com/forss/sets/soulhack", "soundcloud", "playlist", "https://soundcloud.com/forss/sets/soulhack"],
    ["https://soundcloud.com/forss", "soundcloud", "artist", "https://soundcloud.com/forss"],
    ["https://music.apple.com/us/album/blinding-lights/1499378108?i=1499378615", "apple", "track", "1499378615"],
    ["https://music.apple.com/us/album/after-hours/1499378108", "apple", "album", "1499378108"],
    ["https://music.apple.com/gb/song/blinding-lights/1499378615", "apple", "track", "1499378615"],
  ])("%s", (url, provider, kind, id) => {
    expect(parseMusicLink(url)).toMatchObject({ provider, kind, id });
  });

  it("rejects unrelated or malformed links", () => {
    expect(parseMusicLink("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseMusicLink("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(parseMusicLink("hello world")).toBeNull();
    expect(parseMusicLink("https://open.spotify.com/track/bad")).toBeNull();
  });

  it("detects link-like search input", () => {
    expect(looksLikeLink("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(looksLikeLink("open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT")).toBe(true);
    expect(looksLikeLink("daft punk")).toBe(false);
  });
});
