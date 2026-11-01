// Escanea public/mood_samples (con subcarpetas) y genera manifest.json + portadas.
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { parseFile } from 'music-metadata'

const ROOT = path.resolve('public/mood_samples')
const COVERS = 'mz-covers'
const AUDIO = new Set(['.mp3', '.flac', '.m4a', '.ogg', '.opus', '.wav', '.aac'])
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true })

async function walk(dir) {
  const out = []
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => natural(a.name, b.name))) {
    if (e.name === COVERS || e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...await walk(full))
    else if (AUDIO.has(path.extname(e.name).toLowerCase())) out.push(full)
  }
  return out
}

if (!existsSync(ROOT)) await mkdir(ROOT, { recursive: true })
await mkdir(path.join(ROOT, COVERS), { recursive: true })
const tracks = []
for (const file of await walk(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/')
  const base = path.basename(file, path.extname(file))
  let m = { common: {}, format: {} }
  try { m = await parseFile(file, { duration: true }) } catch (e) { console.warn('Sin etiquetas:', rel) }
  let cover = null
  const pic = m.common.picture?.[0]
  if (pic) {
    const ext = /png/.test(pic.format) ? 'png' : 'jpg'
    cover = `${COVERS}/${createHash('md5').update(pic.data).digest('hex').slice(0, 12)}.${ext}`
    await writeFile(path.join(ROOT, cover), pic.data)
  }
  tracks.push({
    path: rel, size: (await stat(file)).size,
    title: m.common.title || base, artist: m.common.artist || 'Artista desconocido',
    album: m.common.album || '—', year: m.common.year || null, genre: m.common.genre?.[0] || null,
    duration: m.format.duration || 0, cover
  })
}
await writeFile(path.join(ROOT, 'manifest.json'), JSON.stringify({ tracks }, null, 1))
console.log(`mood_samples: ${tracks.length} tema(s) indexados`)
