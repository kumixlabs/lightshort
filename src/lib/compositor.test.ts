import { describe, expect, test } from "bun:test";

import type { VideoInfo } from "@/types";
import { buildFfmpegArgs, buildFilter, DEFAULT_OPTS } from "./compositor";

describe("compositor", () => {
  const mockInfo: VideoInfo = {
    w: 1920,
    h: 1080,
    fps: 30,
    dur: 10,
  };

  test("buildFilter generates 9:16 reaction mode filtergraph", () => {
    const filter = buildFilter(mockInfo, DEFAULT_OPTS, "9:16");
    expect(filter).toContain("scale=1080:1920");
    expect(filter).toContain("chromakey=0x00FF00:0.15:0.1");
    expect(filter).toContain("concat=n=3:v=1:a=0[vout]");
    expect(filter).toContain("concat=n=3:v=0:a=1[aout]");
  });

  test("buildFilter generates 9:16 satisfying mode filtergraph", () => {
    const satisfyingOpts = { ...DEFAULT_OPTS, mode: "satisfying" as const, blur: 25 };
    const filter = buildFilter(mockInfo, satisfyingOpts, { hasCta: false, hasReaction: true });
    expect(filter).toContain("boxblur=25:2");
    expect(filter).toContain("scale=540:-2");
    expect(filter).toContain("overlay=0:(main_h-overlay_h)/2[sat_mid1]");
    expect(filter).toContain("overlay=540:(main_h-overlay_h)/2");
    expect(filter).toContain("[sat_full]copy[vout]");
  });

  test("buildFilter handles optional CTA cleanly", () => {
    const filter = buildFilter(mockInfo, DEFAULT_OPTS, { hasCta: false, hasReaction: false });
    expect(filter).not.toContain("concat");
    expect(filter).toContain("scale=1080:1920");
    expect(filter).toContain("[vout]");
    expect(filter).toContain("[aout]");
  });

  test("buildFfmpegArgs constructs valid FFmpeg execution arguments with satisfying mode", () => {
    const satisfyingOpts = { ...DEFAULT_OPTS, mode: "satisfying" as const };
    const paths = {
      main: "main.mp4",
      reaction: "satisfying.mp4",
      output: "out.mp4",
    };
    const args = buildFfmpegArgs(paths, mockInfo, satisfyingOpts, "9:16");
    expect(args).toContain("-i");
    expect(args).toContain("main.mp4");
    expect(args).toContain("satisfying.mp4");
    expect(args).not.toContain("cta.mp4");
    expect(args).toContain("-filter_complex");
    expect(args).toContain("[vout]");
    expect(args).toContain("[aout]");
  });
});
