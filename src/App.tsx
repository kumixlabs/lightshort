import { useEffect, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";

import { ToastContainer } from "@kumix/ui/custom/toast";
import { AdvancedOptions } from "@/components/compositor/advanced-options";
import { BatchQueue } from "@/components/compositor/batch-queue";
import { ModeSelector } from "@/components/compositor/mode-selector";
import { VideoPanels } from "@/components/compositor/video-panel";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { ComboNavigator } from "@/components/preview/combo-navigator";
import { RealtimePreview } from "@/components/preview/realtime-preview";
import { useTheme } from "@/hooks/use-theme";
import { getDefaultVideoDir, readAppConfig } from "@/lib/commands";
import { stem } from "@/lib/utils";
import { useStore } from "@/stores/app-store";
import type { Combo } from "@/types";

export default function App() {
  useTheme();

  const lists = useStore((s) => s.lists);
  const comboIdx = useStore((s) => s.comboIdx);
  const opts = useStore((s) => s.opts);
  const setQueue = useStore((s) => s.setQueue);

  // Compute all combinations (Cartesian product with optional CTA / Reaction)
  const combos: Combo[] = useMemo(() => {
    const out: Combo[] = [];
    if (lists.main.length === 0) return out;

    const ctaItems: ((typeof lists.cta)[number] | undefined)[] =
      lists.cta.length > 0 ? lists.cta : [undefined];
    const reactionItems: ((typeof lists.reaction)[number] | undefined)[] =
      lists.reaction.length > 0 ? lists.reaction : [undefined];

    for (const m of lists.main) {
      for (const c of ctaItems) {
        for (const r of reactionItems) {
          const parts = [stem(m.path)];
          if (c) parts.push(stem(c.path));
          if (r) parts.push(stem(r.path));
          out.push({
            m,
            c,
            r,
            name: parts.join("__"),
          });
        }
      }
    }
    return out;
  }, [lists]);

  const combo = combos[Math.min(comboIdx, Math.max(combos.length - 1, 0))];

  // Listen to Tauri compose progress
  useEffect(() => {
    const unlisten = listen<number>("compose-progress", (e) => {
      setQueue((q) => (q ? { ...q, pct: e.payload } : q));
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [setQueue]);

  // Synchronize store from OS config file and set default Videos directory
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const disk = await readAppConfig();
        if (disk && !cancelled) {
          const parsed = JSON.parse(disk);
          const state = parsed?.state;
          if (state && typeof state === "object") {
            useStore.setState((current) => ({
              opts: { ...current.opts, ...(state.opts ?? {}) },
              outDir: state.outDir || current.outDir,
              settings: { ...current.settings, ...(state.settings ?? {}) },
            }));
          }
        }
      } catch {}

      try {
        const vDir = await getDefaultVideoDir();
        if (vDir && !cancelled) {
          useStore.setState((current) => {
            if (!current.outDir) {
              return { outDir: vDir };
            }
            return {};
          });
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Silent update check once per launch (lightread pattern)
  useEffect(() => {
    let cancelled = false;
    check()
      .then((u) => {
        if (!cancelled && u?.available) {
          useStore.setState({ updateAvailable: u.version });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[7fr_3fr]">
          {/* ===== LEFT: EDITOR ===== */}
          <section className="flex min-w-0 flex-col gap-3">
            <ModeSelector />
            <VideoPanels />
            <AdvancedOptions />
            <BatchQueue combos={combos} />
          </section>

          {/* ===== RIGHT: PREVIEW ===== */}
          <section className="sticky top-4 flex min-w-0 flex-col gap-3">
            <ComboNavigator combos={combos} currentCombo={combo} />

            {combo ? (
              <RealtimePreview
                paths={{ main: combo.m.path, cta: combo.c?.path, reaction: combo.r?.path }}
                info={{ main: combo.m.info, cta: combo.c?.info, reaction: combo.r?.info }}
                opts={opts}
              />
            ) : (
              <div className="flex aspect-9/16 items-center justify-center rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
                Add at least 1 main video to preview
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
      <ToastContainer position="bottom-right" />
    </div>
  );
}
