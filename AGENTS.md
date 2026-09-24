# Build commands
- `bun install` — install deps
- `bun run types:check` — typescript typecheck
- `bun run lint` — biome check
- `bun run build` — frontend build (tsc + vite)
- `cargo check` — rust typecheck (run in src-tauri/)
- `bun tauri dev` — full dev launch
- `bun tauri build` — production build

# Architecture
- Product: LightShort — A lightweight tool for creating engaging short-form videos.
- Version: bump ALL three files together — `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`. Tauri reads version from `tauri.conf.json`; mismatched versions cause wrong release tags.
- State: zustand store at `src/stores/app-store.ts`
- Rust backend: `src-tauri/src/` — video probe via ffprobe and video composition via ffmpeg
- Frontend: React + TypeScript + @kumix/ui components
- Compositor: `src/lib/compositor.ts` generates FFmpeg filtergraph (split, trim, chromakey, overlay, concat, vertical 9:16 background blur)
- Realtime Preview: `src/components/preview/realtime-preview.tsx` provides synchronized multi-video playback and live HTML5 canvas chroma keying
- Release CI: `.github/workflows/release.yml` (Windows/macOS/Linux matrix; release on `v*` tags)

# Key rules
- Offline-first desktop tool.
- Requires FFmpeg and FFprobe in system PATH.
- No new runtime dependency unless stdlib/platform truly cannot do it.
- Primary brand color: `#2563EB`.
- Maintain clean modular component architecture matching Kumix OSS standards.
