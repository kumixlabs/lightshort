import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { toastError, toastInfo } from "@kumix/ui/custom/toast";
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
  /** Newer release found by the update check. */
  updateAvailable: string | null;
  /** Download + install in flight. */
  updating: boolean;
  /** Downloaded by an automatic update; relaunch is held so loaded clips are not restarted away. */
  updatePendingRestart: boolean;

  // Settings
  settings: AppSettings;

  // Actions
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
  /** Checks for a release; returns its version, or null when up to date. Throws on network failure. */
  checkForUpdates: () => Promise<string | null>;
  /** Installs the update and relaunches. `auto` only downloads when clips are loaded or a render runs. */
  installUpdate: (auto?: boolean) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

/** Release found by the latest check; reused by installUpdate so it is not fetched twice. */
let latest: Awaited<ReturnType<typeof check>> | null = null;
/** Release downloaded by an automatic update, waiting for the user to restart. */
let staged: Awaited<ReturnType<typeof check>> | null = null;

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      lists: { main: [], cta: [], reaction: [] },
      comboIdx: 0,
      outDir: "",
      opts: DEFAULT_OPTS,
      queue: null,
      failures: [],
      doneMsg: "",
      error: "",
      updateAvailable: null,
      updating: false,
      updatePendingRestart: false,
      settings: {
        theme: "system",
        autoUpdate: true,
      },

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
      checkForUpdates: async () => {
        const update = await check();
        latest = update?.available ? update : null;
        set({ updateAvailable: latest?.version ?? null });
        return latest?.version ?? null;
      },
      installUpdate: async (auto = false) => {
        const s = get();
        if (s.updating) return;
        if (s.queue) {
          toastInfo({ message: "Render in progress — install the update after it finishes." });
          return;
        }
        try {
          if (staged) {
            // Downloaded by an automatic update: install it, then restart.
            // Windows exits inside install() and lets the installer restart the app.
            const update = staged;
            staged = null;
            set({ updatePendingRestart: false });
            await update.install();
            await relaunch();
            return;
          }
          const update = latest ?? (await check());
          if (!update?.available) {
            latest = null;
            set({ updateAvailable: null });
            return;
          }
          latest = update;
          set({ updating: true, updateAvailable: update.version });
          await update.download();
          latest = null;
          // An automatic update must not restart away loaded clips or a render that started
          // during the download: stage it until the user clicks the header button.
          if (auto && (get().queue || Object.values(get().lists).some((list) => list.length > 0))) {
            staged = update;
            set({ updatePendingRestart: true });
            toastInfo({ message: `LightShort ${update.version} downloaded — restart to update.` });
            return;
          }
          await update.install();
          await relaunch();
        } catch (err) {
          toastError({
            message: auto ? "Auto-update failed" : "Failed to install update",
            description: err instanceof Error ? err.message : String(err),
          });
        } finally {
          set({ updating: false });
        }
      },
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
      // Deep-merge settings so keys added in newer versions keep their defaults
      // instead of becoming `undefined` for users with older persisted state.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return { ...current, ...p, settings: { ...current.settings, ...p.settings } };
      },
    },
  ),
);
