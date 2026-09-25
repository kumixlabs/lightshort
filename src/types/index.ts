export type Theme = "light" | "dark" | "system";
export type OverlayMode = "reaction" | "satisfying";

export interface VideoInfo {
  w: number;
  h: number;
  fps: number;
  dur: number;
}

export interface ComposeOptions {
  mode: OverlayMode;
  pipScale: number;
  margin: number;
  color: string;
  similarity: number;
  blend: number;
  blur: number;
}

export type Aspect = "16:9" | "9:16";

export interface VideoItem {
  path: string;
  info: VideoInfo;
}

export interface Combo {
  m: VideoItem;
  c?: VideoItem;
  r?: VideoItem;
  name: string;
}

export type PanelKey = "main" | "cta" | "reaction";

export interface QueueProgress {
  done: number;
  pct: number;
  total: number;
}

export interface AppSettings {
  theme: Theme;
}
