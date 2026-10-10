import { describe, expect, it } from "vitest";
import { formatTime, nextIndex, previousIndex, shuffled } from "./queue";

describe("queue helpers", () => {
  it("shuffles without losing items and keeps the current track first", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const s = shuffled(items, 7);
    expect(s[0]).toBe(7);
    expect([...s].sort((a, b) => a - b)).toEqual(items);
    expect(s).not.toEqual(items);
  });

  it("computes next index with repeat modes", () => {
    expect(nextIndex(0, 3, "off")).toBe(1);
    expect(nextIndex(2, 3, "off")).toBeNull();
    expect(nextIndex(2, 3, "all")).toBe(0);
    expect(nextIndex(0, 0, "all")).toBeNull();
  });

  it("restarts the track instead of going back when past 3 seconds", () => {
    expect(previousIndex(2, 3, "off", 10_000)).toBe("restart");
    expect(previousIndex(2, 3, "off", 1_000)).toBe(1);
    expect(previousIndex(0, 3, "all", 0)).toBe(2);
    expect(previousIndex(0, 3, "off", 0)).toBe("restart");
  });

  it("formats durations", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(213_000)).toBe("3:33");
    expect(formatTime(3_723_000)).toBe("1:02:03");
    expect(formatTime(undefined)).toBe("--:--");
  });
});
