import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getDefaultVideoDir, writeAppConfig } from "@/lib/commands";
import { DEFAULT_OPTS } from "@/lib/compositor";
import type { AppSettings, ComposeOptions, PanelKey, QueueProgress, VideoItem } from "@/types";

const persistentAppStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
    } catch {}
    writeAppConfig(value).catch((err) => {
      console.warn("[lightshort] failed to write app config to disk:", err);
    });
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch {}
    writeAppConfig("{}").catch(() => {});
  },
};

interface AppState {
  // Video lists
  lists: Record<PanelKey, VideoItem[]>;
  comboIdx: number;
  outDir: string;
  opts: ComposeOptions;

  // Queue & Progress
  queue: QueueProgress | null;
  failures: string[];
  doneMsg: string;
  error: string;

  // Updater
  updateAvailable: string | null;

  // Settings
  settings: AppSettings;

  // Actions
  setOpts: (opts: ComposeOptions) => void;
  updateOpts: (patch: Partial<ComposeOptions>) => void;
  resetOpts: () => void;
  resetOutDir: () => void;
  setOutDir: (outDir: string) => void;
  setComboIdx: (comboIdx: number | ((prev: number) => number)) => void;
  addVideos: (key: PanelKey, items: VideoItem[]) => void;
  removeVideo: (key: PanelKey, index: number) => void;
  setQueue: (
    queue: QueueProgress | null | ((prev: QueueProgress | null) => QueueProgress | null),
  ) => void;
  setFailures: (failures: string[]) => void;
  setDoneMsg: (doneMsg: string) => void;
  setError: (error: string) => void;
  setUpdateAvailable: (version: string | null) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      lists: { main: [], cta: [], reaction: [] },
      comboIdx: 0,
      outDir: "",
      opts: DEFAULT_OPTS,
      queue: null,
      failures: [],
      doneMsg: "",
      error: "",
      updateAvailable: null,
      settings: {
        theme: "system",
      },

      setOpts: (opts) => set({ opts }),
      updateOpts: (patch) => set((s) => ({ opts: { ...s.opts, ...patch } })),
      resetOpts: () => set((s) => ({ opts: { ...DEFAULT_OPTS, mode: s.opts.mode } })),
      resetOutDir: () => {
        getDefaultVideoDir().then((dir) => {
          if (dir) set({ outDir: dir });
        });
      },
      setOutDir: (outDir) => set({ outDir }),
      setComboIdx: (updater) =>
        set((s) => ({
          comboIdx: typeof updater === "function" ? updater(s.comboIdx) : updater,
        })),
      addVideos: (key, items) =>
        set((s) => ({
          lists: { ...s.lists, [key]: [...s.lists[key], ...items] },
          comboIdx: 0,
        })),
      removeVideo: (key, index) =>
        set((s) => ({
          lists: { ...s.lists, [key]: s.lists[key].filter((_, i) => i !== index) },
          comboIdx: 0,
        })),
      setQueue: (updater) =>
        set((s) => ({
          queue: typeof updater === "function" ? updater(s.queue) : updater,
        })),
      setFailures: (failures) => set({ failures }),
      setDoneMsg: (doneMsg) => set({ doneMsg }),
      setError: (error) => set({ error }),
      setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),
      updateSettings: (patch) =>
        set((s) => ({
          settings: { ...s.settings, ...patch },
        })),
    }),
    {
      name: "lightshort-settings",
      storage: createJSONStorage(() => persistentAppStorage),
      partialize: (s) => ({
        settings: s.settings,
        opts: s.opts,
        outDir: s.outDir,
      }),
    },
  ),
);
