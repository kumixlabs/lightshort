# LightShort

A lightweight tool for creating engaging short-form videos.

<p align="center">
  <img src="public/logo.png" alt="LightShort Logo" width="128" height="128" />
</p>

## Features

- **Automated Short Composition** — Automatically slice main videos, splice call-to-action (CTA) clips in the middle, and overlay green-screen reactions.
- **Dedicated 9:16 Shorts Workflow** — Optimized for vertical short-form video (YouTube Shorts, TikTok, Instagram Reels) with dynamic blurred background padding.
- **Chroma Key Live Tuning** — Fine-tune green screen similarity, edge blending, and custom keying color with instant visual feedback.
- **Real-Time Preview** — Canvas-based synchronous multi-video playback and real-time chroma keying without waiting for render.
- **Batch Processing** — Cartesian mix (Main × CTA × Reaction) for generating dozens of Shorts in a single click.
- **Auto-Updater** — Built-in one-click update checker and installer backed by GitHub Releases and cryptographic signatures.
- **Fast & Native** — Desktop performance powered by Rust and FFmpeg hardware acceleration where available.

## Tech Stack

- **Framework**: [Tauri 2](https://v2.tauri.app/)
- **Core Engine**: Rust + [FFmpeg](https://ffmpeg.org)
- **Frontend**: React 19, TypeScript, Vite
- **UI Components**: `@kumix/ui`, Base UI, Lucide Icons
- **Styling**: Tailwind CSS v4
- **Package Manager**: [Bun](https://bun.sh/)

## Prerequisites

- [FFmpeg](https://ffmpeg.org) and `ffprobe` installed and available in your system `PATH`.
- [Bun](https://bun.sh/) 1.4+
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)

## Getting Started

### Development

```bash
# Install dependencies
bun install

# Run in development mode
bun tauri dev
```

### Production Build

```bash
bun tauri build
```

The compiled installer and standalone binary will be generated under `src-tauri/target/release/bundle/`.

## License

MIT © 2026 Kumix Labs
