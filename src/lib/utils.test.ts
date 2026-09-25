import { describe, expect, test } from "bun:test";

import { basename, formatDuration, stem } from "./utils";

describe("utils", () => {
  test("basename handles unix and windows paths", () => {
    expect(basename("/path/to/video.mp4")).toBe("video.mp4");
    expect(basename("C:\\videos\\sub\\clip.mov")).toBe("clip.mov");
    expect(basename("simple.mp4")).toBe("simple.mp4");
  });

  test("stem strips extension and sanitizes characters", () => {
    expect(stem("/path/to/video.mp4")).toBe("video");
    expect(stem("C:\\My Videos\\clip #1 (final).mov")).toBe("clip_1_final_");
  });

  test("formatDuration formats seconds to m:ss.s", () => {
    expect(formatDuration(0)).toBe("0:00.0");
    expect(formatDuration(65.4)).toBe("1:05.4");
    expect(formatDuration(120)).toBe("2:00.0");
  });
});
