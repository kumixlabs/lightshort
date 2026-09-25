# Build commands
- `bun install` — install deps
- `bun test` — unit test suite
- `bun run types:check` — typescript typecheck
- `bun run lint` — biome check
- `bun run format` — biome format write
- `bun run build` — frontend build (tsc + vite)
- `cargo check --manifest-path src-tauri/Cargo.toml` — rust typecheck
- `bun tauri dev` — full dev launch
- `bun tauri build` — production build

# Architecture
- Product: LightShort — A lightweight, offline-first tool for creating engaging 9:16 vertical short-form videos.
- Version: bump ALL three files together — `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`. Tauri reads version from `tauri.conf.json`; mismatched versions cause wrong release tags.
- State: zustand store at `src/stores/app-store.ts` with dual persistence (`localStorage` + OS config path at `%APPDATA%/lightshort/config.json`).
- Rust backend: `src-tauri/src/lib.rs` — video probe (`ffprobe`), FFmpeg video compositor (`compose`), cancellable process killer (`cancel_compose`), system detection (`check_ffmpeg`), native folder launcher (`open_folder`), and config I/O.
- Frontend: React 19 + TypeScript + `@kumix/ui` + Tailwind CSS.
- Compositor: `src/lib/compositor.ts` generates FFmpeg filtergraphs for 9:16 Shorts:
  - `reaction` mode: Main 9:16 framed with blurred background + chroma key green screen PiP.
  - `satisfying` mode: 9:16 blurred background + side-by-side split screen (540px Main left | 540px Satisfying right).
  - Optional CTA: spliced at mid-duration when present.
  - Optional Secondary: supports Main-only composition without secondary video.
- Realtime Preview: `src/components/preview/realtime-preview.tsx` provides synchronized multi-video playback, canvas chroma keying, auto-pausing on render start, and 3-stage seamless segment transitions.
- Release CI: `.github/workflows/release.yml` (Windows/macOS/Linux matrix; release on `v*` tags).

# Key rules
- Offline-first desktop tool locked to 9:16 vertical format (1080×1920).
- Requires FFmpeg and FFprobe in system PATH.
- Primary brand color: `oklch(0.546 0.245 262.881)` / dark `oklch(0.623 0.214 259.815)`.
- No new runtime dependency unless stdlib/platform truly cannot do it.
- Maintain clean modular component architecture matching Kumix OSS standards.
