import type { Aspect, ComposeOptions, VideoInfo } from "@/types";

export const ASPECT_DIMS: Record<Aspect, [number, number] | null> = {
  "16:9": null,
  "9:16": [1080, 1920],
};

export const DEFAULT_OPTS: ComposeOptions = {
  pipScale: 0.25,
  margin: 20,
  color: "0x00FF00",
  similarity: 0.15,
  blend: 0.1,
};

/**
 * Timeline: [main start + reaction] -> [CTA] -> [main remainder + reaction]
 * Reaction: PiP in bottom-right corner, chroma keyed, muted, looped (stream_loop).
 * 9:16: main & CTA vertically framed (bg blur cover + fg contain), Shorts style.
 */
export function buildFilter(
  main: VideoInfo,
  opts: ComposeOptions,
  aspect: Aspect = "9:16",
): string {
  const t1 = main.dur / 2;
  const [W, H] = aspect === "9:16" ? ASPECT_DIMS["9:16"]! : [main.w, main.h];
  const fps = main.fps;
  const pos = `main_w-overlay_w-${opts.margin}:main_h-overlay_h-${opts.margin}`;
  const pipW = Math.round(W * opts.pipScale);

  const vFrame = (bgSrc: string, fgSrc: string, out: string) =>
    `${bgSrc}scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:2,setsar=1[bgc];` +
    `${fgSrc}scale=${W}:-2,setsar=1[fgc];` +
    `[bgc][fgc]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2[${out}];`;

  const parts =
    aspect === "9:16"
      ? `[0:v]fps=${fps},split=2[m0][m1];` +
        vFrame("[m0]", "[m1]", "mainf") +
        `[mainf]split=2[p1s][p2s];` +
        `[p1s]trim=0:${t1},setpts=PTS-STARTPTS[p1];` +
        `[p2s]trim=${t1},setpts=PTS-STARTPTS[p2];`
      : `[0:v]fps=${fps},scale=${W}:${H},setsar=1,split=2[ma][mb];` +
        `[ma]trim=0:${t1},setpts=PTS-STARTPTS[p1];` +
        `[mb]trim=${t1},setpts=PTS-STARTPTS[p2];`;

  const ctaPart =
    aspect === "9:16"
      ? `[1:v]fps=${fps},split=2[c0][c1];${vFrame("[c0]", "[c1]", "cta_v")}`
      : `[1:v]fps=${fps},scale=${W}:${H},setsar=1[cta_v];`;

  return (
    parts +
    `[2:v]fps=${fps},chromakey=${opts.color}:${opts.similarity}:${opts.blend},scale=${pipW}:-1,setsar=1,split=2[ra][rb];` +
    `[ra]trim=0:${t1},setpts=PTS-STARTPTS[ra2];` +
    `[rb]trim=${t1}:${main.dur},setpts=PTS-STARTPTS[rb2];` +
    `[p1][ra2]overlay=${pos}[v1];` +
    `[p2][rb2]overlay=${pos}[v2];` +
    ctaPart +
    `[v1][cta_v][v2]concat=n=3:v=1:a=0[vout];` +
    `[0:a]asplit=2[aa][ab];` +
    `[aa]atrim=0:${t1},asetpts=PTS-STARTPTS[a1];` +
    `[ab]atrim=${t1}:${main.dur},asetpts=PTS-STARTPTS[a2];` +
    `[a1][1:a][a2]concat=n=3:v=0:a=1[aout]`
  );
}

export function buildFfmpegArgs(
  paths: { main: string; cta: string; reaction: string; output: string },
  main: VideoInfo,
  opts: ComposeOptions,
  aspect: Aspect = "9:16",
): string[] {
  return [
    "-y",
    "-i",
    paths.main,
    "-i",
    paths.cta,
    "-stream_loop",
    "-1",
    "-i",
    paths.reaction,
    "-filter_complex",
    buildFilter(main, opts, aspect),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    paths.output,
  ];
}
