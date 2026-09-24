import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, DragEvent, MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import './Papercut.css'

type Asset = { id: number; file: File; preview: string | null; rotation: number }
const formatOptions = ['PDF', 'JPG', 'PNG', 'WEBP']
const maxFileSize = 250 * 1024 * 1024
const supportedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg']
type Petal = { dx: number; dy: number; rot: number; delay: number; size: number; color: string }
const petalColors = ['#f17a64', '#79b89e', '#f3eee6', '#e9c46a']
const makePetals = (): Petal[] => Array.from({ length: 34 }, (_, i) => {
  const angle = Math.random() * Math.PI * 2
  const distance = 110 + Math.random() * 190
  return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance * 0.8 - 40, rot: (Math.random() - 0.5) * 720, delay: Math.random() * 180, size: 6 + Math.random() * 7, color: petalColors[i % petalColors.length] }
})
const pageSizes = { Original: null, A4: [595.28, 841.89], Letter: [612, 792] } as const
function App() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [outputFormat, setOutputFormat] = useState('PDF')
  const [quality, setQuality] = useState(82)
  const [isDragging, setIsDragging] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exported, setExported] = useState(false)
  const [doneInfo, setDoneInfo] = useState<{ name: string; size: string; leaving: boolean; petals: Petal[] } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pageSize, setPageSize] = useState<keyof typeof pageSizes>('Original')
  const [fileName, setFileName] = useState('papercut-export')
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('papercut-theme') === 'dark')
  const [watermark, setWatermark] = useState('')
  const [watermarkOpacity, setWatermarkOpacity] = useState(35)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const cancelRef = useRef(false)
  const sweepingRef = useRef(false)
  const [leavingIds, setLeavingIds] = useState<number[]>([])
  const [clearing, setClearing] = useState(false)
  const [landed, setLanded] = useState(false)
  const rowOffsets = useRef(new Map<number, number>())
  const previousCount = useRef(0)
  const [pageDrag, setPageDrag] = useState(false)
  const addFilesRef = useRef<(files: File[]) => void>(() => {})
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light'
    localStorage.setItem('papercut-theme', theme)
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#1e1d1a' : '#f2eee7')
  }, [darkMode])
  useEffect(() => {
    history.scrollRestoration = 'manual'
    const resetScroll = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    resetScroll()
    const frame = window.requestAnimationFrame(resetScroll)
    return () => window.cancelAnimationFrame(frame)
  }, [])
  useEffect(() => {
    if (!doneInfo || doneInfo.leaving) return
    const timer = window.setTimeout(() => setDoneInfo((current) => current && { ...current, leaving: true }), 3400)
    return () => window.clearTimeout(timer)
  }, [doneInfo])
  useEffect(() => {
    if (!doneInfo?.leaving) return
    const timer = window.setTimeout(() => setDoneInfo(null), 600)
    return () => window.clearTimeout(timer)
  }, [doneInfo?.leaving])
  useLayoutEffect(() => {
    const next = new Map<number, number>()
    document.querySelectorAll<HTMLElement>('.file-row[data-id]').forEach((row) => {
      const id = Number(row.dataset.id)
      next.set(id, row.offsetTop)
      const before = rowOffsets.current.get(id)
      if (before !== undefined && Math.abs(before - row.offsetTop) > 1 && !row.classList.contains('is-leaving')) {
        row.animate([{ transform: `translateY(${before - row.offsetTop}px)` }, { transform: 'translateY(0)' }], { duration: 650, easing: 'cubic-bezier(.22, 1, .36, 1)' })
      }
    })
    rowOffsets.current = next
  }, [assets, leavingIds])
  useEffect(() => {
    const grew = assets.length > previousCount.current
    previousCount.current = assets.length
    if (!grew) return
    setLanded(true)
    const timer = window.setTimeout(() => setLanded(false), 1100)
    return () => window.clearTimeout(timer)
  }, [assets.length])
  useEffect(() => {
    // paste images/PDFs from the clipboard, and accept drops anywhere on the page
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length) { event.preventDefault(); addFilesRef.current(files) }
    }
    let depth = 0
    const hasFiles = (event: globalThis.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
    const onEnter = (event: globalThis.DragEvent) => { if (hasFiles(event)) { depth++; setPageDrag(true) } }
    const onLeave = (event: globalThis.DragEvent) => { if (hasFiles(event)) { depth = Math.max(0, depth - 1); if (!depth) setPageDrag(false) } }
    const onOver = (event: globalThis.DragEvent) => { if (hasFiles(event)) event.preventDefault() }
    const onDropAnywhere = (event: globalThis.DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth = 0
      setPageDrag(false)
      if (!(event.target as Element | null)?.closest?.('.dropzone')) addFilesRef.current(Array.from(event.dataTransfer?.files ?? []))
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDropAnywhere)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDropAnywhere)
    }
  }, [])
  const totalSize = useMemo(() => assets.reduce((sum, asset) => sum + asset.file.size, 0), [assets])
  const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
  const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isSupported = (file: File) => supportedExtensions.includes(file.name.split('.').pop()?.toLowerCase() ?? '')
  const addFiles = (files: File[]) => {
    const supported = files.filter((file) => isSupported(file) && file.size <= maxFileSize)
    const rejectedCount = files.length - supported.length
    setNotice(rejectedCount ? `${rejectedCount} file${rejectedCount > 1 ? 's were' : ' was'} skipped. Use supported files under 250 MB.` : '')
    setAssets((current) => [...current, ...supported.map((file, index) => ({ id: Date.now() + index + Math.random(), file, preview: !isPdf(file) ? URL.createObjectURL(file) : null, rotation: 0 }))])
    setExported(false)
  }
  useEffect(() => { addFilesRef.current = addFiles })
  const onInput = (event: ChangeEvent<HTMLInputElement>) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = '' }
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); addFiles(Array.from(event.dataTransfer.files)) }
  const removeAssetNow = (id: number) => setAssets((current) => { const asset = current.find((item) => item.id === id); if (asset?.preview) URL.revokeObjectURL(asset.preview); return current.filter((item) => item.id !== id) })
  const removeAsset = (id: number) => {
    if (leavingIds.includes(id)) return
    setLeavingIds((current) => [...current, id])
    window.setTimeout(() => { removeAssetNow(id); setLeavingIds((current) => current.filter((item) => item !== id)) }, 460)
  }
  const moveAsset = (id: number, direction: -1 | 1) => setAssets((current) => { const index = current.findIndex((asset) => asset.id === id); const nextIndex = index + direction; if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current; const next = [...current]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next })
  const rotateAsset = (id: number) => setAssets((current) => current.map((asset) => asset.id === id ? { ...asset, rotation: (asset.rotation + 90) % 360 } : asset))
  const clearAllNow = () => { assets.forEach((asset) => asset.preview && URL.revokeObjectURL(asset.preview)); setAssets([]); setNotice(''); setError(''); setExported(false) }
  const clearAll = () => {
    if (clearing || !assets.length) return
    setClearing(true)
    setLeavingIds(assets.map((asset) => asset.id))
    window.setTimeout(() => { clearAllNow(); setLeavingIds([]); setClearing(false) }, 460 + Math.min(assets.length, 8) * 50)
  }
  const safeFileName = () => fileName.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'papercut-export'
  const toggleTheme = () => {
    if (sweepingRef.current) return
    const nextDark = !darkMode
    const root = document.documentElement
    const applyTheme = () => {
      flushSync(() => setDarkMode(nextDark))
      root.dataset.theme = nextDark ? 'dark' : 'light'
    }
    const doc = document as Document & { startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> } }
    if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { applyTheme(); return }
    // a single soft diagonal sweep: dark rises from the bottom-left, light returns from the top-right
    sweepingRef.current = true
    root.dataset.themeSweep = nextDark ? 'to-dark' : 'to-light'
    const transition = doc.startViewTransition(applyTheme)
    transition.ready.then(() => {
      root.animate(
        { maskPosition: nextDark ? ['100% 0%', '0% 100%'] : ['0% 100%', '100% 0%'] },
        { duration: 1500, easing: 'cubic-bezier(.45, 0, .2, 1)', pseudoElement: '::view-transition-new(root)', fill: 'both' },
      )
    }).catch(() => {})
    transition.finished.finally(() => { delete root.dataset.themeSweep; sweepingRef.current = false })
  }
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setDoneInfo({ name: filename, size: formatBytes(blob.size), leaving: false, petals: makePetals() })
    navigator.vibrate?.([14, 50, 22])
  }

  const decorateCanvas = (canvas: HTMLCanvasElement) => {
    if (!watermark.trim()) return
    const context = canvas.getContext('2d')!
    context.save()
    context.globalAlpha = watermarkOpacity / 100
    context.fillStyle = '#202522'
    context.font = `${Math.max(18, Math.round(canvas.width / 28))}px Georgia`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate(-Math.PI / 6)
    context.fillText(watermark.trim(), 0, 0)
    context.restore()
  }

  const imageToCanvas = async (file: File, rotation = 0) => {
    const canvas = document.createElement('canvas')
    if ('createImageBitmap' in window) {
      const image = await createImageBitmap(file)
      const sideways = rotation % 180 !== 0
      canvas.width = sideways ? image.height : image.width
      canvas.height = sideways ? image.width : image.height
      const context = canvas.getContext('2d')!
      context.translate(canvas.width / 2, canvas.height / 2)
      context.rotate((rotation * Math.PI) / 180)
      context.drawImage(image, -image.width / 2, -image.height / 2)
      image.close()
      return canvas
    }
    const image = new Image()
    image.src = URL.createObjectURL(file)
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(`Could not decode ${file.name}`)) })
    const sideways = rotation % 180 !== 0
    canvas.width = sideways ? image.naturalHeight : image.naturalWidth
    canvas.height = sideways ? image.naturalWidth : image.naturalHeight
    const context = canvas.getContext('2d')!
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate((rotation * Math.PI) / 180)
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
    URL.revokeObjectURL(image.src)
    return canvas
  }

  const pdfToCanvases = async (file: File) => {
    const pdfjsLib = await import('pdfjs-dist')
    const pdfWorker = await import('pdfjs-dist/build/pdf.worker.mjs?url')
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default
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
    const { PDFDocument } = await import('pdf-lib')
    const output = await PDFDocument.create()
    for (const [index, asset] of assets.entries()) {
      if (cancelRef.current) throw new Error('Conversion cancelled.')
      setProgressLabel(`Preparing file ${index + 1} of ${assets.length}`)
      setProgress(Math.round((index / assets.length) * 90))
      if (isPdf(asset.file)) {
        const source = await PDFDocument.load(await asset.file.arrayBuffer())
        const pages = await output.copyPages(source, source.getPageIndices())
        pages.forEach((page) => output.addPage(page))
        continue
      }
      const canvas = await imageToCanvas(asset.file, asset.rotation)
      decorateCanvas(canvas)
      const targetSize = pageSizes[pageSize]
      const page = output.addPage(targetSize ? [targetSize[0], targetSize[1]] : [canvas.width, canvas.height])
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => canvas.toBlob((blob) => blob ? blob.arrayBuffer().then(resolve) : reject(new Error('Image encoding failed')), 'image/png'))
      const image = await output.embedPng(bytes)
      if (!targetSize) {
        page.drawImage(image, { x: 0, y: 0, width: canvas.width, height: canvas.height })
      } else {
        const margin = 28
        const scale = Math.min((targetSize[0] - margin * 2) / canvas.width, (targetSize[1] - margin * 2) / canvas.height)
        const width = canvas.width * scale
        const height = canvas.height * scale
        page.drawImage(image, { x: (targetSize[0] - width) / 2, y: (targetSize[1] - height) / 2, width, height })
      }
    }
    const pdfBytes = await output.save()
    setProgress(100)
    downloadBlob(new Blob([new Uint8Array(pdfBytes).buffer as ArrayBuffer], { type: 'application/pdf' }), `${safeFileName()}.pdf`)
  }

  const exportImages = async () => {
    const JSZip = (await import('jszip')).default
    const mime = outputFormat === 'JPG' ? 'image/jpeg' : outputFormat === 'WEBP' ? 'image/webp' : 'image/png'
    const extension = outputFormat.toLowerCase()
    const convertedPages: Blob[] = []
    for (const [index, asset] of assets.entries()) {
      if (cancelRef.current) throw new Error('Conversion cancelled.')
      setProgressLabel(`Converting file ${index + 1} of ${assets.length}`)
      setProgress(Math.round((index / assets.length) * 90))
      const canvases = isPdf(asset.file) ? await pdfToCanvases(asset.file) : [await imageToCanvas(asset.file, asset.rotation)]
      for (const canvas of canvases) {
        decorateCanvas(canvas)
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Image encoding failed')), mime, quality / 100))
        convertedPages.push(blob)
      }
    }
    setProgress(100)
    if (convertedPages.length === 1) {
      downloadBlob(convertedPages[0], `${safeFileName()}-page-01.${extension}`)
      return
    }
    const zip = new JSZip()
    convertedPages.forEach((blob, index) => zip.file(`page-${String(index + 1).padStart(2, '0')}.${extension}`, blob))
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `${safeFileName()}-images-${extension}.zip`)
  }

  const playExportLaunch = (event: MouseEvent<HTMLButtonElement>) => {
    if (!assets.length || isExporting || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const button = event.currentTarget
    const box = button.getBoundingClientRect()
    const ripple = document.createElement('span')
    ripple.className = 'export-ripple'
    ripple.style.left = `${event.clientX - box.left}px`
    ripple.style.top = `${event.clientY - box.top}px`
    button.append(ripple)
    ripple.addEventListener('animationend', () => ripple.remove())
    // paper sheets lift off the file list, arc toward the button and get absorbed by it
    const source = (document.querySelector('.file-list') ?? button).getBoundingClientRect()
    const sheets = Math.min(4, Math.max(2, assets.length))
    for (let i = 0; i < sheets; i++) {
      const sheet = document.createElement('div')
      sheet.className = 'fly-sheet'
      document.body.append(sheet)
      const startX = source.left + 30 + Math.random() * Math.min(240, source.width - 60)
      const startY = source.top + 20 + Math.random() * 30
      const endX = box.left + box.width / 2 - 13
      const endY = box.top + box.height / 2 - 17
      const tilt = (i % 2 ? 1 : -1) * (8 + i * 5)
      sheet.animate([
        { transform: `translate(${startX}px, ${startY}px) rotate(${tilt}deg) scale(1)`, opacity: 0 },
        { transform: `translate(${startX}px, ${startY}px) rotate(${tilt}deg) scale(1.08)`, opacity: 1, offset: 0.16 },
        { transform: `translate(${(startX + endX) / 2}px, ${Math.min(startY, endY) - 70}px) rotate(${-tilt}deg) scale(.9)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${endX}px, ${endY}px) rotate(0deg) scale(.25)`, opacity: 0 },
      ], { duration: 900, delay: i * 110, easing: 'cubic-bezier(.5, 0, .2, 1)', fill: 'both' }).finished.then(() => sheet.remove(), () => sheet.remove())
    }
    button.animate([{ transform: 'scale(1)' }, { transform: 'scale(.97)', offset: 0.12 }, { transform: 'scale(1)', offset: 0.55 }, { transform: 'scale(1.035)', offset: 0.82 }, { transform: 'scale(1)' }], { duration: 1200, easing: 'ease-out' })
  }

  const exportFiles = async () => {
    if (!assets.length) return
    setIsExporting(true)
    cancelRef.current = false
    setProgress(0)
    setProgressLabel('Starting local conversion')
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
      setProgressLabel('')
    }
  }

  const cancelExport = () => { cancelRef.current = true }

  return (
    <>
      <div className="ambient" aria-hidden="true"><i /><i /><i /></div>
      {pageDrag && <div className="page-drop" aria-hidden="true"><div><span>↥</span><strong>Drop to add</strong><small>PDF · JPG · PNG · WEBP · SVG</small></div></div>}
    <main className={`app-shell ${darkMode ? 'dark-mode' : ''}`}>
      <header className="topbar"><div className="brand"><span className="brand-mark">◒</span><span>papercut</span></div><div className="privacy-pill"><span className="status-dot" /> local-only processing</div><button className="icon-button" type="button" aria-label={`Use ${darkMode ? 'light' : 'dark'} theme`} onClick={toggleTheme}>{darkMode ? '☼' : '◐'}</button></header>
      <section className="intro"><div><p className="eyebrow">PRIVATE DOCUMENT WORKSPACE <span>·</span> 01</p><h1 className="hero-title"><span className="word" style={{ '--i': 0 } as CSSProperties}>Photo</span> <span className="word" style={{ '--i': 1 } as CSSProperties}>to</span> <span className="word" style={{ '--i': 2 } as CSSProperties}>PDF</span><br /><em><span className="word" style={{ '--i': 3 } as CSSProperties}>converter.</span></em></h1></div><p className="intro-copy">A free photo to PDF converter and PDF image converter that works privately in your browser.</p></section>
      <section className="workspace">
        <div className="main-column">
          <div className={`dropzone ${isDragging ? 'is-dragging' : ''} ${landed ? 'landed' : ''}`} onMouseMove={(event) => { const box = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty('--mx', `${event.clientX - box.left}px`); event.currentTarget.style.setProperty('--my', `${event.clientY - box.top}px`); event.currentTarget.style.setProperty('--tx', `${((event.clientY - box.top) / box.height - 0.5) * -3.2}deg`); event.currentTarget.style.setProperty('--ty', `${((event.clientX - box.left) / box.width - 0.5) * 3.2}deg`) }} onMouseLeave={(event) => { event.currentTarget.style.setProperty('--tx', '0deg'); event.currentTarget.style.setProperty('--ty', '0deg') }} onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && inputRef.current?.click()}>
            <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.svg" multiple onChange={onInput} /><span className="drop-icon">↥</span><div><strong>Drop files to begin</strong><span>or browse from your device</span></div><small>PDF · JPG · PNG · WEBP · SVG · or paste with Ctrl V</small>
          </div>
          <div className="section-heading"><span>YOUR FILES <b>{assets.length.toString().padStart(2, '0')}</b></span><span className="section-actions"><button type="button" onClick={() => inputRef.current?.click()}>+ Add more</button>{assets.length > 0 && <button type="button" onClick={clearAll}>Clear all</button>}</span></div>
          {notice && <p className="intake-notice" role="status">{notice}</p>}
          <div className="file-list">{assets.length === 0 ? <div className="empty-state"><span>✦</span><p>Your working area is clear.</p><small>Files stay in this browser tab until you export or remove them.</small></div> : assets.map((asset, index) => <article className={`file-row ${leavingIds.includes(asset.id) ? 'is-leaving' : ''} ${clearing ? 'stagger' : ''}`} data-id={asset.id} style={{ '--n': index } as CSSProperties} key={asset.id}><div className={`file-thumb ${asset.preview ? 'image-thumb' : 'pdf-thumb'}`}>{asset.preview ? <img src={asset.preview} style={{ transform: `rotate(${asset.rotation}deg)` }} alt="" /> : <span>PDF</span>}</div><div className="file-meta"><strong>{asset.file.name}</strong><span>{isPdf(asset.file) ? 'PDF' : asset.file.name.split('.').pop()?.toUpperCase() || 'IMAGE'} · {formatBytes(asset.file.size)}</span></div><span className="file-number">{String(index + 1).padStart(2, '0')}</span><div className="row-actions"><button type="button" aria-label={`Rotate ${asset.file.name}`} disabled={isPdf(asset.file)} onClick={() => rotateAsset(asset.id)}>↻</button><button type="button" aria-label={`Move ${asset.file.name} up`} disabled={index === 0} onClick={() => moveAsset(asset.id, -1)}>↑</button><button type="button" aria-label={`Move ${asset.file.name} down`} disabled={index === assets.length - 1} onClick={() => moveAsset(asset.id, 1)}>↓</button><button type="button" className="remove-button" aria-label={`Remove ${asset.file.name}`} onClick={() => removeAsset(asset.id)}>×</button></div></article>)}</div>
        </div>
        <aside className="control-panel"><div className="panel-title"><span>OUTPUT SETTINGS</span><span className="spark">✳</span></div><label className="field-label">CONVERT TO</label><div className="format-grid">{formatOptions.map((format) => <button className={outputFormat === format ? 'selected' : ''} key={format} type="button" onClick={() => { setOutputFormat(format); setError(''); setExported(false) }}>{format}<span>{format === 'PDF' ? 'document' : 'image'}</span></button>)}</div>{outputFormat === 'PDF' && <div className="swap-in"><label className="field-label quality-label" htmlFor="page-size">PAGE SIZE</label><select className="select-control" id="page-size" value={pageSize} onChange={(event) => setPageSize(event.target.value as keyof typeof pageSizes)}><option>Original</option><option>A4</option><option>Letter</option></select></div>}<label className="field-label quality-label" htmlFor="quality">QUALITY <output>{quality}%</output></label><input className="range" id="quality" type="range" min="10" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /><div className="range-labels"><span>smaller file</span><span>best quality</span></div><label className="field-label quality-label" htmlFor="file-name">FILE NAME</label><input className="text-control" id="file-name" value={fileName} onChange={(event) => { setFileName(event.target.value); setExported(false) }} /><label className="field-label quality-label" htmlFor="watermark">WATERMARK <span>OPTIONAL</span></label><input className="text-control" id="watermark" placeholder="e.g. CONFIDENTIAL" value={watermark} onChange={(event) => setWatermark(event.target.value)} />{watermark && <><label className="field-label quality-label" htmlFor="watermark-opacity">WATERMARK OPACITY <output>{watermarkOpacity}%</output></label><input className="range" id="watermark-opacity" type="range" min="10" max="100" value={watermarkOpacity} onChange={(event) => setWatermarkOpacity(Number(event.target.value))} /></>}<div className="divider" /><div className="option-row"><span><b>▣</b> Remove metadata</span><span className="toggle on">✓</span></div><div className="option-row"><span><b>⌁</b> Preserve page order</span><span className="toggle on">✓</span></div>{isExporting && <div className="progress-box"><div className="progress-label"><span>{progressLabel}</span><span>{progress}%</span></div><progress value={progress} max="100" /></div>}<button className={`export-button ${isExporting ? 'is-busy' : ''} ${exported ? 'done' : ''}`} type="button" disabled={!assets.length || isExporting} onClick={(event) => { playExportLaunch(event); exportFiles() }}>{isExporting ? 'Converting locally…' : exported ? 'Downloaded ✓' : `Export ${outputFormat}`}<span>↗</span></button>{isExporting && <button className="cancel-button" type="button" onClick={cancelExport}>Cancel conversion</button>}{error && <p className="export-error" role="alert">{error}</p>}<p className="local-note"><span className="lock">⌑</span> Nothing leaves your device. Processing happens locally in your browser.</p></aside>
      </section>
      <section className="seo-content" aria-label="About Papercut"><div><p className="eyebrow">BUILT FOR THE BROWSER</p><h2>Photo to PDF conversion<br /><em>without the upload.</em></h2></div><div className="seo-copy"><p>Turn JPG, PNG, WEBP, GIF, or SVG images into a PDF, or convert PDF pages back to JPG, PNG, or WEBP. Papercut processes files locally on your device, so your documents do not need to leave your browser.</p><div className="trust-row"><span>✓ No account</span><span>✓ No upload</span><span>✓ Free to use</span></div><div className="faq-grid"><details><summary>Is Papercut free?</summary><p>Yes. Papercut is free to use and has no account or upload requirement.</p></details><details><summary>Can I convert multiple photos?</summary><p>Yes. Add multiple images, arrange their order, and export them as one PDF or a ZIP of images.</p></details></div></div></section>
      <footer><span>papercut / browser edition</span><span>{assets.length ? `${assets.length} file${assets.length > 1 ? 's' : ''} · ${formatBytes(totalSize)}` : 'ready when you are'} <i>●</i></span></footer>
      {doneInfo && (
        <div className={`airdrop ${doneInfo.leaving ? 'is-leaving' : ''}`} role="status" onClick={() => setDoneInfo((current) => current && { ...current, leaving: true })}>
          <div className="airdrop-stage">
            <i className="ring r1" /><i className="ring r2" /><i className="ring r3" />
            {doneInfo.petals.map((petal, index) => <i className="petal" key={index} style={{ '--dx': `${petal.dx}px`, '--dy': `${petal.dy}px`, '--rot': `${petal.rot}deg`, '--delay': `${petal.delay}ms`, '--size': `${petal.size}px`, background: petal.color } as CSSProperties} />)}
            <div className="airdrop-core"><svg viewBox="0 0 52 52" aria-hidden="true"><path d="M14 27.5l8.5 8.5L38.5 18" /></svg></div>
          </div>
          <p className="airdrop-title">Saved to your device</p>
          <p className="airdrop-sub">{doneInfo.name} · {doneInfo.size}</p>
        </div>
      )}
    </main>
    </>
  )
}

export default App
