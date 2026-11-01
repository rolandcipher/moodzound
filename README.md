# MOODZOUND — Hi-Fi Player

Reproductor de música personal (PWA, React + Vite). Tu biblioteca vive en el navegador (IndexedDB); nada se sube a ningún servidor.

## Funciones
- Importar archivos o **carpetas completas con subcarpetas** (árbol a la izquierda, lista de reproducción a la derecha).
- Listas múltiples, reordenables arrastrando; doble clic en una carpeta la agrega entera.
- Editor de etiquetas y **editor de portada** (mover, zoom, estirar, rotar, inclinar, recorte 1:1).
- Carpeta fija **mood_samples** con temas libres, siempre disponibles (streaming, no se copian al dispositivo).
- Atajos: `Espacio` play/pausa · `N` siguiente · `P` anterior.

## Desarrollo
```bash
npm install
npm run dev
```

## mood_samples
Poné los audios (mp3, flac, m4a, ogg, wav…) en `public/mood_samples/`, con las subcarpetas que quieras, y anotá fuente y licencia en `public/mood_samples/LICENSES.md`.
`npm run dev` y `npm run build` los escanean solos y generan `manifest.json` (título, artista, duración, portada). No hace falta tocar código.
Cada archivo debe pesar menos de 100 MB (límite de GitHub) y el sitio publicado, menos de 1 GB.

## Publicar en GitHub Pages (gratis)
1. Creá un repositorio público (por ejemplo `moodzound`) y subí este proyecto a la rama `main`.
2. En *Settings → Pages*, elegí **Source: GitHub Actions**.
3. Cada `git push` despliega solo en `https://<usuario>.github.io/<repo>/`. La ruta se toma del nombre del repo.

## Estructura
`src/App.jsx` (app) · `src/CoverEditor.jsx` (editor de portada, módulo independiente) · `src/db.js` (almacenamiento) · `scripts/build-mood-manifest.mjs` (escáner de mood_samples).
