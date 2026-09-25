import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Pause, Play, RotateCcw } from "lucide-react";

import { Button } from "@kumix/ui/ui/button";
import { useStore } from "@/stores/app-store";
import type { ComposeOptions, VideoInfo } from "@/types";

interface RealtimePreviewProps {
  paths: { main: string; cta?: string; reaction?: string };
  info: { main: VideoInfo; cta?: VideoInfo; reaction?: VideoInfo };
  opts: ComposeOptions;
}

function syncTime(el: HTMLVideoElement | null, targetT: number) {
  if (!el) return;
  const dur = el.duration;
  if (dur && Number.isFinite(dur) && dur > 0) {
    const exp = targetT % dur;
    if (Math.abs(el.currentTime - exp) > 0.08) {
      el.currentTime = exp;
    }
  } else if (el.currentTime !== 0) {
    el.currentTime = 0;
  }
}

/**
 * Realtime Short preview (9:16) without rendering:
 * - mode 'reaction': Main 9:16 + green screen chroma key PiP.
 * - mode 'satisfying': 9:16 satisfying blurred bg + side-by-side (Main left | Satisfying right).
 * - CTA is optional: if present, inserted at mid-duration.
 */
export function RealtimePreview({ paths, info, opts }: RealtimePreviewProps) {
  const fgMain = useRef<HTMLVideoElement>(null);
  const bgMain = useRef<HTMLVideoElement>(null);
  const fgCta = useRef<HTMLVideoElement>(null);
  const bgCta = useRef<HTMLVideoElement>(null);
  const reactV = useRef<HTMLVideoElement>(null);
  const fgSat = useRef<HTMLVideoElement>(null);
  const bgSat = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);

  const queue = useStore((s) => s.queue);

  // Pause playback whenever batch render starts
  useEffect(() => {
    if (queue) {
      setPlaying(false);
      for (const r of [fgMain, fgCta, bgMain, bgCta, reactV, fgSat, bgSat]) {
        r.current?.pause();
      }
    }
  }, [queue]);

  const hasCta = Boolean(paths.cta && info.cta);
  const hasSec = Boolean(paths.reaction);
  const isSatisfying = opts.mode === "satisfying" && hasSec;

  const t1 = info.main.dur / 2;
  const ctaDur = hasCta && info.cta ? info.cta.dur : 0;
  const total = info.main.dur + ctaDur;
  const seg = !hasCta ? 1 : t < t1 ? 1 : t < t1 + ctaDur ? 2 : 3;

  const { main: pathMain, cta: pathCta, reaction: pathReaction } = paths;

  // Reset playback on source media change
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on path changes
  useEffect(() => {
    setPlaying(false);
    setT(0);
    for (const r of [fgMain, fgCta, bgMain, bgCta, reactV, fgSat, bgSat]) {
      r.current?.pause();
      if (r.current) r.current.currentTime = 0;
    }
  }, [pathMain, pathCta, pathReaction, opts.mode]);

  // Chroma key loop draw (only for reaction mode)
  useEffect(() => {
    if (opts.mode !== "reaction" || !hasSec) return;

    let raf = 0;
    const hex = opts.color.startsWith("0x") ? opts.color.slice(2) : opts.color;
    const tr = Number.parseInt(hex.slice(0, 2), 16);
    const tg = Number.parseInt(hex.slice(2, 4), 16);
    const tb = Number.parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(tr + tg + tb)) return;

    const kb = 128 - 0.168736 * tr - 0.331264 * tg + 0.5 * tb;
    const kr = 128 + 0.5 * tr - 0.418688 * tg - 0.081312 * tb;
    const sim = opts.similarity;
    const feather = Math.max(opts.blend, 0.01);

    const draw = () => {
      try {
        const v = reactV.current;
        const c = canvas.current;
        if (v && c && v.videoWidth > 0 && v.videoHeight > 0 && seg !== 2) {
          const w = 320;
          const h = Math.round((v.videoHeight / v.videoWidth) * w);
          if (c.width !== w || c.height !== h) {
            c.width = w;
            c.height = h;
          }
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(v, 0, 0, w, h);
            try {
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
            } catch (readErr) {
              console.warn("Chroma key readback error (fallback to raw draw):", readErr);
            }
          }
        }
      } catch (err) {
        console.error("Chroma key draw error:", err);
      } finally {
        raf = requestAnimationFrame(draw);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [opts.color, opts.similarity, opts.blend, opts.mode, seg, hasSec]);

  // Synchronized playback clock loop
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (!playing) return;

      const m = fgMain.current;
      const c = fgCta.current;
      if (!m) return;

      // Segment 1: Main video first half (0 -> t1)
      if (!hasCta || seg === 1) {
        const cur = m.currentTime;
        if (hasCta && c && cur >= t1) {
          m.pause();
          m.currentTime = t1;
          reactV.current?.pause();
          fgSat.current?.pause();
          bgSat.current?.pause();
          c.currentTime = 0;
          if (bgCta.current) bgCta.current.currentTime = 0;
          void c.play();
          setT(t1);
        } else if (!hasCta && (cur >= total - 0.05 || m.ended)) {
          setPlaying(false);
          setT(0);
          m.pause();
          m.currentTime = 0;
          if (bgMain.current) bgMain.current.currentTime = 0;
          reactV.current?.pause();
          fgSat.current?.pause();
          bgSat.current?.pause();
          return;
        } else {
          setT(cur);
          if (bgMain.current && Math.abs(bgMain.current.currentTime - cur) > 0.08) {
            bgMain.current.currentTime = cur;
          }
        }
      }
      // Segment 2: CTA video (t1 -> t1 + ctaDur)
      else if (seg === 2 && hasCta && c) {
        const curCta = c.currentTime;
        if (curCta >= ctaDur - 0.05 || c.ended) {
          c.pause();
          c.currentTime = ctaDur;
          if (bgCta.current) bgCta.current.currentTime = ctaDur;
          m.currentTime = t1;
          if (bgMain.current) bgMain.current.currentTime = t1;
          void m.play();
          if (reactV.current) {
            reactV.current.muted = true;
            syncTime(reactV.current, t1);
            void reactV.current.play().catch(() => {});
          }
          if (fgSat.current) {
            fgSat.current.currentTime = t1;
            void fgSat.current.play();
          }
          if (bgSat.current) {
            bgSat.current.currentTime = t1;
            void bgSat.current.play();
          }
          setT(t1 + ctaDur);
        } else {
          setT(t1 + curCta);
          if (bgCta.current && Math.abs(bgCta.current.currentTime - curCta) > 0.08) {
            bgCta.current.currentTime = curCta;
          }
        }
      }
      // Segment 3: Main video second half (t1 + ctaDur -> total)
      else if (seg === 3) {
        const mCur = m.currentTime;
        const nt = t1 + ctaDur + Math.max(0, mCur - t1);
        if (nt >= total - 0.05 || m.ended || mCur >= info.main.dur - 0.05) {
          setPlaying(false);
          setT(0);
          m.pause();
          m.currentTime = 0;
          if (bgMain.current) bgMain.current.currentTime = 0;
          if (c) {
            c.pause();
            c.currentTime = 0;
          }
          if (bgCta.current) bgCta.current.currentTime = 0;
          reactV.current?.pause();
          fgSat.current?.pause();
          bgSat.current?.pause();
          return;
        } else {
          setT(nt);
          if (bgMain.current && Math.abs(bgMain.current.currentTime - mCur) > 0.08) {
            bgMain.current.currentTime = mCur;
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, seg, t1, ctaDur, total, hasCta, info.main.dur]);

  function seekTo(nt: number) {
    const m = fgMain.current;
    const c = fgCta.current;
    const r = reactV.current;
    const sFg = fgSat.current;
    const sBg = bgSat.current;
    if (!m) return;

    setPlaying(false);
    m.pause();
    c?.pause();
    r?.pause();
    sFg?.pause();
    sBg?.pause();

    if (!hasCta) {
      m.currentTime = nt;
      if (bgMain.current) bgMain.current.currentTime = nt;
      syncTime(r, nt);
      syncTime(sFg, nt);
      syncTime(sBg, nt);
      setT(nt);
      return;
    }

    const ns = nt < t1 ? 1 : nt < t1 + ctaDur ? 2 : 3;
    if (ns === 1) {
      m.currentTime = nt;
      if (bgMain.current) bgMain.current.currentTime = nt;
      syncTime(r, nt);
      syncTime(sFg, nt);
      syncTime(sBg, nt);
      if (c) c.currentTime = 0;
      if (bgCta.current) bgCta.current.currentTime = 0;
    } else if (ns === 2 && c) {
      c.currentTime = nt - t1;
      if (bgCta.current) bgCta.current.currentTime = c.currentTime;
      m.currentTime = t1;
      if (bgMain.current) bgMain.current.currentTime = t1;
    } else if (ns === 3) {
      const mOffset = t1 + (nt - (t1 + ctaDur));
      m.currentTime = mOffset;
      if (bgMain.current) bgMain.current.currentTime = mOffset;
      syncTime(r, mOffset);
      syncTime(sFg, mOffset);
      syncTime(sBg, mOffset);
      if (c) c.currentTime = ctaDur;
      if (bgCta.current) bgCta.current.currentTime = ctaDur;
    }
    setT(nt);
  }

  function togglePlay() {
    const m = fgMain.current;
    const c = fgCta.current;
    const r = reactV.current;
    const sFg = fgSat.current;
    const sBg = bgSat.current;
    if (!m) return;

    if (playing) {
      setPlaying(false);
      m.pause();
      c?.pause();
      r?.pause();
      sFg?.pause();
      sBg?.pause();
      return;
    }

    // If ended or near end, restart from beginning
    const curT = t >= total - 0.05 ? 0 : t;
    setT(curT);

    if (!hasCta) {
      m.currentTime = curT;
      if (bgMain.current) bgMain.current.currentTime = curT;
      void m.play();
      if (r) {
        r.muted = true;
        syncTime(r, curT);
        void r.play().catch((err) => console.error("Reaction play error:", err));
      }
      if (sFg) {
        sFg.currentTime = curT;
        void sFg.play();
      }
      if (sBg) {
        sBg.currentTime = curT;
        void sBg.play();
      }
      setPlaying(true);
      return;
    }

    const ns = curT < t1 ? 1 : curT < t1 + ctaDur ? 2 : 3;
    if (ns === 1) {
      m.currentTime = curT;
      if (bgMain.current) bgMain.current.currentTime = curT;
      if (c) c.currentTime = 0;
      if (bgCta.current) bgCta.current.currentTime = 0;
      void m.play();
      if (r) {
        r.muted = true;
        syncTime(r, curT);
        void r.play().catch((err) => console.error("Reaction play error:", err));
      }
      if (sFg) {
        sFg.currentTime = curT;
        void sFg.play();
      }
      if (sBg) {
        sBg.currentTime = curT;
        void sBg.play();
      }
    } else if (ns === 2 && c) {
      c.currentTime = curT - t1;
      if (bgCta.current) bgCta.current.currentTime = curT - t1;
      void c.play();
    } else if (ns === 3) {
      const mOffset = t1 + (curT - (t1 + ctaDur));
      m.currentTime = mOffset;
      if (bgMain.current) bgMain.current.currentTime = mOffset;
      void m.play();
      if (r) {
        r.muted = true;
        syncTime(r, mOffset);
        void r.play().catch((err) => console.error("Reaction play error:", err));
      }
      if (sFg) {
        sFg.currentTime = mOffset;
        void sFg.play();
      }
      if (sBg) {
        sBg.currentTime = mOffset;
        void sBg.play();
      }
    }
    setPlaying(true);
  }

  const src = (p?: string) => (p ? convertFileSrc(p) : "");
  const showCta = hasCta && seg === 2;
  const W = 1080;
  const H = 1920;
  const rightPct = (opts.margin / W) * 100;
  const bottomPct = (opts.margin / H) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-9/16 w-full overflow-hidden rounded-lg bg-black">
        {/* ===== MODE SATISFYING ===== */}
        {isSatisfying ? (
          <>
            {/* Background: Satisfying Video Blurred */}
            <video
              ref={bgSat}
              src={src(paths.reaction)}
              muted
              playsInline
              loop
              style={{ filter: `blur(${opts.blur ?? 20}px) brightness(0.6)` }}
              className={`absolute inset-0 size-full scale-[1.15] object-cover ${showCta ? "invisible" : ""}`}
            />

            {/* Split Screen Container: Left (Main) | Right (Satisfying) */}
            <div
              className={`absolute inset-0 flex items-center justify-center ${showCta ? "invisible" : ""}`}
            >
              <div className="flex size-full items-center">
                {/* Left: Main Video */}
                <div className="flex h-full w-1/2 items-center justify-center overflow-hidden">
                  {/* biome-ignore lint/a11y/useMediaCaption: local preview */}
                  <video
                    ref={fgMain}
                    src={src(paths.main)}
                    playsInline
                    className="max-h-full w-full object-contain"
                  />
                </div>

                {/* Right: Satisfying Video */}
                <div className="flex h-full w-1/2 items-center justify-center overflow-hidden">
                  <video
                    ref={fgSat}
                    src={src(paths.reaction)}
                    muted
                    playsInline
                    loop
                    className="max-h-full w-full object-contain"
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ===== MODE REACTION (OR MAIN ONLY) ===== */
          <>
            <video
              ref={bgMain}
              src={src(paths.main)}
              muted
              playsInline
              style={{ filter: `blur(${opts.blur ?? 20}px) brightness(0.55)` }}
              className={`absolute inset-0 size-full scale-[1.15] object-cover ${showCta ? "invisible" : ""}`}
            />
            {/* biome-ignore lint/a11y/useMediaCaption: local preview */}
            <video
              ref={fgMain}
              src={src(paths.main)}
              playsInline
              className={`absolute inset-0 size-full object-contain ${showCta ? "invisible" : ""}`}
            />

            {/* Reaction Green Screen Canvas PiP */}
            {hasSec && opts.mode === "reaction" && (
              <>
                <video
                  ref={reactV}
                  src={src(paths.reaction)}
                  crossOrigin="anonymous"
                  muted
                  playsInline
                  loop
                  preload="auto"
                  onLoadedMetadata={(e) => {
                    e.currentTarget.muted = true;
                  }}
                  className="pointer-events-none absolute inset-0 size-full object-contain opacity-[0.002]"
                />
                <canvas
                  ref={canvas}
                  className={`pointer-events-none absolute ${showCta ? "invisible" : ""}`}
                  style={{
                    width: `${opts.pipScale * 100}%`,
                    right: `${rightPct}%`,
                    bottom: `${bottomPct}%`,
                  }}
                />
              </>
            )}
          </>
        )}

        {/* ===== CTA (OPTIONAL) ===== */}
        {hasCta && paths.cta && (
          <>
            <video
              ref={bgCta}
              src={src(paths.cta)}
              muted
              playsInline
              style={{ filter: `blur(${opts.blur ?? 20}px) brightness(0.55)` }}
              className={`absolute inset-0 size-full scale-[1.15] object-cover ${showCta ? "" : "invisible"}`}
            />
            {/* biome-ignore lint/a11y/useMediaCaption: local preview */}
            <video
              ref={fgCta}
              src={src(paths.cta)}
              playsInline
              className={`absolute inset-0 size-full object-contain ${showCta ? "" : "invisible"}`}
            />
          </>
        )}
      </div>

      {/* Full width playbar */}
      <input
        className="scrub w-full cursor-pointer"
        type="range"
        min={0}
        max={total * 10}
        step={1}
        value={Math.round(t * 10)}
        onChange={(e) => seekTo(+e.currentTarget.value / 10)}
      />

      {/* Controls row below playbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Button
            variant="default"
            size="icon-sm"
            onClick={togglePlay}
            title={playing ? "Pause" : "Play"}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => seekTo(0)}
            title="Replay from start"
            aria-label="Replay from start"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
        <span className="font-mono text-muted-foreground text-xs tabular-nums">
          {t.toFixed(1)}s / {total.toFixed(1)}s
        </span>
      </div>
    </div>
  );
}
