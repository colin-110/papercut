import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import './Papercut.css'

type Asset = { id: number; file: File; preview: string | null }
const formatOptions = ['PDF', 'JPG', 'PNG', 'WEBP']
const maxFileSize = 250 * 1024 * 1024
const supportedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg']
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

function App() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [outputFormat, setOutputFormat] = useState('PDF')
  const [quality, setQuality] = useState(82)
  const [isDragging, setIsDragging] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exported, setExported] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const totalSize = useMemo(() => assets.reduce((sum, asset) => sum + asset.file.size, 0), [assets])
  const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
  const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isSupported = (file: File) => supportedExtensions.includes(file.name.split('.').pop()?.toLowerCase() ?? '')
  const addFiles = (files: File[]) => {
    const supported = files.filter((file) => isSupported(file) && file.size <= maxFileSize)
    const rejectedCount = files.length - supported.length
    setNotice(rejectedCount ? `${rejectedCount} file${rejectedCount > 1 ? 's were' : ' was'} skipped. Use supported files under 250 MB.` : '')
    setAssets((current) => [...current, ...supported.map((file, index) => ({ id: Date.now() + index + Math.random(), file, preview: !isPdf(file) ? URL.createObjectURL(file) : null }))])
    setExported(false)
  }
  const onInput = (event: ChangeEvent<HTMLInputElement>) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = '' }
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); addFiles(Array.from(event.dataTransfer.files)) }
  const removeAsset = (id: number) => setAssets((current) => { const asset = current.find((item) => item.id === id); if (asset?.preview) URL.revokeObjectURL(asset.preview); return current.filter((item) => item.id !== id) })
  const moveAsset = (id: number, direction: -1 | 1) => setAssets((current) => { const index = current.findIndex((asset) => asset.id === id); const nextIndex = index + direction; if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current; const next = [...current]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next })
  const clearAll = () => { assets.forEach((asset) => asset.preview && URL.revokeObjectURL(asset.preview)); setAssets([]); setNotice(''); setError(''); setExported(false) }
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const imageToCanvas = async (file: File) => {
    const canvas = document.createElement('canvas')
    if ('createImageBitmap' in window) {
      const image = await createImageBitmap(file)
      canvas.width = image.width
      canvas.height = image.height
      canvas.getContext('2d')?.drawImage(image, 0, 0)
      image.close()
      return canvas
    }
    const image = new Image()
    image.src = URL.createObjectURL(file)
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(`Could not decode ${file.name}`)) })
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    canvas.getContext('2d')?.drawImage(image, 0, 0)
    URL.revokeObjectURL(image.src)
    return canvas
  }

  const pdfToCanvases = async (file: File) => {
    const pdfDocument = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
    const canvases: HTMLCanvasElement[] = []
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
      canvases.push(canvas)
    }
    return canvases
  }

  const exportPdf = async () => {
    const output = await PDFDocument.create()
    for (const asset of assets) {
      if (isPdf(asset.file)) {
        const source = await PDFDocument.load(await asset.file.arrayBuffer())
        const pages = await output.copyPages(source, source.getPageIndices())
        pages.forEach((page) => output.addPage(page))
        continue
      }
      const canvas = await imageToCanvas(asset.file)
      const page = output.addPage([canvas.width, canvas.height])
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => canvas.toBlob((blob) => blob ? blob.arrayBuffer().then(resolve) : reject(new Error('Image encoding failed')), 'image/png'))
      const image = await output.embedPng(bytes)
      page.drawImage(image, { x: 0, y: 0, width: canvas.width, height: canvas.height })
    }
    const pdfBytes = await output.save()
    downloadBlob(new Blob([new Uint8Array(pdfBytes).buffer as ArrayBuffer], { type: 'application/pdf' }), 'papercut-export.pdf')
  }

  const exportImages = async () => {
    const zip = new JSZip()
    const mime = outputFormat === 'JPG' ? 'image/jpeg' : outputFormat === 'WEBP' ? 'image/webp' : 'image/png'
    const extension = outputFormat.toLowerCase()
    let pageIndex = 0
    for (const asset of assets) {
      const canvases = isPdf(asset.file) ? await pdfToCanvases(asset.file) : [await imageToCanvas(asset.file)]
      for (const canvas of canvases) {
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Image encoding failed')), mime, quality / 100))
        pageIndex += 1
        zip.file(`page-${String(pageIndex).padStart(2, '0')}.${extension}`, blob)
      }
    }
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `papercut-images-${extension}.zip`)
  }

  const exportFiles = async () => {
    if (!assets.length) return
    setIsExporting(true)
    setError('')
    setExported(false)
    try {
      if (outputFormat === 'PDF') await exportPdf()
      else await exportImages()
      setExported(true)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Could not export these files locally.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">◒</span><span>papercut</span></div><div className="privacy-pill"><span className="status-dot" /> local-only processing</div><button className="icon-button" type="button" aria-label="Open settings">•••</button></header>
      <section className="intro"><div><p className="eyebrow">PRIVATE DOCUMENT WORKSPACE <span>·</span> 01</p><h1>Make files<br /><em>move.</em></h1></div><p className="intro-copy">Convert, arrange, and polish your documents without sending a single byte away.</p></section>
      <section className="workspace">
        <div className="main-column">
          <div className={`dropzone ${isDragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && inputRef.current?.click()}>
            <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.svg" multiple onChange={onInput} /><span className="drop-icon">↥</span><div><strong>Drop files to begin</strong><span>or browse from your device</span></div><small>PDF · JPG · PNG · WEBP · SVG</small>
          </div>
          <div className="section-heading"><span>YOUR FILES <b>{assets.length.toString().padStart(2, '0')}</b></span><span className="section-actions"><button type="button" onClick={() => inputRef.current?.click()}>+ Add more</button>{assets.length > 0 && <button type="button" onClick={clearAll}>Clear all</button>}</span></div>
          {notice && <p className="intake-notice" role="status">{notice}</p>}
          <div className="file-list">{assets.length === 0 ? <div className="empty-state"><span>✦</span><p>Your working area is clear.</p><small>Files stay in this browser tab until you export or remove them.</small></div> : assets.map((asset, index) => <article className="file-row" key={asset.id}><div className={`file-thumb ${asset.preview ? 'image-thumb' : 'pdf-thumb'}`}>{asset.preview ? <img src={asset.preview} alt="" /> : <span>PDF</span>}</div><div className="file-meta"><strong>{asset.file.name}</strong><span>{isPdf(asset.file) ? 'PDF' : asset.file.name.split('.').pop()?.toUpperCase() || 'IMAGE'} · {formatBytes(asset.file.size)}</span></div><span className="file-number">{String(index + 1).padStart(2, '0')}</span><div className="row-actions"><button type="button" aria-label={`Move ${asset.file.name} up`} disabled={index === 0} onClick={() => moveAsset(asset.id, -1)}>↑</button><button type="button" aria-label={`Move ${asset.file.name} down`} disabled={index === assets.length - 1} onClick={() => moveAsset(asset.id, 1)}>↓</button><button type="button" className="remove-button" aria-label={`Remove ${asset.file.name}`} onClick={() => removeAsset(asset.id)}>×</button></div></article>)}</div>
        </div>
        <aside className="control-panel"><div className="panel-title"><span>OUTPUT SETTINGS</span><span className="spark">✳</span></div><label className="field-label">CONVERT TO</label><div className="format-grid">{formatOptions.map((format) => <button className={outputFormat === format ? 'selected' : ''} key={format} type="button" onClick={() => { setOutputFormat(format); setError(''); setExported(false) }}>{format}<span>{format === 'PDF' ? 'document' : 'image'}</span></button>)}</div><label className="field-label quality-label" htmlFor="quality">QUALITY <output>{quality}%</output></label><input className="range" id="quality" type="range" min="10" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /><div className="range-labels"><span>smaller file</span><span>best quality</span></div><div className="divider" /><div className="option-row"><span><b>▣</b> Remove metadata</span><span className="toggle on">✓</span></div><div className="option-row"><span><b>⌁</b> Preserve page order</span><span className="toggle on">✓</span></div><button className={`export-button ${exported ? 'done' : ''}`} type="button" disabled={!assets.length || isExporting} onClick={exportFiles}>{isExporting ? 'Converting locally…' : exported ? 'Downloaded ✓' : `Export ${outputFormat}`}<span>↗</span></button>{error && <p className="export-error" role="alert">{error}</p>}<p className="local-note"><span className="lock">⌑</span> Nothing leaves your device. Processing happens locally in your browser.</p></aside>
      </section>
      <footer><span>papercut / browser edition</span><span>{assets.length ? `${assets.length} file${assets.length > 1 ? 's' : ''} · ${formatBytes(totalSize)}` : 'ready when you are'} <i>●</i></span></footer>
    </main>
  )
}

export default App
