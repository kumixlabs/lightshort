import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Pause, Play } from "lucide-react";

import { Button } from "@kumix/ui/ui/button";
import type { ComposeOptions, VideoInfo } from "@/types";

interface RealtimePreviewProps {
  paths: { main: string; cta: string; reaction: string };
  info: { main: VideoInfo; cta: VideoInfo };
  opts: ComposeOptions;
}

/**
 * Realtime Short preview (9:16) without rendering:
 * - timeline: [main+t1] [CTA] [main remainder] clocked from active video
 * - reaction: PiP canvas 2D chroma key (FFmpeg metric), loop, hidden during CTA
 * - 9:16: bg = same video blurred behind fg contain
 */
export function RealtimePreview({ paths, info, opts }: RealtimePreviewProps) {
  const fgMain = useRef<HTMLVideoElement>(null);
  const bgMain = useRef<HTMLVideoElement>(null);
  const fgCta = useRef<HTMLVideoElement>(null);
  const bgCta = useRef<HTMLVideoElement>(null);
  const reactV = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const t1 = info.main.dur / 2;
  const ctaDur = info.cta.dur;
  const total = info.main.dur + ctaDur;
  const seg = t < t1 ? 1 : t < t1 + ctaDur ? 2 : 3;

  const { main: pathMain, cta: pathCta, reaction: pathReaction } = paths;

  // Reset playback on source media change
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset playback when source paths change
  useEffect(() => {
    setPlaying(false);
    setT(0);
    for (const r of [fgMain, fgCta, bgMain, bgCta, reactV]) {
      r.current?.pause();
    }
  }, [pathMain, pathCta, pathReaction]);

  // Chroma key loop draw — all options (color, similarity, blend) live
  useEffect(() => {
    let raf = 0;
    const hex = opts.color.startsWith("0x") ? opts.color.slice(2) : opts.color;
    const tr = Number.parseInt(hex.slice(0, 2), 16);
    const tg = Number.parseInt(hex.slice(2, 4), 16);
    const tb = Number.parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(tr + tg + tb)) return;

    // key RGB -> chroma YCbCr (BT.601), luma ignored — identical to FFmpeg chromakey
    const kb = 128 - 0.168736 * tr - 0.331264 * tg + 0.5 * tb;
    const kr = 128 + 0.5 * tr - 0.418688 * tg - 0.081312 * tb;
    const sim = opts.similarity;
    const feather = Math.max(opts.blend, 0.01);

    const draw = () => {
      const v = reactV.current;
      const c = canvas.current;
      if (v && c && v.readyState >= 2 && seg !== 2) {
        const w = 320;
        const h = Math.round((v.videoHeight / v.videoWidth) * w);
        if (c.width !== w) {
          c.width = w;
          c.height = h;
        }
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const d = img.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            const du = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b - kb;
            const dv = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b - kr;
            const dist = Math.sqrt((du * du + dv * dv) / (255 * 255 * 2));
            if (dist < sim) {
              d[i + 3] = 0;
            } else if (dist < sim + feather) {
              d[i + 3] = Math.round((255 * (dist - sim)) / feather);
            }
          }
          ctx.putImageData(img, 0, 0);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [opts, seg]);

  // Synchronized playback clock loop
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const m = fgMain.current;
      const c = fgCta.current;
      if (playing && m && c) {
        let nt = t;
        if (seg === 1) nt = m.currentTime;
        else if (seg === 2) nt = t1 + c.currentTime;
        else nt = t1 + ctaDur + (m.currentTime - t1);

        // Sync background with foreground
        if (bgMain.current && Math.abs(bgMain.current.currentTime - m.currentTime) > 0.08) {
          bgMain.current.currentTime = m.currentTime;
        }
        if (bgCta.current && Math.abs(bgCta.current.currentTime - c.currentTime) > 0.08) {
          bgCta.current.currentTime = c.currentTime;
        }

        if (nt >= total - 0.05) {
          nt = total;
          setPlaying(false);
          m.pause();
          c.pause();
          reactV.current?.pause();
        } else if (seg === 1 && nt >= t1) {
          m.pause();
          c.currentTime = 0;
          void c.play();
          if (bgCta.current) bgCta.current.currentTime = 0;
        } else if (seg === 2 && nt >= t1 + ctaDur) {
          c.pause();
          m.currentTime = t1;
          void m.play();
          if (bgMain.current) bgMain.current.currentTime = t1;
        }
        setT(Math.min(nt, total));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, seg, t1, ctaDur, total, t]);

  function seekTo(nt: number) {
    const m = fgMain.current;
    const c = fgCta.current;
    const r = reactV.current;
    if (!m || !c) return;
    setPlaying(false);
    m.pause();
    c.pause();
    r?.pause();
    const ns = nt < t1 ? 1 : nt < t1 + ctaDur ? 2 : 3;
    if (ns === 1 || ns === 3) {
      m.currentTime = ns === 1 ? nt : t1 + (nt - (t1 + ctaDur));
      if (bgMain.current) bgMain.current.currentTime = m.currentTime;
    }
    if (ns === 2) {
      c.currentTime = nt - t1;
      if (bgCta.current) bgCta.current.currentTime = c.currentTime;
    }
    if (r) r.currentTime = ns === 3 ? t1 + (nt - (t1 + ctaDur)) : nt;
    setT(nt);
  }

  function togglePlay() {
    const m = fgMain.current;
    const c = fgCta.current;
    const r = reactV.current;
    if (!m || !c) return;
    if (playing) {
      setPlaying(false);
      m.pause();
      c.pause();
      r?.pause();
      return;
    }
    if (t >= total - 0.05) seekTo(0);
    const ns = t < t1 ? 1 : t < t1 + ctaDur ? 2 : 3;
    if (ns === 1) {
      m.currentTime = t;
      if (bgMain.current) bgMain.current.currentTime = t;
      void m.play();
    }
    if (ns === 2) {
      c.currentTime = t - t1;
      if (bgCta.current) bgCta.current.currentTime = t - t1;
      void c.play();
    }
    if (ns === 3) {
      m.currentTime = t1 + (t - (t1 + ctaDur));
      if (bgMain.current) bgMain.current.currentTime = m.currentTime;
      void m.play();
    }
    if (r) {
      r.currentTime = ns === 3 ? t1 + (t - (t1 + ctaDur)) : t;
      void r.play();
    }
    setPlaying(true);
  }

  const src = (p: string) => convertFileSrc(p);
  const showCta = seg === 2;
  const W = 1080;
  const H = 1920;
  const rightPct = (opts.margin / W) * 100;
  const bottomPct = (opts.margin / H) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-lg bg-black">
        {/* MAIN */}
        <video
          ref={bgMain}
          src={src(paths.main)}
          muted
          playsInline
          className={`absolute inset-0 size-full scale-[1.15] object-cover blur-[18px] brightness-[0.55] ${showCta ? "invisible" : ""}`}
        />
        {/* biome-ignore lint/a11y/useMediaCaption: local preview without captions */}
        <video
          ref={fgMain}
          src={src(paths.main)}
          playsInline
          className={`absolute inset-0 size-full object-contain ${showCta ? "invisible" : ""}`}
        />
        {/* CTA */}
        <video
          ref={bgCta}
          src={src(paths.cta)}
          muted
          playsInline
          className={`absolute inset-0 size-full scale-[1.15] object-cover blur-[18px] brightness-[0.55] ${showCta ? "" : "invisible"}`}
        />
        {/* biome-ignore lint/a11y/useMediaCaption: local preview without captions */}
        <video
          ref={fgCta}
          src={src(paths.cta)}
          playsInline
          className={`absolute inset-0 size-full object-contain ${showCta ? "" : "invisible"}`}
        />
        {/* REACTION pip */}
        <canvas
          ref={canvas}
          className={`pointer-events-none absolute ${showCta ? "invisible" : ""}`}
          style={{
            width: `${opts.pipScale * 100}%`,
            right: `${rightPct}%`,
            bottom: `${bottomPct}%`,
          }}
        />
        <video
          ref={reactV}
          src={src(paths.reaction)}
          muted
          playsInline
          loop
          className="pointer-events-none absolute size-[2px] opacity-0"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="icon-sm"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <input
          className="scrub"
          type="range"
          min={0}
          max={total * 10}
          step={1}
          value={Math.round(t * 10)}
          onChange={(e) => seekTo(+e.currentTarget.value / 10)}
        />
        <span className="whitespace-nowrap text-muted-foreground text-xs">
          {t.toFixed(1)}s / {total.toFixed(1)}s {seg === 2 ? "· CTA" : ""}
        </span>
      </div>
    </div>
  );
}
