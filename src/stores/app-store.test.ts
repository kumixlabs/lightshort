import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { VideoItem } from "@/types";

// Mock localStorage before the store import.
const storage: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = value;
    },
    removeItem: (key: string) => {
      delete storage[key];
    },
  },
  writable: true,
});

const relaunch = mock(async () => { });
const install = mock(async () => { });
let onDownload = () => { };
const download = mock(async () => onDownload());
mock.module("@tauri-apps/api/core", () => ({ invoke: async () => null, convertFileSrc: (p: string) => p }));
mock.module("@tauri-apps/plugin-process", () => ({ relaunch, exit: async () => { }, restart: relaunch }));
mock.module("@tauri-apps/plugin-updater", () => ({
  check: async () => ({ available: true, version: "9.9.9", download, install }),
}));

const { useStore } = await import("./app-store");

const clip: VideoItem = { path: "a.mp4", info: { w: 1, h: 1, fps: 30, dur: 1, audio: true } };
const render = { done: 0, pct: 0, total: 1 };
const persisted = (settings: object) => {
  storage["lightshort-settings"] = JSON.stringify({ state: { settings }, version: 0 });
};

describe("app-store", () => {
  beforeEach(async () => {
    relaunch.mockClear();
    download.mockClear();
    install.mockClear();
    onDownload = () => { };
    useStore.setState({
      lists: { main: [], cta: [], reaction: [] },
      queue: null,
      updateAvailable: null,
      updating: false,
      updatePendingRestart: false,
    });
  });

  it("enables auto-update by default", () => {
    expect(useStore.getState().settings.autoUpdate).toBe(true);
  });

  it("fills setting keys added in newer versions from the defaults", async () => {
    persisted({ theme: "dark" }); // state written before `autoUpdate` existed
    await useStore.persist.rehydrate();
    expect(useStore.getState().settings).toEqual({ theme: "dark", autoUpdate: true });
  });

  it("keeps auto-update once the user turned it off", async () => {
    persisted({ theme: "light", autoUpdate: false });
    await useStore.persist.rehydrate();
    expect(useStore.getState().settings.autoUpdate).toBe(false);
  });

  it("checks for updates and remembers the version", async () => {
    expect(await useStore.getState().checkForUpdates()).toBe("9.9.9");
    expect(useStore.getState().updateAvailable).toBe("9.9.9");
  });

  it("auto-update installs and restarts immediately when nothing is loaded", async () => {
    await useStore.getState().installUpdate(true);
    expect(download).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(useStore.getState().updatePendingRestart).toBe(false);
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it("auto-update only downloads while clips are loaded, until asked again", async () => {
    useStore.setState({ lists: { main: [clip], cta: [], reaction: [] } });
    await useStore.getState().installUpdate(true);
    expect(download).toHaveBeenCalledTimes(1);
    expect(install).not.toHaveBeenCalled();
    expect(useStore.getState().updatePendingRestart).toBe(true);
    expect(relaunch).not.toHaveBeenCalled();

    // The header button finishes the job without downloading twice.
    await useStore.getState().installUpdate();
    expect(install).toHaveBeenCalledTimes(1);
    expect(relaunch).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
    expect(useStore.getState().updatePendingRestart).toBe(false);
  });

  it("auto-update only downloads when a render starts mid-download", async () => {
    onDownload = () => useStore.setState({ queue: render });
    await useStore.getState().installUpdate(true);
    expect(install).not.toHaveBeenCalled();
    expect(useStore.getState().updatePendingRestart).toBe(true);
    expect(relaunch).not.toHaveBeenCalled();

    useStore.setState({ queue: null });
    await useStore.getState().installUpdate();
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("never interrupts a running render", async () => {
    useStore.setState({ queue: render });
    await useStore.getState().installUpdate(true);
    expect(download).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
  });
});
