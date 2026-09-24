# Contributing to LightShort

Thank you for your interest in contributing! LightShort is a lightweight tool for creating engaging short-form videos built with Tauri 2, React, TypeScript, @kumix/ui, and Tailwind CSS.

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.4.0 or higher
- [Rust](https://rustup.rs) (stable toolchain)
- [FFmpeg](https://ffmpeg.org) installed and available in `PATH`
- Platform dependencies for Tauri: see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
  - **Windows**: Microsoft Visual Studio C++ Build Tools + WebView2
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`

### Setup

```bash
git clone https://github.com/kumixlabs/lightshort.git
cd lightshort
bun install
```

### Development

```bash
bun tauri dev
```

### Testing & Linting

```bash
bun run lint
bun run types:check
bun test
```

## Pull Request Guidelines

1. Create a feature branch from `main`.
2. Keep PRs focused on a single change.
3. Verify that lint, types, and tests pass.
4. Provide a clear description of changes in your PR.
