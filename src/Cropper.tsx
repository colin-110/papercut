import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'

type Rect = { x: number; y: number; w: number; h: number }
type Mode = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type Filter = 'none' | 'clean' | 'bw'
type Props = {
  file: File
  fresh: boolean
  maxPixels: number
  onApply: (file: File) => void
  onSkip: () => void
  onCancel: () => void
}

const minSize = 0.08
const ratios: { label: string; value: number | null }[] = [
  { label: 'Free', value: null },
  { label: 'A4', value: 210 / 297 },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
]
const previewFilter: Record<Filter, string> = {
  none: 'none',
  clean: 'contrast(1.25) brightness(1.06) saturate(.9)',
  bw: 'grayscale(1) contrast(1.6) brightness(1.1)',
}
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)
const startRect: Rect = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }

export default function Cropper({ file, fresh, maxPixels, onApply, onSkip, onCancel }: Props) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  const frameRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [natural, setNatural] = useState({ w: 1, h: 1 })
  const [rect, setRect] = useState<Rect>(startRect)
  const [ratio, setRatio] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('none')
  const [busy, setBusy] = useState(false)

  useEffect(() => () => URL.revokeObjectURL(url), [url])
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const fitRatio = (value: number | null, current = rect): Rect => {
    if (value === null) return current
    // largest rectangle with this pixel ratio, centred on the current crop
    let w = 0.92
    let h = (w * natural.w / value) / natural.h
    if (h > 0.92) { h = 0.92; w = (h * natural.h * value) / natural.w }
    return { x: clamp(current.x + current.w / 2 - w / 2, 0, 1 - w), y: clamp(current.y + current.h / 2 - h / 2, 0, 1 - h), w, h }
  }
  const chooseRatio = (value: number | null) => { setRatio(value); setRect((current) => fitRatio(value, current)) }

  const startDrag = (event: PointerEvent<HTMLElement>, mode: Mode) => {
    event.preventDefault()
    event.stopPropagation()
    const frame = frameRef.current?.getBoundingClientRect()
    if (!frame) return
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const [sx, sy, origin] = [event.clientX, event.clientY, rect]
    const abort = new AbortController()
    const onMove = (move: globalThis.PointerEvent) => {
      const dx = (move.clientX - sx) / frame.width
      const dy = (move.clientY - sy) / frame.height
      if (mode === 'move') {
        setRect({ ...origin, x: clamp(origin.x + dx, 0, 1 - origin.w), y: clamp(origin.y + dy, 0, 1 - origin.h) })
        return
      }
      let { x, y, w, h } = origin
      if (mode.includes('w')) { x = clamp(origin.x + dx, 0, origin.x + origin.w - minSize); w = origin.x + origin.w - x }
      if (mode.includes('e')) w = clamp(origin.w + dx, minSize, 1 - origin.x)
      if (mode.includes('n')) { y = clamp(origin.y + dy, 0, origin.y + origin.h - minSize); h = origin.y + origin.h - y }
      if (mode.includes('s')) h = clamp(origin.h + dy, minSize, 1 - origin.y)
      if (ratio !== null) {
        const anchorX = mode.includes('w') ? origin.x + origin.w : origin.x
        const anchorY = mode.includes('n') ? origin.y + origin.h : origin.y
        const maxW = mode.includes('w') ? anchorX : 1 - anchorX
        const maxH = mode.includes('n') ? anchorY : 1 - anchorY
        h = (w * natural.w / ratio) / natural.h
        if (h > maxH) { h = maxH; w = (h * natural.h * ratio) / natural.w }
        if (w > maxW) { w = maxW; h = (w * natural.w / ratio) / natural.h }
        w = Math.max(w, minSize)
        h = (w * natural.w / ratio) / natural.h
        x = mode.includes('w') ? anchorX - w : anchorX
        y = mode.includes('n') ? anchorY - h : anchorY
      }
      setRect({ x, y, w, h })
    }
    const finish = () => abort.abort()
    target.addEventListener('pointermove', onMove, { signal: abort.signal })
    target.addEventListener('pointerup', finish, { signal: abort.signal })
    target.addEventListener('pointercancel', finish, { signal: abort.signal })
  }

  const apply = async () => {
    const image = imageRef.current
    if (!image || busy) return
    setBusy(true)
    try {
      const sx = Math.round(rect.x * image.naturalWidth)
      const sy = Math.round(rect.y * image.naturalHeight)
      const sw = Math.max(1, Math.round(rect.w * image.naturalWidth))
      const sh = Math.max(1, Math.round(rect.h * image.naturalHeight))
      const shrink = Math.min(1, Math.sqrt(maxPixels / (sw * sh)))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(sw * shrink))
      canvas.height = Math.max(1, Math.floor(sh * shrink))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas unavailable')
      const lossless = filter === 'none' && /png|svg|gif|webp/.test(file.type)
      if (!lossless) { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height) }
      const nativeFilter = typeof context.filter === 'string'
      if (nativeFilter && filter !== 'none') context.filter = previewFilter[filter]
      context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      if (!nativeFilter && filter !== 'none') {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
        const data = pixels.data
        for (let i = 0; i < data.length; i += 4) {
          if (filter === 'bw') {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
            const value = clamp((gray - 128) * 1.6 + 128 + 25, 0, 255)
            data[i] = data[i + 1] = data[i + 2] = value
          } else {
            for (let c = 0; c < 3; c++) data[i + c] = clamp((data[i + c] - 128) * 1.25 + 128 + 15, 0, 255)
          }
        }
        context.putImageData(pixels, 0, 0)
      }
      const type = lossless ? 'image/png' : 'image/jpeg'
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92))
      canvas.width = 0
      canvas.height = 0
      if (!blob) throw new Error('encode failed')
      const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
      onApply(new File([blob], `${base}.${lossless ? 'png' : 'jpg'}`, { type, lastModified: Date.now() }))
    } catch {
      setBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
      else if (event.key === 'Enter') void apply()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const box: CSSProperties = { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }
  const handles: Mode[] = ratio === null ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] : ['nw', 'ne', 'se', 'sw']

  return (
    <div className="cropper" role="dialog" aria-modal="true" aria-label="Crop photo">
      <header className="crop-top">
        <strong>{fresh ? 'Trim your photo' : 'Crop image'}</strong>
        <button type="button" className="crop-close" aria-label="Close" onClick={onCancel}>×</button>
      </header>
      <div className="crop-stage">
        <div className="crop-frame" ref={frameRef}>
          <img ref={imageRef} src={url} alt="" draggable={false} style={{ filter: previewFilter[filter] }} onLoad={(event) => setNatural({ w: event.currentTarget.naturalWidth || 1, h: event.currentTarget.naturalHeight || 1 })} />
          <div className="crop-box" style={box} onPointerDown={(event) => startDrag(event, 'move')}>
            {handles.map((mode) => <span key={mode} className={`crop-handle h-${mode}`} onPointerDown={(event) => startDrag(event, mode)} />)}
          </div>
        </div>
      </div>
      <div className="crop-controls">
        <div className="crop-chips" role="group" aria-label="Shape">
          {ratios.map((item) => <button type="button" key={item.label} className={ratio === item.value ? 'on' : ''} onClick={() => chooseRatio(item.value)}>{item.label}</button>)}
        </div>
        <div className="crop-chips" role="group" aria-label="Look">
          {(['none', 'clean', 'bw'] as Filter[]).map((item) => <button type="button" key={item} className={filter === item ? 'on' : ''} onClick={() => setFilter(item)}>{item === 'none' ? 'Original' : item === 'clean' ? 'Clean' : 'B&W'}</button>)}
        </div>
        <div className="crop-actions">
          {fresh ? <button type="button" onClick={onSkip}>Use full photo</button> : <button type="button" onClick={onCancel}>Cancel</button>}
          <button type="button" onClick={() => { setRatio(null); setRect(startRect); setFilter('none') }}>Reset</button>
          <button type="button" className="primary" disabled={busy} onClick={() => void apply()}>{busy ? 'Working…' : fresh ? 'Crop & add' : 'Apply crop'}</button>
        </div>
      </div>
    </div>
  )
}
