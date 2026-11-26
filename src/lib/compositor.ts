import type { ComposeOptions, VideoInfo } from "@/types";

/** Shorts are locked to 1080×1920. */
const W = 1080;
const H = 1920;

/**
 * Dimming of blurred backgrounds; the realtime preview mirrors it with CSS `brightness(BG_DIM)`.
 * Scaling luma and chroma around the neutral points of TV-range YUV is the same as scaling RGB.
 */
export const BG_DIM = 0.55;
const keep = (neutral: number) => `val*${BG_DIM}+${(neutral * (1 - BG_DIM)).toFixed(1)}`;
const DIM = `lutyuv=y=${keep(16)}:u=${keep(128)}:v=${keep(128)}`;

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
  /** Probe of the CTA clip; used to generate silence when it carries no audio stream. */
  cta?: VideoInfo;
}

/**
 * Generates FFmpeg filtergraph for 9:16 Shorts:
 * - Mode 'reaction': Main 9:16 + green screen chroma key PiP bottom-right.
 * - Mode 'satisfying': 9:16 blurred background + side-by-side split screen (540px Main left | 540px Satisfying right).
 * - CTA optional: if present, spliced at mid-duration.
 * - Clips without an audio stream are backed by generated silence.
 */
export function buildFilter(
  main: VideoInfo,
  opts: ComposeOptions,
  targets: FilterTargets = {},
): string {
  const hasCta = targets.hasCta ?? true;
  const hasReaction = targets.hasReaction ?? true;
  const ctaIdx = targets.ctaIndex ?? 1;
  const reactIdx = targets.reactionIndex ?? (hasCta ? 2 : 1);
  const { dur, fps } = main;
  const t1 = dur / 2;
  const blur = opts.blur || 20;
  const pipW = Math.round(W * opts.pipScale);
  const pipPos = `main_w-overlay_w-${opts.margin}:main_h-overlay_h-${opts.margin}`;

  // Float silence so concat never negotiates the real audio down to the source's 8-bit format.
  const SILENCE = "anullsrc=r=48000:cl=stereo,aformat=sample_fmts=fltp";
  // Audio source of the main clip, ready to chain into the next filter.
  const mainA = main.audio === false ? `${SILENCE},` : "[0:a]";
  const ctaA = targets.cta?.audio === false ? "[cta_a]" : `[${ctaIdx}:a]`;
  const ctaSilence =
    targets.cta?.audio === false
      ? `${SILENCE},atrim=0:${targets.cta.dur},asetpts=PTS-STARTPTS[cta_a];`
      : "";

  // Blurred + dimmed cover-fit background from `src` (a label the chain continues from).
  const bg = (src: string, out: string) =>
    `${src}scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=${blur}:2,` +
    `${DIM},setsar=1[${out}];`;

  // 9:16 frame of one clip: blurred background under contained foreground.
  const frame = (src: string, name: string) =>
    `${src}split=2[${name}_i0][${name}_i1];` +
    bg(`[${name}_i0]`, `${name}_bg`) +
    `[${name}_i1]scale=${W}:-2,setsar=1[${name}_fg];` +
    `[${name}_bg][${name}_fg]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2[${name}];`;

  // `fullChain` builds the whole-length composite and labels it `full`.
  let fullChain: string;
  let full: string;
  if (opts.mode === "satisfying" && hasReaction) {
    // Satisfying clip (looped) as blurred background + right half; Main on the left half.
    const half = W / 2;
    const mid = "(main_h-overlay_h)/2";
    full = "sat_full";
    fullChain =
      `[${reactIdx}:v]fps=${fps},split=2[s0][s1];` +
      bg("[s0]", "sat_bg") +
      `[s1]scale=${half}:-2,setsar=1[sat_half];` +
      `[0:v]fps=${fps},scale=${half}:-2,setsar=1[main_half];` +
      `[sat_bg][main_half]overlay=0:${mid}[sat_mid];` +
      `[sat_mid][sat_half]overlay=${half}:${mid},trim=0:${dur},setpts=PTS-STARTPTS[${full}];`;
  } else {
    // Main framed 9:16, with the chroma-keyed reaction PiP when present.
    full = "main";
    fullChain = frame(`[0:v]fps=${fps},`, full);
    if (hasReaction) {
      full = "main_pip";
      fullChain +=
        `[${reactIdx}:v]fps=${fps},chromakey=${opts.color}:${opts.similarity}:${opts.blend},` +
        `scale=${pipW}:-2,setsar=1,trim=0:${dur},setpts=PTS-STARTPTS[pip];` +
        `[main][pip]overlay=${pipPos},trim=0:${dur},setpts=PTS-STARTPTS[${full}];`;
    }
  }

  // Splice the CTA in at mid-duration, or pass the composite through.
  const video = hasCta
    ? `[${full}]split=2[f1][f2];` +
      `[f1]trim=0:${t1},setpts=PTS-STARTPTS[v1];` +
      `[f2]trim=${t1}:${dur},setpts=PTS-STARTPTS[v2];` +
      frame(`[${ctaIdx}:v]fps=${fps},`, "cta") +
      `[v1][cta][v2]concat=n=3:v=1:a=0[vout];`
    : `[${full}]trim=0:${dur},setpts=PTS-STARTPTS[vout];`;

  const audio = hasCta
    ? `${mainA}asplit=2[aa][ab];` +
      `[aa]atrim=0:${t1},asetpts=PTS-STARTPTS[a1];` +
      `[ab]atrim=${t1}:${dur},asetpts=PTS-STARTPTS[a2];` +
      ctaSilence +
      `[a1]${ctaA}[a2]concat=n=3:v=0:a=1[aout]`
    : `${mainA}atrim=0:${dur},asetpts=PTS-STARTPTS[aout]`;

  return fullChain + video + audio;
}

export function buildFfmpegArgs(
  paths: { main: string; cta?: string; reaction?: string; output: string },
  main: VideoInfo,
  opts: ComposeOptions,
  cta?: VideoInfo,
): string[] {
  const targets: FilterTargets = { hasCta: !!paths.cta, cta };
  const inputArgs = ["-y", "-i", paths.main];
  let next = 1;
  if (paths.cta) {
    targets.ctaIndex = next++;
    inputArgs.push("-i", paths.cta);
  }
  if (paths.reaction) {
    targets.reactionIndex = next++;
    inputArgs.push("-stream_loop", "-1", "-i", paths.reaction);
  } else {
    targets.hasReaction = false;
  }

  return [
    ...inputArgs,
    "-filter_complex",
    buildFilter(main, opts, targets),
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
