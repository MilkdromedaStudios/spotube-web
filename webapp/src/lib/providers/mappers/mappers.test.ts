import { describe, expect, it } from "vitest";
import { artworkUrl, amSongToTrack } from "./apple";
import { scTrackToTrack } from "./soundcloud";
import { spPlaylistItemTrack, spTrackToTrack } from "./spotify";
import { decodeEntities, parseIsoDuration, splitTitle, ytVideoToTrack } from "./youtube";

describe("youtube mapper", () => {
  it("parses ISO-8601 durations", () => {
    expect(parseIsoDuration("PT3M33S")).toBe(213_000);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3_723_000);
    expect(parseIsoDuration("P1DT1S")).toBe(86_401_000);
    expect(parseIsoDuration("P0D")).toBeUndefined();
    expect(parseIsoDuration(undefined)).toBeUndefined();
  });

  it("splits artist and title like Spotube's YouTube engine", () => {
    expect(splitTitle("Daft Punk - Get Lucky (Official Video)", "DaftPunkVEVO")).toEqual({
      title: "Get Lucky",
      artists: [{ name: "Daft Punk" }],
    });
    expect(splitTitle("Get Lucky", "Daft Punk - Topic", "UC1")).toEqual({
      title: "Get Lucky",
      artists: [{ id: "UC1", name: "Daft Punk" }],
    });
    expect(splitTitle("Rock &amp; Roll", "Some Channel", "UC2").title).toBe("Rock & Roll");
    expect(decodeEntities("It&#39;s &quot;fine&quot;")).toBe(`It's "fine"`);
  });

  it("maps a video resource to a track", () => {
    const t = ytVideoToTrack({
      id: "dQw4w9WgXcQ",
      snippet: { title: "Rick Astley - Never Gonna Give You Up", channelTitle: "Rick Astley", channelId: "UCx", thumbnails: { high: { url: "h.jpg" } } },
      contentDetails: { duration: "PT3M33S" },
    });
    expect(t).toMatchObject({ key: "youtube:dQw4w9WgXcQ", title: "Never Gonna Give You Up", durationMs: 213000, artwork: "h.jpg" });
  });
});

describe("spotify mapper", () => {
  const sp = {
    id: "4cOdK2wGLETKBW3PvgPWqT",
    name: "Song",
    artists: [{ id: "a1", name: "Artist" }],
    album: { id: "al1", name: "Album", images: [{ url: "big", width: 640 }, { url: "mid", width: 300 }, { url: "small", width: 64 }] },
    duration_ms: 1000,
    uri: "spotify:track:4cOdK2wGLETKBW3PvgPWqT",
  };
  it("maps tracks and picks a ~300px image", () => {
    expect(spTrackToTrack(sp)).toMatchObject({ key: "spotify:4cOdK2wGLETKBW3PvgPWqT", artwork: "mid", playbackRef: sp.uri });
  });
  it("skips local files and episodes", () => {
    expect(spTrackToTrack({ ...sp, is_local: true })).toBeNull();
    expect(spTrackToTrack({ ...sp, type: "episode" })).toBeNull();
  });
  it("accepts both playlist item shapes", () => {
    expect(spPlaylistItemTrack({ track: sp })).toBe(sp);
    expect(spPlaylistItemTrack({ item: sp })).toBe(sp);
  });
});

describe("soundcloud and apple mappers", () => {
  it("upscales SoundCloud artwork and drops blocked tracks", () => {
    const t = scTrackToTrack({ id: 1, title: "T", user: { id: 2, username: "U" }, artwork_url: "https://i1.sndcdn.com/a-large.jpg", permalink_url: "https://soundcloud.com/u/t" });
    expect(t?.artwork).toBe("https://i1.sndcdn.com/a-t500x500.jpg");
    expect(scTrackToTrack({ id: 1, title: "T", access: "blocked" })).toBeNull();
  });
  it("fills Apple artwork templates", () => {
    expect(artworkUrl({ url: "https://x/{w}x{h}bb.jpg" }, 300)).toBe("https://x/300x300bb.jpg");
    expect(amSongToTrack({ id: "9", type: "songs", attributes: { name: "S", artistName: "A", durationInMillis: 5 } })).toMatchObject({
      key: "apple:9",
      durationMs: 5,
    });
  });
});
