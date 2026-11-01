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
        if (!p.length) { p = [{ id: 'default', name: 'Playlist', trackIds: [] }]; put('playlists', p[0]) }
        setTracks(t); setPlaylists(p); setActivePlaylist(p[0].id)
      })
      .catch(() => notify('Unable to read local storage.'))
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
    if (!fresh.length) return notify('Already in the playlist.')
    const updated = { ...pl, trackIds: [...pl.trackIds, ...fresh] }
    await put('playlists', updated)
    setPlaylists(prev => prev.map(x => x.id === pl.id ? updated : x))
    notify(`${fresh.length} track(s) added to ${pl.name}.`)
  }
  const renderNode = (node, depth = 0) => [...node.kids.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(k => <div key={k.path}>
    <div className={`tree-row ${selFolder === k.path ? 'selected' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}>
      <button className="tree-chev" onClick={() => toggleOpen(k.path)}>{k.kids.size ? (open.has(k.path) ? <ChevronDown size={14}/> : <ChevronRight size={14}/>) : <span style={{ width: 14 }}/>}</button>
      <button className="tree-name" title="Double-click to add folder to playlist" onClick={() => setSelFolder(k.path)} onDoubleClick={() => addIds(tracks.filter(t => inFolder(t, k.path)).sort(byPath).map(t => t.id))}><Folder size={14}/><span>{k.name}</span><small>{k.n}</small></button>
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
    if (!selected.length) return notify('Select compatible audio files.')
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
            artist: parsed.common.artist || parsed.common.artists?.join(', ') || 'Unknown Artist',
            album: parsed.common.album || 'Unknown Album',
            year: parsed.common.year ? String(parsed.common.year) : '',
            genre: parsed.common.genre?.[0] || ''
          }
          const picture = parsed.common.picture?.[0]
          if (picture?.data) metadata.cover = new Blob([picture.data], { type: picture.format || 'image/jpeg' })
        } catch {
          metadata = { title: cleanName(file.name), artist: 'Unknown Artist', album: 'Unknown Album', year: '', genre: '' }
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
      notify(`${added.length} file(s) imported.`)
    } catch (err) {
      console.error(err); notify('There was a problem saving the files. Check available storage.')
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
    const name = window.prompt('Playlist name:')
    if (!name?.trim()) return
    const p = { id: id(), name: name.trim(), trackIds: [] }
    await put('playlists', p)
    setPlaylists(prev => [...prev, p]); setActivePlaylist(p.id)
  }
  async function renamePlaylist(p) {
    const name = window.prompt('New name:', p.name)
    if (!name?.trim()) return
    const updated = { ...p, name: name.trim() }
    await put('playlists', updated)
    setPlaylists(prev => prev.map(x => x.id === p.id ? updated : x))
  }
  async function deletePlaylist(p) {
    if (!window.confirm(`Delete the playlist "${p.name}"?`)) return
    if (playlists.length < 2) return notify('At least one playlist must remain.')
    await remove('playlists', p.id)
    const rest = playlists.filter(x => x.id !== p.id)
    setPlaylists(rest)
    if (activePlaylist === p.id) setActivePlaylist(rest[0].id)
  }
  async function addToPlaylist(trackId) {
    if (!playlists.length) return createPlaylist()
    const p = playlists.find(x => x.id === activePlaylist) || playlists[0]
    if (p.trackIds.includes(trackId)) return notify('This track is already in the playlist.')
    const updated = { ...p, trackIds: [...p.trackIds, trackId] }
    await put('playlists', updated)
    setPlaylists(prev => prev.map(x => x.id === p.id ? updated : x))
    notify(`Added to ${p.name}.`)
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
    if (!window.confirm(`Remove "${track.title}" from MOODZOUND? The original file will not be deleted.`)) return
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
    setEditor(null); notify('Changes saved to the MOODZOUND library.')
  }
  function setEditorCover(file) {
    if (!file || !editor) return
    if (!file.type.startsWith('image/')) return notify('Select an image file.')
    setCropSrc(file)
  }

  async function exportEditedFile() {
    if (!editor) return
    if (extOf(editor.filename) !== 'mp3') {
      notify('Embedded metadata writing is supported for MP3 only in this version. For other formats, save your changes to MOODZOUND.')
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
      notify('MP3 file exported with ID3 tags and embedded cover art.')
    } catch (err) {
      console.error(err); notify('Unable to write the MP3 file. Check the file and try again.')
    } finally { setBusy(false) }
  }

  const cover = current ? trackCoverUrl(current) : null
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><AudioLines size={21}/></div><div><b>MOODZOUND</b><span>PERSONAL HI-FI PLAYER</span></div></div>
      <div className="top-status"><span className="status-dot"/> LOCAL LIBRARY <i/> {tracks.length} TRACKS{progress && <> <i/> IMPORTING {progress}</>}</div>
      <button className="icon-button" title="Import music" onClick={() => fileInputRef.current?.click()}><Plus size={18}/></button>
      <button className="icon-button" title="Import folder (including subfolders)" onClick={() => dirInputRef.current?.click()}><FolderPlus size={18}/></button>
      <input ref={dirInputRef} type="file" webkitdirectory="" directory="" multiple hidden onChange={e => importFiles(e.target.files)}/>
      <input ref={fileInputRef} type="file" accept="audio/*,.flac,.m4a" multiple hidden onChange={e => importFiles(e.target.files)}/>
    </header>

    <main className="workspace">
      <aside className="library-panel">
        <div className="section-label">FOLDERS</div>
        <button className={`nav-item ${selFolder === null ? 'selected' : ''}`} onClick={() => setSelFolder(null)}><Disc3 size={17}/> All Music <span>{tracks.length}</span></button>
        <div className="tree">{renderNode(tree)}</div>
        <div className="library-bottom"><div className="storage-icon"><FolderOpen size={17}/></div><div><b>Your Local Music</b><small>Stored on this device</small></div></div>
      </aside>

      <section className="main-panel">
        <div className="content-head">
          <div><div className="eyebrow">YOUR COLLECTION</div><h1>{selFolder === null ? 'Library' : selFolder.split('/').pop()}</h1><p>{visibleTracks.length} tracks in this view</p></div>
          <div className="search-box"><Search size={16}/><input aria-label="Search" placeholder="Search tracks, artists..." value={query} onChange={e => setQuery(e.target.value)}/></div>
        </div>
        <div className="toolbar"><span className="table-title">TRACKS</span><div className="toolbar-actions"><button className="subtle-button" disabled={!visibleTracks.length} onClick={() => addIds(visibleTracks.map(t => t.id))}><ListMusic size={15}/> Add all to playlist</button><button className="subtle-button" disabled={busy} onClick={() => dirInputRef.current?.click()}><FolderPlus size={15}/>{busy ? 'Processing…' : 'Import folder'}</button></div></div>
        {visibleTracks.length === 0 ? <div className="empty-state"><div className="empty-disc"><Disc3 size={34}/></div><h2>{query ? 'No matches found' : 'Your library starts here'}</h2><p>{query ? 'Try another title, artist, or album.' : 'Import audio files to build your personal collection.'}</p>{!query && <><button className="primary-button" onClick={() => dirInputRef.current?.click()}><FolderPlus size={16}/> Import folder</button><small>MP3 · WAV · FLAC · M4A · OGG · AAC</small></>}</div> :
          <div className="track-table">
            <div className="track-row table-header"><span>#</span><span>TITLE</span><span>ALBUM</span><span>FORMAT</span><span>ACTIONS</span></div>
            {visibleTracks.map((t, i) => <div key={t.id} className={`track-row ${currentId === t.id ? 'active-track' : ''}`}>
              <button className="track-number" onClick={() => playTrack(t.id)}>{currentId === t.id && playing ? <AudioLines size={16}/> : <span>{String(i+1).padStart(2,'0')}</span>}</button>
              <button className="track-info" onClick={() => playTrack(t.id)}><div className="mini-cover">{t.cover ? <img src={trackCoverUrl(t)} /> : <Disc3 size={17}/>}</div><div><b>{t.title}</b><small>{t.artist}</small></div></button>
              <span className="album-cell">{t.album}</span><span className="format-cell">{extOf(t.filename).toUpperCase()}</span>
              <div className="row-actions">{!t.sample && <button title="Edit tags and cover art" onClick={() => openEditor(t)}><Pencil size={15}/></button>}<button title="Add to playlist" onClick={() => addToPlaylist(t.id)}><ListMusic size={15}/></button>{!t.sample && <button title="Remove from library" onClick={() => deleteTrack(t)}><Trash2 size={15}/></button>}</div>
            </div>)}
          </div>}
      </section>

      <aside className="now-panel">
        <div className="now-heading"><span>NOW PLAYING</span><span className="hi-fi-label"><Headphones size={13}/> HI-FI</span></div>
        <div className="hero-art">
          {cover ? <img src={cover} /> : <div className="art-placeholder"><div className="art-ring"><Disc3 size={78} strokeWidth={1}/></div><span>MOODZOUND / HI-FI</span></div>}
        </div>
        <div className="now-meta"><div><h2>{current?.title || 'Nothing Playing'}</h2><p>{current?.artist || 'Choose a track from your library'}</p></div><button className="tiny-button" disabled={!current} onClick={() => current && openEditor(current)}><Pencil size={16}/></button></div>
        <div className="progress-wrap"><div className="progress-label"><span>{fmt(time)}</span><span>{fmt(duration)}</span></div><input aria-label="Playback progress" type="range" min="0" max={duration || 1} value={Math.min(time, duration || 1)} onChange={e => { if(audioRef.current) audioRef.current.currentTime = Number(e.target.value) }}/></div>
        <div className="transport">
          <button className={shuffle ? 'toggled' : ''} onClick={() => setShuffle(v => !v)} title="Shuffle"><Shuffle size={17}/></button>
          <button onClick={() => moveTrack(-1)} title="Previous"><SkipBack size={20} fill="currentColor"/></button>
          <button className="play-button" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={21} fill="currentColor"/> : <Play size={21} fill="currentColor"/>}</button>
          <button onClick={() => moveTrack(1)} title="Next"><SkipForward size={20} fill="currentColor"/></button>
          <button className={repeat ? 'toggled' : ''} onClick={() => setRepeat(v => !v)} title="Repeat track"><Repeat size={17}/></button>
        </div>
        <div className="volume-row"><Volume2 size={16}/><input aria-label="Volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e => setVolume(Number(e.target.value))}/></div>
        <div className="queue">
          <div className="queue-head"><select value={activePlaylist} onChange={e => setActivePlaylist(e.target.value)}>{playlists.map(p => <option key={p.id} value={p.id}>{p.name} ({p.trackIds.length})</option>)}</select>
            <button className="tiny-button" title="New playlist" onClick={createPlaylist}><Plus size={15}/></button>
            {pl && <><button className="tiny-button" title="Rename" onClick={() => renamePlaylist(pl)}><Pencil size={13}/></button><button className="tiny-button" title="Delete playlist" onClick={() => deletePlaylist(pl)}><Trash2 size={13}/></button></>}</div>
          {queue.length === 0 ? <p className="queue-empty">Playlist is empty. Double-click a folder or use the playlist icon (☰) next to a track.</p> : queue.map((t, i) => <div key={t.id} draggable onDragStart={() => dragRef.current = i} onDragOver={e => e.preventDefault()} onDrop={() => { reorder(dragRef.current, i); dragRef.current = null }} className={`queue-row ${currentId === t.id ? 'active-track' : ''}`}>
            <button onClick={() => playTrack(t.id)}><span>{String(i + 1).padStart(2, '0')}</span><div><b>{t.title}</b><small>{t.artist}</small></div></button>
            <button title="Remove from playlist" onClick={() => removeFromPlaylist(t.id)}><X size={14}/></button></div>)}
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
        <div className="modal-head"><div><span className="eyebrow">LIBRARY EDITOR</span><h2>Edit Track Information</h2></div><button className="icon-button" onClick={() => setEditor(null)}><X size={18}/></button></div>
        <div className="editor-cover-row">
          <div className="editor-cover">{editor.cover ? <img src={getUrl(`editor-${editor.id}-${editor.updatedAt || 0}`, editor.cover)}/> : <Disc3 size={40}/>}</div>
          <div><b>Album Cover</b><p>Saved to your MOODZOUND library. For MP3 files, you can also export it embedded in the file.</p><div style={{display:'flex',gap:8}}><button className="subtle-button" onClick={() => coverInputRef.current?.click()}>Choose Image</button>{editor.cover && <button className="subtle-button" onClick={() => setCropSrc(editor.cover)}>Adjust Current</button>}</div><input ref={coverInputRef} hidden type="file" accept="image/*" onChange={e => setEditorCover(e.target.files?.[0])}/></div>
        </div>
        <div className="form-grid">
          <label>TITLE<input value={editor.title} onChange={e => setEditor({...editor,title:e.target.value})}/></label>
          <label>ARTIST<input value={editor.artist} onChange={e => setEditor({...editor,artist:e.target.value})}/></label>
          <label>ALBUM<input value={editor.album} onChange={e => setEditor({...editor,album:e.target.value})}/></label>
          <label>YEAR<input value={editor.year} onChange={e => setEditor({...editor,year:e.target.value})}/></label>
          <label>GENRE<input value={editor.genre} onChange={e => setEditor({...editor,genre:e.target.value})}/></label>
        </div>
        <div className="metadata-warning"><b>Version limitations:</b> Changes are saved to the MOODZOUND library. For MP3 files, "Export MP3 with Metadata" creates a new copy with ID3 tags and embedded cover art. WAV, FLAC, M4A, and OGG do not yet support embedded metadata writing.</div>
        <div className="modal-actions"><button className="subtle-button" onClick={() => setEditor(null)}>Cancel</button><button className="subtle-button" disabled={busy || extOf(editor.filename) !== 'mp3'} onClick={exportEditedFile}><Download size={14}/> Export MP3</button><button className="primary-button" onClick={saveEditor}>Save to MOODZOUND</button></div>
      </div>
    </div>}
  </div>
}
