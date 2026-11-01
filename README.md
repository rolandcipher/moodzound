# MOODZOUND — Hi-Fi Player

A personal Hi-Fi music player that runs entirely in your browser. Import your own folders, build playlists, edit tags and cover art, and export your MP3s. Your library stays on your device: nothing is uploaded to any server.

**[Open the app](https://rolandcipher.github.io/moodzound/)** · **[Read the presentation](https://rolandcipher.github.io/moodzound/about/)**

## Features

- **Whole-folder import.** Bring in a folder with all its subfolders. The folder tree sits on the left and your playlist on the right.
- **Reorderable playlists.** Keep several playlists, drag tracks to reorder them, and double-click a folder to add all of it.
- **Cover art editor.** Move, zoom, stretch, rotate and skew an image, then crop it to a square (1:1).
- **Tag editing and export.** Edit title, artist, album and genre. For MP3 files, export a copy with embedded ID3 tags and cover art; the original file is never modified.
- **Built-in `mood_samples` library.** A fixed folder of free-to-use tracks, always available and streamed on demand.
- **Private by design.** The library is stored in the browser (IndexedDB).
- **Installable.** Works as a PWA on desktop and mobile.
- **Keyboard shortcuts.** `Space` play/pause · `N` next · `P` previous.

## Tech stack

React 18 · Vite · vite-plugin-pwa · IndexedDB (`idb`) · Canvas 2D · `music-metadata-browser` (tag reading) · `browser-id3-writer` (tag writing)

## Run locally

```bash
npm install
npm run dev
```

## Project structure

```
src/App.jsx                       Main application
src/CoverEditor.jsx               Standalone cover art editor
src/db.js                         IndexedDB storage
scripts/build-mood-manifest.mjs   Scans public/mood_samples at build time
public/mood_samples/              Free-to-use tracks (see LICENSES.md)
public/about/                     Project presentation page
.github/workflows/deploy.yml      Automatic deploy to GitHub Pages
```

## Adding tracks to `mood_samples`

Place audio files (mp3, flac, m4a, ogg, wav…) in `public/mood_samples/`, in any subfolders, and credit each one in `public/mood_samples/LICENSES.md`. The build script reads title, artist, duration and cover art and generates the catalog automatically.

## Author

Built by [rolandcipher](https://github.com/rolandcipher).
