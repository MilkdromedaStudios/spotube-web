/**
 * Spotube Web's independent, browser-only MP3 metadata prototype.
 *
 * Operates ONLY on an MP3 chosen by the user. Never downloads Spotify audio,
 * accesses streaming URLs, or uploads a file to Spotube's server.
 *
 * Informed by the metadata/tagging workflow described in SpotFetch:
 * https://github.com/MrElyazid/SpotFetch (MrElyazid, GPL-2.0-or-later).
 * This implementation is original; no SpotFetch source code is copied.
 */
export interface LocalMp3Metadata {
  title: string;
  artist: string;
  album?: string;
}

/** ID3v2.4 uses a 28-bit synchsafe integer for tag and frame sizes. */
function synchsafe(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 0x10000000) {
    throw new Error("Metadata is too large for an ID3 tag.");
  }
  return new Uint8Array([
    (value >>> 21) & 0x7f,
    (value >>> 14) & 0x7f,
    (value >>> 7) & 0x7f,
    value & 0x7f,
  ]);
}

function writeTextFrame(id: string, text: string): Uint8Array {
  // ID3v2.4 text encoding marker 0x03 = UTF-8.
  const payload = new TextEncoder().encode(text);
  const result = new Uint8Array(10 + 1 + payload.length);
  for (let i = 0; i < 4; i++) result[i] = id.charCodeAt(i);
  result.set(synchsafe(payload.length + 1), 4);
  result[10] = 3;
  result.set(payload, 11);
  return result;
}

function previousId3Length(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const majorVersion = bytes[3];
  if (majorVersion < 2 || majorVersion > 4) {
    throw new Error("This MP3 has an unsupported ID3 version.");
  }
  if (bytes.slice(6, 10).some((byte) => (byte & 0x80) !== 0)) {
    throw new Error("This MP3 has an invalid ID3 header.");
  }
  const tagSize = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
  const footer = majorVersion === 4 && (bytes[5] & 0x10) !== 0 ? 10 : 0;
  const length = tagSize + 10 + footer;
  if (length >= bytes.length) {
    throw new Error("This MP3 has an incomplete ID3 tag.");
  }
  return length;
}

/**
 * Create a NEW tagged copy of a user-supplied MP3.
 * The old ID3v2 tag is replaced, so unrelated old tags/cover art may be lost.
 * Audio frames are copied unchanged; the function never transcodes audio.
 */
export async function tagLocalMp3(file: File, metadata: LocalMp3Metadata): Promise<Blob> {
  if (!file.name.toLowerCase().endsWith(".mp3")) {
    throw new Error("Choose an MP3 file (.mp3). Other formats are not converted.");
  }
  if (!metadata.title.trim() || !metadata.artist.trim()) {
    throw new Error("Enter both a song title and artist.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 4) throw new Error("The selected file is empty or too short.");
  const skip = previousId3Length(bytes);

  // Basic MPEG sync check (after an optional old ID3 tag).
  const first = bytes[skip];
  const second = bytes[skip + 1];
  if (first !== 0xff || second === undefined || (second & 0xe0) !== 0xe0) {
    throw new Error("The file does not appear to contain MP3 audio frames.");
  }

  const frames = [
    writeTextFrame("TIT2", metadata.title.trim()),
    writeTextFrame("TPE1", metadata.artist.trim()),
    ...(metadata.album?.trim() ? [writeTextFrame("TALB", metadata.album.trim())] : []),
  ];
  const frameBytes = frames.reduce((total, frame) => total + frame.length, 0);
  const header = new Uint8Array(10);
  header.set([0x49, 0x44, 0x33, 4, 0, 0], 0); // "ID3", v2.4.0, no flags
  header.set(synchsafe(frameBytes), 6);
  const audio = bytes.slice(skip);
  return new Blob([header, ...frames, audio], { type: "audio/mpeg" });
}

export function safeMp3Name(title: string, artist: string): string {
  const raw = [artist, title].map((part) => part.trim()).filter(Boolean).join(" - ") || "audio";
  return raw.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 140) + ".mp3";
}
