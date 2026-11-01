import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

const SIZE = 360, OUT = 1000
const DEF = { zoom: 1, sx: 1, sy: 1, rot: 0, skew: 0, x: 0, y: 0 }

function paint(ctx, img, t, k, bg) {
  const s = ctx.canvas.width
  ctx.fillStyle = bg; ctx.fillRect(0, 0, s, s)
  ctx.save()
  ctx.translate(s / 2 + t.x * k, s / 2 + t.y * k)
  ctx.rotate(t.rot * Math.PI / 180)
  ctx.transform(1, 0, Math.tan(t.skew * Math.PI / 180), 1, 0, 0)
  ctx.scale(t.zoom * t.sx * k, t.zoom * t.sy * k)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)
  ctx.restore()
}

export default function CoverEditor({ src, onCancel, onDone }) {
  const [img, setImg] = useState(null)
  const [t, setT] = useState(DEF)
  const cv = useRef(null), drag = useRef(null)
  const fit = (im, mode) => ({ ...DEF, zoom: mode === 'fill' ? Math.max(SIZE / im.width, SIZE / im.height) : Math.min(SIZE / im.width, SIZE / im.height) })

  useEffect(() => {
    const url = URL.createObjectURL(src), im = new Image()
    im.onload = () => { setImg(im); setT(fit(im, 'fill')) }
    im.src = url
    return () => URL.revokeObjectURL(url)
  }, [src])
  useEffect(() => { if (img) paint(cv.current.getContext('2d'), img, t, 1, '#000') }, [img, t])

  const set = (k, v) => setT(p => ({ ...p, [k]: v }))
  const down = e => { drag.current = { x: e.clientX - t.x, y: e.clientY - t.y }; e.currentTarget.setPointerCapture(e.pointerId) }
  const move = e => drag.current && setT(p => ({ ...p, x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }))
  const wheel = e => setT(p => ({ ...p, zoom: Math.min(8, Math.max(.05, p.zoom * (e.deltaY < 0 ? 1.06 : .94))) }))
  const done = () => {
    const out = document.createElement('canvas'); out.width = out.height = OUT
    paint(out.getContext('2d'), img, t, OUT / SIZE, '#000')
    out.toBlob(b => b && onDone(b), 'image/jpeg', .92)
  }
  const slider = (label, k, min, max, step, unit = '') => <label className="ce-slider">
    <span>{label}<b>{k === 'zoom' || k === 'sx' || k === 'sy' ? Math.round(t[k] * 100) + '%' : Math.round(t[k]) + unit}</b></span>
    <input type="range" min={min} max={max} step={step} value={t[k]} onChange={e => set(k, Number(e.target.value))}/>
  </label>

  return <div className="modal-backdrop ce-backdrop">
    <div className="editor-modal ce-modal">
      <div className="modal-head"><div><span className="eyebrow">COVER EDITOR</span><h2>Ajustar portada</h2></div><button className="icon-button" onClick={onCancel}><X size={18}/></button></div>
      <div className="ce-stage">
        <canvas ref={cv} width={SIZE} height={SIZE} onPointerDown={down} onPointerMove={move} onPointerUp={() => drag.current = null} onWheel={wheel}/>
      </div>
      <p className="ce-hint">Arrastrá para mover · rueda del mouse para zoom · el recorte final es siempre 1:1</p>
      <div className="ce-controls">
        {slider('ZOOM', 'zoom', .05, 8, .01)}{slider('ESTIRAR ANCHO', 'sx', .3, 3, .01)}
        {slider('ESTIRAR ALTO', 'sy', .3, 3, .01)}{slider('ROTAR', 'rot', -180, 180, 1, '°')}
        {slider('INCLINAR', 'skew', -60, 60, 1, '°')}
      </div>
      <div className="modal-actions">
        <button className="subtle-button" onClick={() => img && setT(fit(img, 'fit'))}>Ajustar</button>
        <button className="subtle-button" onClick={() => img && setT(fit(img, 'fill'))}>Rellenar</button>
        <button className="subtle-button" onClick={() => img && setT(fit(img, 'fill'))}>Reiniciar</button>
        <span style={{ flex: 1 }}/>
        <button className="subtle-button" onClick={onCancel}>Cancelar</button>
        <button className="primary-button" disabled={!img} onClick={done}>Recortar y usar</button>
      </div>
    </div>
  </div>
}
