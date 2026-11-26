import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { VideoInfo } from "@/types";
import { buildFfmpegArgs, buildFilter, DEFAULT_OPTS } from "./compositor";

const mockInfo: VideoInfo = { w: 1920, h: 1080, fps: 30, dur: 10, audio: true };

describe("compositor", () => {
  test("buildFilter generates 9:16 reaction mode filtergraph", () => {
    const filter = buildFilter(mockInfo, DEFAULT_OPTS);
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
    expect(filter).toContain("overlay=0:(main_h-overlay_h)/2");
    expect(filter).toContain("overlay=540:(main_h-overlay_h)/2");
    expect(filter).not.toContain("chromakey");
  });

  test("buildFilter handles optional CTA cleanly", () => {
    const filter = buildFilter(mockInfo, DEFAULT_OPTS, { hasCta: false, hasReaction: false });
    expect(filter).not.toContain("concat");
    expect(filter).toContain("scale=1080:1920");
    expect(filter).toContain("[vout]");
    expect(filter).toContain("[aout]");
  });

  test("buildFilter replaces missing audio streams with silence", () => {
    const silent: VideoInfo = { ...mockInfo, audio: false };
    const mainOnly = buildFilter(silent, DEFAULT_OPTS, { hasCta: false, hasReaction: false });
    expect(mainOnly).not.toContain("[0:a]");
    expect(mainOnly).toContain("anullsrc=r=48000:cl=stereo,aformat=sample_fmts=fltp,atrim=0:10");

    const withCta = buildFilter(mockInfo, DEFAULT_OPTS, { cta: { ...silent, dur: 3 } });
    expect(withCta).toContain("[0:a]asplit=2");
    expect(withCta).toContain(
      "anullsrc=r=48000:cl=stereo,aformat=sample_fmts=fltp,atrim=0:3,asetpts=PTS-STARTPTS[cta_a]",
    );
    expect(withCta).toContain("[a1][cta_a][a2]concat=n=3:v=0:a=1[aout]");
  });

  test("buildFfmpegArgs constructs valid FFmpeg execution arguments with satisfying mode", () => {
    const satisfyingOpts = { ...DEFAULT_OPTS, mode: "satisfying" as const };
    const args = buildFfmpegArgs(
      { main: "main.mp4", reaction: "satisfying.mp4", output: "out.mp4" },
      mockInfo,
      satisfyingOpts,
    );
    expect(args).toContain("-i");
    expect(args).toContain("main.mp4");
    expect(args).toContain("satisfying.mp4");
    expect(args).not.toContain("cta.mp4");
    expect(args).toContain("-filter_complex");
    expect(args.at(-1)).toBe("out.mp4");
    expect(args.join(" ")).toContain("[vout]");
    expect(args.join(" ")).toContain("[aout]");
  });

  // Runs the generated graphs through the real ffmpeg; skipped when it is not installed.
  test.if(!!Bun.which("ffmpeg"))("graphs render on real ffmpeg, including silent clips", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lightshort-"));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    const ffmpeg = (label: string, args: string[]) => {
      const res = Bun.spawnSync(["ffmpeg", "-v", "error", "-y", ...args]);
      if (res.exitCode !== 0) throw new Error(`${label}: ${res.stderr.toString()}`);
    };
    const encode = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"];
    const clip = (name: string, lavfi: string, audio?: string) =>
      ffmpeg(name, [
        "-f",
        "lavfi",
        "-i",
        lavfi,
        ...(audio ? ["-f", "lavfi", "-i", audio, "-c:a", "aac"] : []),
        ...encode,
        join(dir, name),
      ]);

    const mainSilent = clip("main-silent.mp4", "testsrc=size=1920x1080:rate=30:duration=2");
    const mainAudio = clip(
      "main-audio.mp4",
      "testsrc=size=1920x1080:rate=30:duration=2",
      "sine=frequency=440:sample_rate=44100:duration=2",
    );
    const ctaSilent = clip("cta-silent.mp4", "testsrc=size=1080x1920:rate=30:duration=1");
    const ctaAudio = clip(
      "cta-audio.mp4",
      "testsrc=size=1080x1920:rate=30:duration=1",
      "sine=frequency=880:sample_rate=48000:duration=1",
    );
    ffmpeg("react.mp4", [
      "-f",
      "lavfi",
      "-i",
      "color=c=0x00FF00:size=1280x720:rate=30:duration=1",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x180:rate=30:duration=1",
      "-filter_complex",
      "[0:v][1:v]overlay=(W-w)/2:(H-h)/2",
      ...encode,
      join(dir, "react.mp4"),
    ]);

    const silent: VideoInfo = { w: 1920, h: 1080, fps: 30, dur: 2, audio: false };
    const cta: VideoInfo = { w: 1080, h: 1920, fps: 30, dur: 1, audio: false };
    const satisfying = { ...DEFAULT_OPTS, mode: "satisfying" as const };
    const p = (name: string) => join(dir, name);
    const runs: [string, Parameters<typeof buildFfmpegArgs>][] = [
      [
        "silent main + audio CTA + reaction",
        [{ main: p("main-silent.mp4"), cta: p("cta-audio.mp4"), reaction: p("react.mp4"), output: p("a.mp4") }, silent, DEFAULT_OPTS, { ...cta, audio: true }],
      ],
      [
        "audio main + silent CTA, satisfying",
        [{ main: p("main-audio.mp4"), cta: p("cta-silent.mp4"), reaction: p("react.mp4"), output: p("b.mp4") }, { ...silent, audio: true }, satisfying, cta],
      ],
      [
        "silent main + silent CTA + reaction, satisfying",
        [{ main: p("main-silent.mp4"), cta: p("cta-silent.mp4"), reaction: p("react.mp4"), output: p("d.mp4") }, silent, satisfying, cta],
      ],
      ["silent main only", [{ main: p("main-silent.mp4"), output: p("c.mp4") }, silent, satisfying]],
    ];

    for (const [label, [paths, info, opts, ctaInfo]] of runs) {
      const args = buildFfmpegArgs(paths, info, opts, ctaInfo);
      // Encoding speed/quality is irrelevant to graph validity; keep the check fast.
      args[args.indexOf("-preset") + 1] = "ultrafast";
      args[args.indexOf("-crf") + 1] = "30";
      ffmpeg(label, args);
      expect(existsSync(paths.output)).toBe(true);

      // With a CTA the output is exactly main + CTA long: silence is padded to the video.
      if (ctaInfo && Bun.which("ffprobe")) {
        const probe = Bun.spawnSync([
          "ffprobe",
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          paths.output,
        ]);
        expect(Number.parseFloat(probe.stdout.toString())).toBeCloseTo(info.dur + ctaInfo.dur, 0);
      }
    }
  }, 60_000);
});
