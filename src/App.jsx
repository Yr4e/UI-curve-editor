import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Boxes,
  Download,
  ExternalLink,
  Film,
  FolderOpen,
  Pause,
  Play,
  Plus,
  Rotate3D,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { pages, presetTemplates, workboxLoops } from './data/presets.js'

const inputLagPreviewUrl = window.location.protocol === 'file:'
  ? './inputlag-preview/index.html'
  : 'http://127.0.0.1:5173/'

const defaultTransform = {
  x: 0,
  y: 0,
  scale: 0.96,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  perspective: 1600,
}

const curvePresets = [
  { id: 'none', label: 'None', curve: [0, 0, 1, 1], path: 'M18 112 L242 112' },
  { id: 'linear', label: 'Linear', curve: [0, 0, 1, 1], path: 'M18 112 L242 18' },
  { id: 'ease-in', label: 'Ease In', curve: [0.55, 0.05, 0.8, 0.22], path: 'M18 112 C78 112 150 96 242 18' },
  { id: 'quad-in', label: 'Quad In', curve: [0.45, 0.02, 0.72, 0.28], path: 'M18 112 C96 112 170 82 242 18' },
  { id: 'cubic-in', label: 'Cubic In', curve: [0.72, 0, 0.88, 0.28], path: 'M18 112 C142 112 180 90 242 18' },
  { id: 'ease-out', label: 'Ease Out', curve: [0.18, 0.72, 0.25, 1], path: 'M18 112 C58 42 122 20 242 18' },
  { id: 'quad-out', label: 'Quad Out', curve: [0.16, 0.76, 0.28, 1], path: 'M18 112 C54 54 112 24 242 18' },
  { id: 'cubic-out', label: 'Cubic Out', curve: [0.08, 0.86, 0.2, 1], path: 'M18 112 C38 34 112 18 242 18' },
  { id: 'ease', label: 'Ease', curve: [0.25, 0.1, 0.25, 1], path: 'M18 112 C74 104 74 20 242 18' },
  { id: 'quad-ease', label: 'Quad Ease', curve: [0.4, 0, 0.2, 1], path: 'M18 112 C110 110 86 22 242 18' },
  { id: 'rebound-in', label: 'Rebound In', curve: [0.58, -0.42, 0.74, 1.36], path: 'M18 112 C96 150 142 -18 242 18' },
  { id: 'rebound-out', label: 'Rebound Out', curve: [0.2, 1.32, 0.62, 0.86], path: 'M18 112 C64 -22 158 52 242 18' },
]

const presetGrid = Array.from({ length: 24 }, (_, index) => {
  const template = presetTemplates[index % presetTemplates.length]
  return {
    ...template,
    id: `${template.id}-${index}`,
    sourceId: template.id,
    name: index < presetTemplates.length ? template.name : `${template.name} v${Math.floor(index / presetTemplates.length) + 1}`,
  }
})

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const pageLabel = (id) => pages.find((page) => page.id === id)?.label ?? id
const curveById = (id) => curvePresets.find((curve) => curve.id === id) ?? curvePresets[1]

const estimateWeight = (duration, fps) => {
  const frames = Math.round(duration * fps)
  return { frames, pngMb: Math.round(frames * 1.15), movMb: Math.round(frames * 0.85) }
}

const makeProject = ({ name = 'InputLag Project', duration = 6, presetId = 'empty' } = {}) => {
  const preset = presetTemplates.find((item) => item.id === presetId)
  if (!preset) {
    return {
      name,
      duration,
      fps: 60,
      speed: 1,
      page: 'boost',
      sourceUrl: inputLagPreviewUrl,
      sourceName: 'InputLag renderer preview',
      sourceFiles: 0,
      baseTransform: { ...defaultTransform },
      keyframes: [],
    }
  }

  return {
    name,
    duration: preset.duration,
    fps: preset.fps,
    speed: preset.speed,
    page: preset.page,
    sourceUrl: inputLagPreviewUrl,
    sourceName: 'InputLag renderer preview',
    sourceFiles: 0,
    baseTransform: { ...preset.start, scale: Math.max(preset.start.scale, 0.86) },
    keyframes: [
      { id: crypto.randomUUID(), time: Number(preset.duration.toFixed(2)), transform: { ...preset.end, scale: Math.max(preset.end.scale, 0.86) }, curvePreset: 'ease' },
    ],
  }
}

const bezierY = (progress, curve) => {
  const t = clamp(progress)
  const inv = 1 - t
  return clamp(3 * inv * inv * t * curve[1] + 3 * inv * t * t * curve[3] + t * t * t, -0.4, 1.4)
}

const interpolateTransform = (from, to, progress, curveId) => {
  const eased = bezierY(progress, curveById(curveId).curve)
  const next = {}
  Object.keys(defaultTransform).forEach((key) => {
    const value = from[key] + (to[key] - from[key]) * eased
    next[key] = Number(value.toFixed(key === 'scale' ? 3 : 1))
  })
  return next
}

const sortedKeyframes = (project) => [...project.keyframes].sort((a, b) => a.time - b.time)

const getTransformAtTime = (project, time) => {
  const keyframes = sortedKeyframes(project)
  if (!keyframes.length) return project.baseTransform
  const first = keyframes[0]
  if (first.time <= 0.001 && time <= 0.001) return first.transform
  if (time <= first.time) {
    const span = Math.max(first.time, 0.001)
    return interpolateTransform(project.baseTransform, first.transform, time / span, first.curvePreset)
  }
  for (let index = 1; index < keyframes.length; index += 1) {
    const prev = keyframes[index - 1]
    const next = keyframes[index]
    if (time <= next.time) {
      const span = Math.max(next.time - prev.time, 0.001)
      return interpolateTransform(prev.transform, next.transform, (time - prev.time) / span, next.curvePreset)
    }
  }
  return keyframes[keyframes.length - 1].transform
}

const getSegmentForTime = (project, time) => {
  const keyframes = sortedKeyframes(project)
  if (!keyframes.length) return null
  const first = keyframes[0]
  if (time <= first.time) return { fromTime: 0, toTime: first.time, keyframe: first }
  for (let index = 1; index < keyframes.length; index += 1) {
    const prev = keyframes[index - 1]
    const next = keyframes[index]
    if (time <= next.time) return { fromTime: prev.time, toTime: next.time, keyframe: next }
  }
  const last = keyframes[keyframes.length - 1]
  return { fromTime: last.time, toTime: project.duration, keyframe: last, hold: true }
}

function SourceBinder({ project, onBind, onNew, onDetach }) {
  const fileInputRef = useRef(null)

  const handleFiles = (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    const html = files.find((file) => file.name.toLowerCase().endsWith('.html'))
    const projectName = files[0].webkitRelativePath?.split('/')?.[0] || files[0].name
    onBind({
      sourceName: html ? html.name : projectName,
      sourceFiles: files.length,
      sourceUrl: html ? URL.createObjectURL(html) : project.sourceUrl,
    })
  }

  return (
    <section className="source-binder">
      <div className="section-header">
        <div>
          <span>InputLag source</span>
          <strong>{project.name}</strong>
        </div>
        <div className="source-actions">
          <button onClick={onNew}><Plus size={15} /> New</button>
          <button onClick={onDetach}><ExternalLink size={15} /> Detach</button>
          <button onClick={() => fileInputRef.current?.click()}><FolderOpen size={15} /> Bind version</button>
        </div>
      </div>
      <div className="source-body">
        <div>
          <span className="source-dot live" />
          <strong>{project.sourceName}</strong>
          <p>{project.sourceFiles ? `${project.sourceFiles} files selected` : 'Default: local InputLag renderer preview'}</p>
        </div>
        <small>{project.sourceUrl}</small>
      </div>
      <input ref={fileInputRef} type="file" multiple webkitdirectory="true" directory="true" onChange={handleFiles} hidden />
    </section>
  )
}

function NewProjectModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('InputLag Project')
  const [duration, setDuration] = useState(6)
  const [presetId, setPresetId] = useState('empty')

  if (!open) return null
  return (
    <div className="modal-backdrop">
      <div className="new-modal">
        <div className="modal-head">
          <span>Create new</span>
          <strong>Project setup</strong>
        </div>
        <label>
          Project name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Length, seconds
          <input type="number" min="1" max="90" step="0.1" value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
        </label>
        <label>
          Starting preset
          <select value={presetId} onChange={(event) => setPresetId(event.target.value)}>
            <option value="empty">No preset - empty straight window</option>
            {presetTemplates.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </select>
        </label>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => onCreate({ name, duration, presetId })}>Create</button>
        </div>
      </div>
    </div>
  )
}

function InputLagWindow({ project, page }) {
  const routeMap = {
    'control-center': '/center',
    boost: '/boost',
    dpc: '/tools/dpc-latency',
    logo: '/center',
  }
  const renderPageMap = {
    'control-center': 'control-center',
    boost: 'boost',
    dpc: 'dpc',
    logo: 'control-center',
  }
  const source = project.sourceUrl || inputLagPreviewUrl
  const sourceIsHtml = source.toLowerCase().includes('.html')
  const cleanSource = source.startsWith('blob:') || sourceIsHtml ? source.replace(/[?#].*$/, '') : source.replace(/[?#].*$/, '').replace(/\/?$/, '/')
  const pageUrl = source.startsWith('blob:')
    ? source
    : `${cleanSource}${sourceIsHtml ? '' : ''}?renderCapture=boost-ai&studioPreview=1&page=${renderPageMap[page] ?? 'boost'}#${routeMap[page] ?? '/center'}`

  return (
    <div className="preview-shell">
      <iframe className="inputlag-frame" title="InputLag preview" src={pageUrl} />
    </div>
  )
}

function PresetMiniPreview({ preset }) {
  return (
    <div className="preset-mini-preview">
      <div className="mini-window">
        <div className="mini-top" />
        <div className="mini-body">
          <span />
          <strong>{preset.page === 'boost' ? 'Boost' : pageLabel(preset.page)}</strong>
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  )
}

function PresetBrowserModal({ open, onClose, onLoad }) {
  if (!open) return null
  return (
    <div className="modal-backdrop">
      <div className="preset-browser-modal">
        <div className="preset-browser-head">
          <div>
            <span>Ready presets</span>
            <strong>Pick animation template</strong>
          </div>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="preset-grid-24">
          <button className="preset-tile empty-tile" onClick={() => { onLoad(null); onClose() }}>
            <Plus size={22} />
            <span>No preset</span>
          </button>
          {presetGrid.slice(0, 23).map((preset) => (
            <button
              className="preset-tile"
              key={preset.id}
              onClick={() => { onLoad(preset); onClose() }}
            >
              <PresetMiniPreview preset={preset} />
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function PresetPanel({ onOpen }) {
  return (
    <aside className="preset-library compact-presets">
      <div className="panel-title">
        <Sparkles size={18} />
        <div>
          <span>Left panel</span>
          <strong>Presets</strong>
        </div>
      </div>
      <button className="ready-presets-button" onClick={onOpen}>
        <Sparkles size={18} />
        <span>Ready presets</span>
      </button>
      <div className="left-help">
        <strong>How it works</strong>
        <p>Open presets, preview tiles on hover, or start clean without a preset.</p>
      </div>
    </aside>
  )
}

function Timeline({ project, playhead, zoom, onZoom, onSeek, onSetFrame, onDragKeyframe }) {
  const trackRef = useRef(null)
  const duration = Math.max(project.duration, 1)
  const marks = Array.from({ length: Math.floor(duration) + 1 }, (_, index) => index)
  const width = `${zoom * 100}%`
  const playheadPct = `${(playhead / duration) * 100}%`

  const seekFromEvent = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const pct = clamp((event.clientX - rect.left) / rect.width)
    onSeek(Number((pct * duration).toFixed(2)))
  }

  return (
    <section className="timeline-panel single-project">
      <div className="section-header">
        <div>
          <span>Project timeline</span>
          <strong>{project.keyframes.length ? `${project.keyframes.length} keyframes` : 'empty - move controls to create first keyframe'}</strong>
        </div>
        <div className="timeline-actions">
          <label>Zoom <input type="range" min="1" max="5" step="0.25" value={zoom} onChange={(event) => onZoom(Number(event.target.value))} /></label>
          <button className="set-frame-btn" onClick={onSetFrame}><Plus size={15} /> Set frame</button>
        </div>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-inner" style={{ width }}>
          <div className="timeline-ruler clean-ruler">
            {marks.map((mark) => <span key={mark} style={{ left: `${(mark / duration) * 100}%` }}>{mark}s</span>)}
          </div>
          <div className="single-track" ref={trackRef} onClick={seekFromEvent}>
            <div className="project-clip">
              <span>{project.name}</span>
              <small>{project.duration}s</small>
              {sortedKeyframes(project).map((keyframe) => (
                <button
                  className="keyframe-marker"
                  key={keyframe.id}
                  style={{ left: `${(keyframe.time / duration) * 100}%` }}
                  title={`${keyframe.time}s / ${keyframe.curvePreset}`}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    const rect = trackRef.current.getBoundingClientRect()
                    const move = (moveEvent) => {
                      const pct = clamp((moveEvent.clientX - rect.left) / rect.width)
                      onDragKeyframe(keyframe.id, Number((pct * duration).toFixed(2)))
                    }
                    const up = () => {
                      window.removeEventListener('pointermove', move)
                      window.removeEventListener('pointerup', up)
                    }
                    window.addEventListener('pointermove', move)
                    window.addEventListener('pointerup', up)
                  }}
                />
              ))}
            </div>
            <b className="playhead" style={{ left: playheadPct }} />
          </div>
        </div>
      </div>
    </section>
  )
}

function TransformEditor({ value, onChange, onSetFrame }) {
  const rows = [['x', -600, 600], ['y', -360, 360], ['scale', 0.35, 1.8], ['rotateX', -55, 55], ['rotateY', -55, 55], ['rotateZ', -40, 40], ['perspective', 700, 2600]]

  return (
    <div className="transform-editor color-panel-blue">
      <div className="mini-title">
        <Rotate3D size={16} />
        <span>Transform at playhead</span>
        <button onClick={onSetFrame}>Set frame</button>
      </div>
      {rows.map(([key, min, max]) => (
        <label key={key}>
          <span>{key}</span>
          <input type="range" min={min} max={max} step={key === 'scale' ? 0.01 : 1} value={value[key]} onChange={(event) => onChange({ [key]: Number(event.target.value) })} />
          <b>{value[key]}</b>
        </label>
      ))}
    </div>
  )
}

function GraphEditor({ project, playhead, onSetCurve }) {
  const segment = getSegmentForTime(project, playhead)
  const activeId = segment?.keyframe?.curvePreset ?? 'linear'
  const active = curveById(activeId)
  const from = segment?.fromTime ?? 0
  const to = segment?.toTime ?? project.duration

  return (
    <div className="graph-editor color-panel-green">
      <div className="mini-title no-gauge">
        <span>Curve editor</span>
        <strong>{from.toFixed(2)}s to {to.toFixed(2)}s</strong>
      </div>
      <div className="curve-browser">
        {curvePresets.map((curve) => (
          <button className={curve.id === activeId ? 'curve-preset active' : 'curve-preset'} key={curve.id} onClick={() => onSetCurve(curve.id)}>
            <svg viewBox="0 0 260 130" preserveAspectRatio="none"><path d={curve.path} /></svg>
            <span>{curve.label}</span>
          </button>
        ))}
      </div>
      <div className="curve-large">
        <div className="curve-topline"><span>{from.toFixed(1)}s</span><strong>{active.label}</strong><span>{to.toFixed(1)}s</span></div>
        <svg viewBox="0 0 760 210" preserveAspectRatio="none">
          <g className="grid-lines">
            {Array.from({ length: 8 }, (_, i) => <line key={`v${i}`} x1={40 + i * 94} y1="24" x2={40 + i * 94} y2="184" />)}
            {Array.from({ length: 5 }, (_, i) => <line key={`h${i}`} x1="40" y1={24 + i * 40} x2="720" y2={24 + i * 40} />)}
          </g>
          <path d={`M40 184 C${40 + active.curve[0] * 680} ${184 - active.curve[1] * 160}, ${40 + active.curve[2] * 680} ${184 - active.curve[3] * 160}, 720 24`} />
          <circle cx={40 + active.curve[0] * 680} cy={184 - active.curve[1] * 160} r="5" />
          <circle cx={40 + active.curve[2] * 680} cy={184 - active.curve[3] * 160} r="5" />
        </svg>
      </div>
    </div>
  )
}

function Inspector({ project, currentTransform, onPatchProject, onPatchTransform, onSetFrame, onSetCurve }) {
  const weight = estimateWeight(project.duration, project.fps)

  return (
    <aside className="inspector inspector-split">
      <div className="panel-title"><SlidersHorizontal size={18} /><div><span>Inspector</span><strong>{project.name}</strong></div></div>
      <div className="field-grid color-panel-purple">
        <label>Page<select value={project.page} onChange={(event) => onPatchProject({ page: event.target.value })}>{pages.filter((page) => page.id !== 'logo').map((page) => <option key={page.id} value={page.id}>{page.label}</option>)}</select></label>
        <label>Duration<input type="number" min="1" max="90" step="0.1" value={project.duration} onChange={(event) => onPatchProject({ duration: Number(event.target.value) })} /></label>
        <label>FPS<input type="number" min="24" max="120" step="1" value={project.fps} onChange={(event) => onPatchProject({ fps: Number(event.target.value) })} /></label>
        <label>Speed<input type="number" min="0.1" max="3" step="0.05" value={project.speed} onChange={(event) => onPatchProject({ speed: Number(event.target.value) })} /></label>
      </div>
      <div className="weight-card color-panel-purple"><span>Estimated output</span><strong>{weight.movMb} MB MOV</strong><small>{weight.frames} frames / {weight.pngMb} MB PNG cache</small></div>
      <TransformEditor value={currentTransform} onChange={onPatchTransform} onSetFrame={onSetFrame} />
      <GraphEditor project={project} playhead={project.playhead ?? 0} onSetCurve={onSetCurve} />
    </aside>
  )
}

export default function App() {
  const [project, setProject] = useState(makeProject())
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [timelineZoom, setTimelineZoom] = useState(1)
  const [viewportHint, setViewportHint] = useState('Move X/Y')
  const [rotateMode, setRotateMode] = useState(false)
  const rafRef = useRef(null)
  const startedAtRef = useRef(0)
  const basePlayheadRef = useRef(0)
  const dragRef = useRef(null)
  const rotateTimerRef = useRef(null)

  const projectWithPlayhead = useMemo(() => ({ ...project, playhead }), [project, playhead])
  const currentTransform = useMemo(() => getTransformAtTime(project, playhead), [project, playhead])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code !== 'Space') return
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return
      event.preventDefault()
      setPlaying((value) => !value)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!playing) return undefined
    startedAtRef.current = performance.now()
    basePlayheadRef.current = playhead
    const tick = (now) => {
      const elapsed = ((now - startedAtRef.current) / 1000) * project.speed
      setPlayhead((basePlayheadRef.current + elapsed) % project.duration)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, project.duration, project.speed])

  const setFrameAtPlayhead = (transform = currentTransform) => {
    setProject((current) => {
      const time = Number(Math.max(0, Math.min(current.duration, playhead)).toFixed(2))
      const existing = current.keyframes.find((keyframe) => Math.abs(keyframe.time - time) < 0.015)
      if (existing) {
        return {
          ...current,
          keyframes: current.keyframes.map((keyframe) => keyframe.id === existing.id ? { ...keyframe, transform } : keyframe),
        }
      }
      return {
        ...current,
        keyframes: [...current.keyframes, { id: crypto.randomUUID(), time, transform, curvePreset: 'linear' }].sort((a, b) => a.time - b.time),
      }
    })
  }

  const patchTransformAtPlayhead = (patch) => {
    const next = { ...currentTransform, ...patch }
    setFrameAtPlayhead(next)
  }

  const dragKeyframe = (id, time) => {
    const clamped = Number(clamp(time / project.duration) * project.duration).toFixed(2)
    const nextTime = Number(clamped)
    setPlayhead(nextTime)
    setProject((current) => ({
      ...current,
      keyframes: current.keyframes.map((keyframe) => keyframe.id === id ? { ...keyframe, time: nextTime } : keyframe).sort((a, b) => a.time - b.time),
    }))
  }

  const setCurveForSegment = (curvePreset) => {
    const segment = getSegmentForTime(project, playhead)
    if (!segment?.keyframe) return
    setProject((current) => ({
      ...current,
      keyframes: current.keyframes.map((keyframe) => keyframe.id === segment.keyframe.id ? { ...keyframe, curvePreset } : keyframe),
    }))
  }

  const loadPreset = (preset) => {
    if (!preset) {
      setProject((current) => ({ ...makeProject({ name: current.name, duration: current.duration, presetId: 'empty' }), sourceUrl: current.sourceUrl, sourceName: current.sourceName, sourceFiles: current.sourceFiles }))
      setPlayhead(0)
      return
    }
    setProject((current) => ({
      ...makeProject({ name: current.name, presetId: preset.sourceId || preset.id }),
      sourceUrl: current.sourceUrl,
      sourceName: current.sourceName,
      sourceFiles: current.sourceFiles,
    }))
    setPlayhead(0)
    setPlaying(false)
  }

  const createProject = ({ name, duration, presetId }) => {
    setProject(makeProject({ name, duration, presetId }))
    setPlayhead(0)
    setPlaying(false)
    setShowNew(false)
  }

  const previewUrlForDetach = () => {
    const pageMap = { 'control-center': 'control-center', boost: 'boost', dpc: 'dpc' }
    return `${inputLagPreviewUrl}?renderCapture=boost-ai&studioPreview=1&page=${pageMap[project.page] ?? 'boost'}`
  }

  const handleViewportPointerDown = (event) => {
    if (event.button === 2) {
      event.preventDefault()
      setViewportHint('Hold RMB: rotate mode')
      rotateTimerRef.current = window.setTimeout(() => {
        setRotateMode(true)
        setViewportHint('Rotate X/Y with wheel')
      }, 900)
      return
    }
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      start: currentTransform,
    }
    setViewportHint('Move X/Y')
  }

  const handleViewportPointerMove = (event) => {
    if (!dragRef.current) return
    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y
    patchTransformAtPlayhead({
      x: Number((dragRef.current.start.x + dx).toFixed(1)),
      y: Number((dragRef.current.start.y + dy).toFixed(1)),
    })
  }

  const clearViewportPointer = () => {
    dragRef.current = null
    window.clearTimeout(rotateTimerRef.current)
    if (!rotateMode) setViewportHint('Move X/Y')
  }

  const handleViewportWheel = (event) => {
    event.preventDefault()
    if (rotateMode) {
      const delta = event.deltaY > 0 ? 1 : -1
      if (event.shiftKey) {
        patchTransformAtPlayhead({ rotateX: Number((currentTransform.rotateX + delta).toFixed(1)) })
        setViewportHint('Rotate X')
      } else {
        patchTransformAtPlayhead({ rotateY: Number((currentTransform.rotateY + delta).toFixed(1)) })
        setViewportHint('Rotate Y')
      }
      return
    }
    const delta = event.deltaY > 0 ? -0.02 : 0.02
    patchTransformAtPlayhead({ scale: Number(clamp(currentTransform.scale + delta, 0.35, 1.8).toFixed(3)) })
    setViewportHint('Scale')
  }

  return (
    <div className="studio-app">
      <header className="topbar split-topbar">
        <div className="app-logo"><span>IL</span><div><strong>Curvy Editor</strong><small>InputLag window animation studio</small></div></div>
        <div className="top-actions"><button onClick={() => setShowNew(true)}><Plus size={16} /> New project</button><button><Download size={16} /> Export MOV</button></div>
      </header>

      <main className="workspace">
        <PresetPanel onOpen={() => setShowPresets(true)} />
        <section className="studio-center">
          <SourceBinder
            project={project}
            onNew={() => setShowNew(true)}
            onDetach={() => window.open(previewUrlForDetach(), 'inputlag-preview-detached', 'width=1280,height=800')}
            onBind={(patch) => setProject((current) => ({ ...current, ...patch }))}
          />
          <section className="preview-panel">
            <div className="section-header">
              <div><span>Live preview</span><strong>{project.name}</strong></div>
              <div className="preview-controls">
                <button onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={16} /> : <Play size={16} />} {playing ? 'Pause' : 'Play'}</button>
                <input type="range" min="0" max={project.duration} step="0.01" value={playhead} onChange={(event) => setPlayhead(Number(event.target.value))} />
                <span>{playhead.toFixed(2)}s</span>
              </div>
              <div className="preview-badges"><span>{pageLabel(project.page)}</span><span>{project.fps} fps</span><span>{project.duration}s</span></div>
            </div>
            <div className="preview-canvas">
              <div
                className="preview-transform viewport-editable"
                onPointerDown={handleViewportPointerDown}
                onPointerMove={handleViewportPointerMove}
                onPointerUp={clearViewportPointer}
                onPointerCancel={clearViewportPointer}
                onWheel={handleViewportWheel}
                onContextMenu={(event) => event.preventDefault()}
                style={{ transform: `perspective(${currentTransform.perspective}px) translate(${currentTransform.x}px, ${currentTransform.y}px) scale(${currentTransform.scale}) rotateX(${currentTransform.rotateX}deg) rotateY(${currentTransform.rotateY}deg) rotateZ(${currentTransform.rotateZ}deg)` }}
              >
                <div className="viewport-hint">{viewportHint}</div>
                <InputLagWindow project={project} page={project.page} />
              </div>
            </div>
          </section>
          <Timeline
            project={project}
            playhead={playhead}
            zoom={timelineZoom}
            onZoom={setTimelineZoom}
            onSeek={setPlayhead}
            onSetFrame={() => setFrameAtPlayhead()}
            onDragKeyframe={dragKeyframe}
          />
          <section className="workbox">
            <div className="section-header"><div><span>Box</span><strong>ready loops</strong></div><Boxes size={18} /></div>
            <div className="loop-grid">
              {workboxLoops.map((loop) => <div className="loop-card" key={loop.name}><Film size={18} /><div><strong>{loop.name}</strong><span>{loop.page} / {loop.length}</span></div><em className={loop.status}>{loop.status}</em></div>)}
            </div>
          </section>
        </section>
        <Inspector
          project={projectWithPlayhead}
          currentTransform={currentTransform}
          onPatchProject={(patch) => setProject((current) => ({ ...current, ...patch }))}
          onPatchTransform={patchTransformAtPlayhead}
          onSetFrame={() => setFrameAtPlayhead()}
          onSetCurve={setCurveForSegment}
        />
      </main>
      <NewProjectModal open={showNew} onClose={() => setShowNew(false)} onCreate={createProject} />
      <PresetBrowserModal open={showPresets} onClose={() => setShowPresets(false)} onLoad={loadPreset} />
    </div>
  )
}
