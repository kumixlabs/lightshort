import { useEffect, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";

import { ToastContainer } from "@kumix/ui/custom/toast";
import { AdvancedOptions } from "@/components/compositor/advanced-options";
import { BatchQueue } from "@/components/compositor/batch-queue";
import { VideoPanels } from "@/components/compositor/video-panel";
import { Header } from "@/components/layout/header";
import { ComboNavigator } from "@/components/preview/combo-navigator";
import { RealtimePreview } from "@/components/preview/realtime-preview";
import { useTheme } from "@/hooks/use-theme";
import { stem } from "@/lib/utils";
import { useStore } from "@/stores/app-store";
import type { Combo } from "@/types";

export default function App() {
  useTheme();

  const lists = useStore((s) => s.lists);
  const comboIdx = useStore((s) => s.comboIdx);
  const opts = useStore((s) => s.opts);
  const setQueue = useStore((s) => s.setQueue);

  // Compute all combinations (Cartesian product)
  const combos: Combo[] = useMemo(() => {
    const out: Combo[] = [];
    for (const m of lists.main) {
      for (const c of lists.cta) {
        for (const r of lists.reaction) {
          out.push({
            m,
            c,
            r,
            name: `${stem(m.path)}__${stem(c.path)}__${stem(r.path)}`,
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
            <VideoPanels />
            <AdvancedOptions />
            <BatchQueue combos={combos} />
          </section>

          {/* ===== RIGHT: PREVIEW ===== */}
          <section className="sticky top-4 flex min-w-0 flex-col gap-3">
            <ComboNavigator combos={combos} currentCombo={combo} />

            {combo ? (
              <RealtimePreview
                paths={{ main: combo.m.path, cta: combo.c.path, reaction: combo.r.path }}
                info={{ main: combo.m.info, cta: combo.c.info }}
                opts={opts}
              />
            ) : (
              <div className="flex aspect-[9/16] items-center justify-center rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
                Add at least 1 video to each panel to preview
              </div>
            )}
          </section>
        </div>
      </main>
      <ToastContainer position="bottom-right" />
    </div>
  );
}
