import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AudioLines, Disc3, FolderOpen, ListMusic, Music2, Pause, Play, Plus,
  Repeat, Search, SkipBack, SkipForward, Shuffle, SlidersHorizontal,
  Volume2, X, Pencil, Folder, FolderPlus, ChevronRight, ChevronDown, Trash2, Clock3, Download, Library, Headphones
} from 'lucide-react'
import { parseBlob } from 'music-metadata-browser'
import { ID3Writer } from 'browser-id3-writer'
import { getAll, put, remove } from './db'
import CoverEditor from './CoverEditor.jsx'

const fmt = (n = 0) => Number.isFinite(n)
  ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}` : '0:00'
const id = () => crypto.randomUUID()
const cleanName = name => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
const extOf = name => name.split('.').pop()?.toLowerCase() || ''
const imageUrl = blob => blob ? URL.createObjectURL(blob) : null

export default function App() {
  const [ownTracks, setTracks] = useState([])
  const [samples, setSamples] = useState([])
  const tracks = useMemo(() => [...samples, ...ownTracks], [samples, ownTracks])
  const [playlists, setPlaylists] = useState([])
  const [activePlaylist, setActivePlaylist] = useState('all')
  const [currentId, setCurrentId] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [query, setQuery] = useState('')
  const [duration, setDuration] = useState(0)
  const [time, setTime] = useState(0)
  const [volume, setVolume] = useState(.8)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [editor, setEditor] = useState(null)
  const [toast, setToast] = useState('')
  const [selFolder, setSelFolder] = useState(null)
  const [open, setOpen] = useState(() => new Set(['mood_samples']))
  const [progress, setProgress] = useState('')
  const dirInputRef = useRef(null)
  const dragRef = useRef(null)
  const [cropSrc, setCropSrc] = useState(null)
  const [busy, setBusy] = useState(false)
  const audioRef = useRef(null)
  const fileInputRef = useRef(null)
  const coverInputRef = useRef(null)
  const urlsRef = useRef(new Map())

  const notify = msg => { setToast(msg); window.clearTimeout(notify.timer); notify.timer = window.setTimeout(() => setToast(''), 3000) }
  const current = tracks.find(t => t.id === currentId) || null

  useEffect(() => {
    Promise.all([getAll('tracks'), getAll('playlists')])
      .then(([t, p]) => {
        if (!p.length) { p = [{ id: 'default', name: 'Lista de reproducción', trackIds: [] }]; put('playlists', p[0]) }
        setTracks(t); setPlaylists(p); setActivePlaylist(p[0].id)
      })
      .catch(() => notify('No se pudo leer el almacenamiento local.'))
    return () => urlsRef.current.forEach(url => URL.revokeObjectURL(url))
  }, [])

  const getUrl = (key, blob) => {
    if (!blob) return null
    if (!urlsRef.current.has(key)) urlsRef.current.set(key, URL.createObjectURL(blob))
    return urlsRef.current.get(key)
  }
  useEffect(() => {
    const base = import.meta.env.BASE_URL + 'mood_samples/'
    fetch(base + 'manifest.json').then(r => r.ok ? r.json() : { tracks: [] }).then(({ tracks: list }) => {
      setSamples(list.map(m => {
        const dir = m.path.split('/').slice(0, -1).join('/')
        return { id: 'ms:' + m.path, sample: true, url: base + m.path.split('/').map(encodeURIComponent).join('/'),
          coverUrl: m.cover ? base + m.cover : null, cover: !!m.cover, filename: m.path.split('/').pop(),
          path: 'mood_samples/' + m.path, folder: 'mood_samples' + (dir ? '/' + dir : ''),
          title: m.title, artist: m.artist, album: m.album, year: m.year, genre: m.genre, duration: m.duration }
      }))
    }).catch(() => {})
  }, [])
  const trackCoverUrl = t => t?.sample ? t.coverUrl : t?.cover ? getUrl(`cover-${t.id}-${t.updatedAt || 0}`, t.cover) : null

  const folderOf = t => t.folder || ''
  const inFolder = (t, f) => f === null || folderOf(t) === f || folderOf(t).startsWith(f + '/')
  const byPath = (a, b) => (a.path || a.filename).localeCompare(b.path || b.filename, undefined, { numeric: true })
  const visibleTracks = useMemo(() => {
    const q = query.toLocaleLowerCase()
    return tracks.filter(t => inFolder(t, selFolder) && [t.title, t.artist, t.album, t.genre].join(' ').toLocaleLowerCase().includes(q)).sort(byPath)
  }, [tracks, selFolder, query])
  const tree = useMemo(() => {
    const root = { path: '', kids: new Map(), n: 0 }
    for (const t of tracks) {
      let node = root, p = ''; root.n++
      for (const part of folderOf(t).split('/').filter(Boolean)) {
        p = p ? p + '/' + part : part
        if (!node.kids.has(part)) node.kids.set(part, { name: part, path: p, kids: new Map(), n: 0 })
        node = node.kids.get(part); node.n++
      }
    }
    return root
  }, [tracks])
  const pl = playlists.find(p => p.id === activePlaylist) || null
  const queue = useMemo(() => pl ? pl.trackIds.map(i => tracks.find(t => t.id === i)).filter(Boolean) : [], [pl, tracks])
  const toggleOpen = path => setOpen(prev => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n })
  async function addIds(ids) {
    if (!pl) return
    const fresh = ids.filter(i => !pl.trackIds.includes(i))
    if (!fresh.length) return notify('Ya están en la lista.')
    const updated = { ...pl, trackIds: [...pl.trackIds, ...fresh] }
    await put('playlists', updated)
    setPlaylists(prev => prev.map(x => x.id === pl.id ? updated : x))
    notify(`${fresh.length} tema(s) agregados a ${pl.name}.`)
  }
  const renderNode = (node, depth = 0) => [...node.kids.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(k => <div key={k.path}>
    <div className={`tree-row ${selFolder === k.path ? 'selected' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}>
      <button className="tree-chev" onClick={() => toggleOpen(k.path)}>{k.kids.size ? (open.has(k.path) ? <ChevronDown size={14}/> : <ChevronRight size={14}/>) : <span style={{ width: 14 }}/>}</button>
      <button className="tree-name" title="Doble clic: agregar carpeta a la lista" onClick={() => setSelFolder(k.path)} onDoubleClick={() => addIds(tracks.filter(t => inFolder(t, k.path)).sort(byPath).map(t => t.id))}><Folder size={14}/><span>{k.name}</span><small>{k.n}</small></button>
    </div>
    {open.has(k.path) && renderNode(k, depth + 1)}
  </div>)

  useEffect(() => {
    const onKey = e => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      else if (e.key === 'n' || e.key === 'N') moveTrack(1)
      else if (e.key === 'p' || e.key === 'P') moveTrack(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !current) return
    const url = current.sample ? current.url : getUrl(`audio-${current.id}`, current.file)
    audio.src = url
    setTime(0); setDuration(0)
    if (playing) audio.play().catch(() => setPlaying(false))
  }, [currentId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    if (playing && current) audio.play().catch(() => setPlaying(false))
    else audio.pause()
  }, [playing, volume, currentId])

  async function importFiles(fileList) {
    const selected = [...(fileList || [])].filter(f =>
      f.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name))
    if (!selected.length) return notify('Seleccioná archivos de audio compatibles.')
    selected.sort((x, y) => (x.webkitRelativePath || x.name).localeCompare(y.webkitRelativePath || y.name, undefined, { numeric: true }))
    const known = new Set(tracks.map(t => (t.path || t.filename) + '|' + t.file?.size))
    setBusy(true)
    let added = []
    try {
      for (const [i, file] of selected.entries()) {
        const path = file.webkitRelativePath || file.name
        if (known.has(path + '|' + file.size)) continue
        setProgress(`${i + 1}/${selected.length}`)
        let metadata = {}
        try {
          const parsed = await parseBlob(file)
          metadata = {
            title: parsed.common.title || cleanName(file.name),
            artist: parsed.common.artist || parsed.common.artists?.join(', ') || 'Artista desconocido',
            album: parsed.common.album || 'Álbum desconocido',
            year: parsed.common.year ? String(parsed.common.year) : '',
            genre: parsed.common.genre?.[0] || ''
          }
          const picture = parsed.common.picture?.[0]
          if (picture?.data) metadata.cover = new Blob([picture.data], { type: picture.format || 'image/jpeg' })
        } catch {
          metadata = { title: cleanName(file.name), artist: 'Artista desconocido', album: 'Álbum desconocido', year: '', genre: '' }
        }
        const track = {
          id: id(), file, filename: file.name, path, folder: path.split('/').slice(0, -1).join('/'), duration: 0,
          title: metadata.title, artist: metadata.artist, album: metadata.album,
          year: metadata.year, genre: metadata.genre, cover: metadata.cover || null,
          addedAt: Date.now(), updatedAt: Date.now()
        }
        added.push(track)
        await put('tracks', track)
      }
      setTracks(prev => [...prev, ...added])
      if (!currentId && added[0]) setCurrentId(added[0].id)
      notify(`${added.length} archivo(s) importado(s).`)
    } catch (err) {
      console.error(err); notify('Hubo un problema guardando los archivos. Revisá el espacio disponible.')
    } finally {
      setBusy(false); setProgress('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (dirInputRef.current) dirInputRef.current.value = ''
    }
  }

  async function playTrack(trackId) {
    if (pl && !pl.trackIds.includes(trackId)) await addIds([trackId])
    setCurrentId(trackId)
    setPlaying(true)
  }
  function togglePlay() {
    if (!current && queue[0]) return playTrack(queue[0].id)
    if (current) setPlaying(v => !v)
  }
  function moveTrack(direction) {
    if (!queue.length) return
    if (direction < 0 && time > 3 && audioRef.current) { audioRef.current.currentTime = 0; return }
    let index = queue.findIndex(t => t.id === currentId)
    index = shuffle ? Math.floor(Math.random() * queue.length) : (index + direction + queue.length) % queue.length
    playTrack(queue[index].id)
  }
  function onEnded() {
    if (repeat && audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => setPlaying(false))
    } else moveTrack(1)
  }

  async function createPlaylist() {
    const name = window.prompt('Nombre de la playlist:')
    if (!name?.trim()) return
    const p = { id: id(), name: name.trim(), trackIds: [] }
    await put('playlists', p)
    setPlaylists(prev => [...prev, p]); setActivePlaylist(p.id)
  }
  async function renamePlaylist(p) {
    const name = window.prompt('Nuevo nombre:', p.name)
    if (!name?.trim()) return
    const updated = { ...p, name: name.trim() }
    await put('playlists', updated)
    setPlaylists(prev => prev.map(x => x.id === p.id ? updated : x))
  }
  async function deletePlaylist(p) {
    if (!window.confirm(`¿Eliminar la playlist "${p.name}"?`)) return
    if (playlists.length < 2) return notify('Tiene que quedar al menos una lista.')
    await remove('playlists', p.id)
    const rest = playlists.filter(x => x.id !== p.id)
    setPlaylists(rest)
    if (activePlaylist === p.id) setActivePlaylist(rest[0].id)
  }
  async function addToPlaylist(trackId) {
    if (!playlists.length) return createPlaylist()
    const p = playlists.find(x => x.id === activePlaylist) || playlists[0]
    if (p.trackIds.includes(trackId)) return notify('Esa canción ya está en la playlist.')
    const updated = { ...p, trackIds: [...p.trackIds, trackId] }
    await put('playlists', updated)
    setPlaylists(prev => prev.map(x => x.id === p.id ? updated : x))
    notify(`Agregada a ${p.name}.`)
  }
  async function reorder(from, to) {
    if (!pl || from == null || from === to) return
    const ids = queue.map(t => t.id); const [m] = ids.splice(from, 1); ids.splice(to, 0, m)
    const updated = { ...pl, trackIds: ids }
    await put('playlists', updated)
    setPlaylists(prev => prev.map(x => x.id === pl.id ? updated : x))
  }
  async function removeFromPlaylist(trackId) {
    const p = playlists.find(x => x.id === activePlaylist)
    if (!p) return
    const updated = { ...p, trackIds: p.trackIds.filter(x => x !== trackId) }
    await put('playlists', updated)
    setPlaylists(prev => prev.map(x => x.id === p.id ? updated : x))
  }
  async function deleteTrack(track) {
    if (!window.confirm(`¿Quitar "${track.title}" de MOODZOUND? El archivo original no se borra.`)) return
    await remove('tracks', track.id)
    const updatedPlaylists = playlists.map(p => ({ ...p, trackIds: p.trackIds.filter(x => x !== track.id) }))
    await Promise.all(updatedPlaylists.map(p => put('playlists', p)))
    setTracks(prev => prev.filter(t => t.id !== track.id))
    setPlaylists(updatedPlaylists)
    if (currentId === track.id) { setCurrentId(null); setPlaying(false) }
    const url = urlsRef.current.get(`audio-${track.id}`)
    if (url) { URL.revokeObjectURL(url); urlsRef.current.delete(`audio-${track.id}`) }
  }

  function openEditor(track) { setEditor({ ...track }) }
  async function saveEditor() {
    if (!editor) return
    const updated = { ...editor, updatedAt: Date.now() }
    await put('tracks', updated)
    setTracks(prev => prev.map(t => t.id === updated.id ? updated : t))
    setEditor(null); notify('Cambios guardados en la biblioteca MOODZOUND.')
  }
  function setEditorCover(file) {
    if (!file || !editor) return
    if (!file.type.startsWith('image/')) return notify('Elegí un archivo de imagen.')
    setCropSrc(file)
  }

  async function exportEditedFile() {
    if (!editor) return
    if (extOf(editor.filename) !== 'mp3') {
      notify('La escritura embebida está habilitada en esta versión para MP3. Para otros formatos, guardá los cambios en MOODZOUND.')
      return
    }
    setBusy(true)
    try {
      const buffer = await editor.file.arrayBuffer()
      const writer = new ID3Writer(buffer)
      writer.setFrame('TIT2', editor.title || '')
      writer.setFrame('TPE1', [editor.artist || ''])
      writer.setFrame('TALB', editor.album || '')
      if (editor.year) writer.setFrame('TYER', String(editor.year).slice(0, 4))
      if (editor.genre) writer.setFrame('TCON', [editor.genre])
      if (editor.cover) {
        const coverBuffer = await editor.cover.arrayBuffer()
        writer.setFrame('APIC', { type: 3, data: coverBuffer, description: 'Cover', useUnicodeEncoding: false })
      }
      writer.addTag()
      const blob = writer.getBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = editor.filename.replace(/\.mp3$/i, '') + '-MOODZOUND.mp3'
      a.click()
      URL.revokeObjectURL(url)
      notify('Archivo MP3 exportado con etiquetas ID3 y portada.')
    } catch (err) {
      console.error(err); notify('No se pudo escribir el MP3. Revisá el archivo y probá nuevamente.')
    } finally { setBusy(false) }
  }

  const cover = current ? trackCoverUrl(current) : null
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><AudioLines size={21}/></div><div><b>MOODZOUND</b><span>PERSONAL HI-FI PLAYER</span></div></div>
      <div className="top-status"><span className="status-dot"/> LOCAL LIBRARY <i/> {tracks.length} TRACKS{progress && <> <i/> IMPORTANDO {progress}</>}</div>
      <button className="icon-button" title="Importar música" onClick={() => fileInputRef.current?.click()}><Plus size={18}/></button>
      <button className="icon-button" title="Importar carpeta (con subcarpetas)" onClick={() => dirInputRef.current?.click()}><FolderPlus size={18}/></button>
      <input ref={dirInputRef} type="file" webkitdirectory="" directory="" multiple hidden onChange={e => importFiles(e.target.files)}/>
      <input ref={fileInputRef} type="file" accept="audio/*,.flac,.m4a" multiple hidden onChange={e => importFiles(e.target.files)}/>
    </header>

    <main className="workspace">
      <aside className="library-panel">
        <div className="section-label">CARPETAS</div>
        <button className={`nav-item ${selFolder === null ? 'selected' : ''}`} onClick={() => setSelFolder(null)}><Disc3 size={17}/> Toda la música <span>{tracks.length}</span></button>
        <div className="tree">{renderNode(tree)}</div>
        <div className="library-bottom"><div className="storage-icon"><FolderOpen size={17}/></div><div><b>Tu música, local</b><small>Guardada en este dispositivo</small></div></div>
      </aside>

      <section className="main-panel">
        <div className="content-head">
          <div><div className="eyebrow">YOUR COLLECTION</div><h1>{selFolder === null ? 'Biblioteca' : selFolder.split('/').pop()}</h1><p>{visibleTracks.length} canciones en esta vista</p></div>
          <div className="search-box"><Search size={16}/><input aria-label="Buscar" placeholder="Buscar canciones, artistas..." value={query} onChange={e => setQuery(e.target.value)}/></div>
        </div>
        <div className="toolbar"><span className="table-title">PISTAS</span><div className="toolbar-actions"><button className="subtle-button" disabled={!visibleTracks.length} onClick={() => addIds(visibleTracks.map(t => t.id))}><ListMusic size={15}/> Agregar todo a la lista</button><button className="subtle-button" disabled={busy} onClick={() => dirInputRef.current?.click()}><FolderPlus size={15}/>{busy ? 'Procesando…' : 'Importar carpeta'}</button></div></div>
        {visibleTracks.length === 0 ? <div className="empty-state"><div className="empty-disc"><Disc3 size={34}/></div><h2>{query ? 'No hay coincidencias' : 'Tu biblioteca empieza acá'}</h2><p>{query ? 'Probá con otro título, artista o álbum.' : 'Importá archivos de audio para crear tu colección personal.'}</p>{!query && <><button className="primary-button" onClick={() => dirInputRef.current?.click()}><FolderPlus size={16}/> Importar carpeta</button><small>MP3 · WAV · FLAC · M4A · OGG · AAC</small></>}</div> :
          <div className="track-table">
            <div className="track-row table-header"><span>#</span><span>TÍTULO</span><span>ÁLBUM</span><span>FORMATO</span><span>ACCIONES</span></div>
            {visibleTracks.map((t, i) => <div key={t.id} className={`track-row ${currentId === t.id ? 'active-track' : ''}`}>
              <button className="track-number" onClick={() => playTrack(t.id)}>{currentId === t.id && playing ? <AudioLines size={16}/> : <span>{String(i+1).padStart(2,'0')}</span>}</button>
              <button className="track-info" onClick={() => playTrack(t.id)}><div className="mini-cover">{t.cover ? <img src={trackCoverUrl(t)} /> : <Disc3 size={17}/>}</div><div><b>{t.title}</b><small>{t.artist}</small></div></button>
              <span className="album-cell">{t.album}</span><span className="format-cell">{extOf(t.filename).toUpperCase()}</span>
              <div className="row-actions">{!t.sample && <button title="Editar etiquetas y portada" onClick={() => openEditor(t)}><Pencil size={15}/></button>}<button title="Agregar a playlist" onClick={() => addToPlaylist(t.id)}><ListMusic size={15}/></button>{!t.sample && <button title="Quitar de biblioteca" onClick={() => deleteTrack(t)}><Trash2 size={15}/></button>}</div>
            </div>)}
          </div>}
      </section>

      <aside className="now-panel">
        <div className="now-heading"><span>NOW PLAYING</span><span className="hi-fi-label"><Headphones size={13}/> HI-FI</span></div>
        <div className="hero-art">
          {cover ? <img src={cover} /> : <div className="art-placeholder"><div className="art-ring"><Disc3 size={78} strokeWidth={1}/></div><span>MOODZOUND / HI-FI</span></div>}
        </div>
        <div className="now-meta"><div><h2>{current?.title || 'Nada en reproducción'}</h2><p>{current?.artist || 'Elegí una canción de tu biblioteca'}</p></div><button className="tiny-button" disabled={!current} onClick={() => current && openEditor(current)}><Pencil size={16}/></button></div>
        <div className="progress-wrap"><div className="progress-label"><span>{fmt(time)}</span><span>{fmt(duration)}</span></div><input aria-label="Progreso" type="range" min="0" max={duration || 1} value={Math.min(time, duration || 1)} onChange={e => { if(audioRef.current) audioRef.current.currentTime = Number(e.target.value) }}/></div>
        <div className="transport">
          <button className={shuffle ? 'toggled' : ''} onClick={() => setShuffle(v => !v)} title="Aleatorio"><Shuffle size={17}/></button>
          <button onClick={() => moveTrack(-1)} title="Anterior"><SkipBack size={20} fill="currentColor"/></button>
          <button className="play-button" onClick={togglePlay} title={playing ? 'Pausar' : 'Reproducir'}>{playing ? <Pause size={21} fill="currentColor"/> : <Play size={21} fill="currentColor"/>}</button>
          <button onClick={() => moveTrack(1)} title="Siguiente"><SkipForward size={20} fill="currentColor"/></button>
          <button className={repeat ? 'toggled' : ''} onClick={() => setRepeat(v => !v)} title="Repetir pista"><Repeat size={17}/></button>
        </div>
        <div className="volume-row"><Volume2 size={16}/><input aria-label="Volumen" type="range" min="0" max="1" step=".01" value={volume} onChange={e => setVolume(Number(e.target.value))}/></div>
        <div className="queue">
          <div className="queue-head"><select value={activePlaylist} onChange={e => setActivePlaylist(e.target.value)}>{playlists.map(p => <option key={p.id} value={p.id}>{p.name} ({p.trackIds.length})</option>)}</select>
            <button className="tiny-button" title="Nueva lista" onClick={createPlaylist}><Plus size={15}/></button>
            {pl && <><button className="tiny-button" title="Renombrar" onClick={() => renamePlaylist(pl)}><Pencil size={13}/></button><button className="tiny-button" title="Eliminar lista" onClick={() => deletePlaylist(pl)}><Trash2 size={13}/></button></>}</div>
          {queue.length === 0 ? <p className="queue-empty">Lista vacía. Doble clic en una carpeta, o usá la lista (☰) en una pista.</p> : queue.map((t, i) => <div key={t.id} draggable onDragStart={() => dragRef.current = i} onDragOver={e => e.preventDefault()} onDrop={() => { reorder(dragRef.current, i); dragRef.current = null }} className={`queue-row ${currentId === t.id ? 'active-track' : ''}`}>
            <button onClick={() => playTrack(t.id)}><span>{String(i + 1).padStart(2, '0')}</span><div><b>{t.title}</b><small>{t.artist}</small></div></button>
            <button title="Quitar de la lista" onClick={() => removeFromPlaylist(t.id)}><X size={14}/></button></div>)}
        </div>
        <div className="audio-note"><span className="status-dot"/> LOCAL PLAYBACK <span>•</span> BROWSER AUDIO</div>
      </aside>
    </main>

    <footer className="bottom-bar"><span>MOODZOUND <b>1.0.0</b></span><span>DESIGNED FOR LISTENING</span><span><Clock3 size={13}/> LOCAL LIBRARY · INDEXEDDB</span></footer>
    <audio ref={audioRef} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuration(e.currentTarget.duration)} onEnded={onEnded}/>
    {toast && <div className="toast">{toast}</div>}

    {cropSrc && <CoverEditor src={cropSrc} onCancel={() => setCropSrc(null)} onDone={blob => { setEditor(e => ({ ...e, cover: blob })); setCropSrc(null) }}/>}
    {editor && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setEditor(null)}>
      <div className="editor-modal">
        <div className="modal-head"><div><span className="eyebrow">LIBRARY EDITOR</span><h2>Editar información</h2></div><button className="icon-button" onClick={() => setEditor(null)}><X size={18}/></button></div>
        <div className="editor-cover-row">
          <div className="editor-cover">{editor.cover ? <img src={getUrl(`editor-${editor.id}-${editor.updatedAt || 0}`, editor.cover)}/> : <Disc3 size={40}/>}</div>
          <div><b>Portada del álbum</b><p>Se guarda en la biblioteca MOODZOUND. Para MP3 también podés exportarla embebida.</p><div style={{display:'flex',gap:8}}><button className="subtle-button" onClick={() => coverInputRef.current?.click()}>Elegir imagen</button>{editor.cover && <button className="subtle-button" onClick={() => setCropSrc(editor.cover)}>Ajustar actual</button>}</div><input ref={coverInputRef} hidden type="file" accept="image/*" onChange={e => setEditorCover(e.target.files?.[0])}/></div>
        </div>
        <div className="form-grid">
          <label>TÍTULO<input value={editor.title} onChange={e => setEditor({...editor,title:e.target.value})}/></label>
          <label>ARTISTA<input value={editor.artist} onChange={e => setEditor({...editor,artist:e.target.value})}/></label>
          <label>ÁLBUM<input value={editor.album} onChange={e => setEditor({...editor,album:e.target.value})}/></label>
          <label>AÑO<input value={editor.year} onChange={e => setEditor({...editor,year:e.target.value})}/></label>
          <label>GÉNERO<input value={editor.genre} onChange={e => setEditor({...editor,genre:e.target.value})}/></label>
        </div>
        <div className="metadata-warning"><b>Alcance de esta versión:</b> los cambios se guardan en la biblioteca MOODZOUND. Para MP3, “Exportar MP3 con metadatos” genera una copia nueva con etiquetas ID3 y portada embebida. WAV, FLAC, M4A y OGG todavía no tienen escritura embebida.</div>
        <div className="modal-actions"><button className="subtle-button" onClick={() => setEditor(null)}>Cancelar</button><button className="subtle-button" disabled={busy || extOf(editor.filename) !== 'mp3'} onClick={exportEditedFile}><Download size={14}/> Exportar MP3</button><button className="primary-button" onClick={saveEditor}>Guardar en MOODZOUND</button></div>
      </div>
    </div>}
  </div>
}
