import type { Aspect, ComposeOptions, VideoInfo } from "@/types";

export const ASPECT_DIMS: Record<Aspect, [number, number] | null> = {
  "16:9": null,
  "9:16": [1080, 1920],
};

export const DEFAULT_OPTS: ComposeOptions = {
  mode: "reaction",
  pipScale: 0.3,
  margin: 0,
  color: "0x00FF00",
  similarity: 0.15,
  blend: 0.1,
  blur: 20,
};

export interface FilterTargets {
  hasCta?: boolean;
  hasReaction?: boolean;
  ctaIndex?: number;
  reactionIndex?: number;
}

/**
 * Generates FFmpeg filtergraph for 9:16 Shorts:
 * - Mode 'reaction': Main 9:16 + green screen chroma key PiP bottom-right.
 * - Mode 'satisfying': 9:16 canvas, satisfying blurred background, Main on left (540px) + Satisfying on right (540px).
 * - CTA is optional: if present, inserted at mid-duration.
 */
export function buildFilter(
  main: VideoInfo,
  opts: ComposeOptions,
  targetsOrAspect: FilterTargets | Aspect = {
    hasCta: true,
    hasReaction: true,
    ctaIndex: 1,
    reactionIndex: 2,
  },
  aspectArg: Aspect = "9:16",
): string {
  const isAspect3rd = typeof targetsOrAspect === "string";
  const targets: FilterTargets = isAspect3rd
    ? { hasCta: true, hasReaction: true }
    : targetsOrAspect;
  const aspect: Aspect = isAspect3rd ? targetsOrAspect : aspectArg;

  const hasCta = targets.hasCta ?? true;
  const hasReaction = targets.hasReaction ?? true;
  const ctaIdx = targets.ctaIndex ?? 1;
  const reactIdx = targets.reactionIndex ?? (hasCta ? 2 : 1);

  const t1 = main.dur / 2;
  const [W, H] = aspect === "9:16" ? ASPECT_DIMS["9:16"]! : [main.w, main.h];
  const fps = main.fps;
  const halfW = Math.round(W / 2);
  const pos = `main_w-overlay_w-${opts.margin}:main_h-overlay_h-${opts.margin}`;
  const pipW = Math.round(W * opts.pipScale);
  const blurVal = opts.blur || 20;

  // Frame helper (cover blur bg + contain fg)
  const vFrame = (bgSrc: string, fgSrc: string, out: string) =>
    `${bgSrc}scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=${blurVal}:2,setsar=1[${out}_bg];` +
    `${fgSrc}scale=${W}:-2,setsar=1[${out}_fg];` +
    `[${out}_bg][${out}_fg]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2[${out}];`;

  // CTA frame helper if CTA is present
  const ctaPart = hasCta
    ? aspect === "9:16"
      ? `[${ctaIdx}:v]fps=${fps},split=2[c0][c1];${vFrame("[c0]", "[c1]", "cta_v")}`
      : `[${ctaIdx}:v]fps=${fps},scale=${W}:${H},setsar=1[cta_v];`
    : "";

  // 1. SATISFYING MODE with secondary video
  if (opts.mode === "satisfying" && hasReaction) {
    const satSetup =
      `[${reactIdx}:v]fps=${fps},split=2[sat_bg_in][sat_fg_in];` +
      `[sat_bg_in]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=${blurVal}:2,setsar=1[sat_bg];` +
      `[sat_fg_in]scale=${halfW}:-2,setsar=1[sat_half];` +
      `[0:v]fps=${fps},scale=${halfW}:-2,setsar=1[main_half];` +
      `[sat_bg][main_half]overlay=0:(main_h-overlay_h)/2[sat_mid1];` +
      `[sat_mid1][sat_half]overlay=${halfW}:(main_h-overlay_h)/2,trim=0:${main.dur},setpts=PTS-STARTPTS[sat_full];`;

    if (hasCta) {
      return (
        satSetup +
        ctaPart +
        `[sat_full]split=2[sf1][sf2];` +
        `[sf1]trim=0:${t1},setpts=PTS-STARTPTS[v1];` +
        `[sf2]trim=${t1},setpts=PTS-STARTPTS[v2];` +
        `[v1][cta_v][v2]concat=n=3:v=1:a=0[vout];` +
        `[0:a]asplit=2[aa][ab];` +
        `[aa]atrim=0:${t1},asetpts=PTS-STARTPTS[a1];` +
        `[ab]atrim=${t1}:${main.dur},asetpts=PTS-STARTPTS[a2];` +
        `[a1][${ctaIdx}:a][a2]concat=n=3:v=0:a=1[aout]`
      );
    }

    return `${satSetup}[sat_full]copy[vout];[0:a]atrim=0:${main.dur},asetpts=PTS-STARTPTS[aout]`;
  }

  // 2. REACTION MODE with chroma key overlay
  if (hasReaction) {
    const reactionSetup = `[${reactIdx}:v]fps=${fps},chromakey=${opts.color}:${opts.similarity}:${opts.blend},scale=${pipW}:-1,setsar=1`;

    if (hasCta) {
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

      return (
        parts +
        `${reactionSetup},split=2[ra][rb];` +
        `[ra]trim=0:${t1},setpts=PTS-STARTPTS[ra2];` +
        `[rb]trim=${t1}:${main.dur},setpts=PTS-STARTPTS[rb2];` +
        `[p1][ra2]overlay=${pos}[v1];` +
        `[p2][rb2]overlay=${pos}[v2];` +
        ctaPart +
        `[v1][cta_v][v2]concat=n=3:v=1:a=0[vout];` +
        `[0:a]asplit=2[aa][ab];` +
        `[aa]atrim=0:${t1},asetpts=PTS-STARTPTS[a1];` +
        `[ab]atrim=${t1}:${main.dur},asetpts=PTS-STARTPTS[a2];` +
        `[a1][${ctaIdx}:a][a2]concat=n=3:v=0:a=1[aout]`
      );
    }

    // Reaction without CTA
    const mainFramed =
      aspect === "9:16"
        ? `[0:v]fps=${fps},split=2[m0][m1];${vFrame("[m0]", "[m1]", "mainf")}`
        : `[0:v]fps=${fps},scale=${W}:${H},setsar=1[mainf];`;

    return (
      mainFramed +
      `${reactionSetup},trim=0:${main.dur},setpts=PTS-STARTPTS[rf];` +
      `[mainf][rf]overlay=${pos},trim=0:${main.dur},setpts=PTS-STARTPTS[vout];` +
      `[0:a]atrim=0:${main.dur},asetpts=PTS-STARTPTS[aout]`
    );
  }

  // 3. MAIN ONLY or MAIN + CTA (no reaction/secondary)
  if (hasCta) {
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

    return (
      parts +
      ctaPart +
      `[p1][cta_v][p2]concat=n=3:v=1:a=0[vout];` +
      `[0:a]asplit=2[aa][ab];` +
      `[aa]atrim=0:${t1},asetpts=PTS-STARTPTS[a1];` +
      `[ab]atrim=${t1}:${main.dur},asetpts=PTS-STARTPTS[a2];` +
      `[a1][${ctaIdx}:a][a2]concat=n=3:v=0:a=1[aout]`
    );
  }

  // Main only
  return aspect === "9:16"
    ? `[0:v]fps=${fps},split=2[m0][m1];` +
        vFrame("[m0]", "[m1]", "mainf") +
        `[mainf]trim=0:${main.dur},setpts=PTS-STARTPTS[vout];` +
        `[0:a]atrim=0:${main.dur},asetpts=PTS-STARTPTS[aout]`
    : `[0:v]fps=${fps},scale=${W}:${H},setsar=1,trim=0:${main.dur},setpts=PTS-STARTPTS[vout];` +
        `[0:a]atrim=0:${main.dur},asetpts=PTS-STARTPTS[aout]`;
}

export function buildFfmpegArgs(
  paths: { main: string; cta?: string; reaction?: string; output: string },
  main: VideoInfo,
  opts: ComposeOptions,
  aspect: Aspect = "9:16",
): string[] {
  let inputCount = 1;
  let ctaIndex = -1;
  let reactionIndex = -1;

  const inputArgs: string[] = ["-y", "-i", paths.main];

  if (paths.cta) {
    ctaIndex = inputCount++;
    inputArgs.push("-i", paths.cta);
  }

  if (paths.reaction) {
    reactionIndex = inputCount++;
    inputArgs.push("-stream_loop", "-1", "-i", paths.reaction);
  }

  const filter = buildFilter(
    main,
    opts,
    {
      hasCta: Boolean(paths.cta),
      hasReaction: Boolean(paths.reaction),
      ctaIndex,
      reactionIndex,
    },
    aspect,
  );

  return [
    ...inputArgs,
    "-filter_complex",
    filter,
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
