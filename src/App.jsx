import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Code2,
  Download,
  Edit3,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Rotate3D,
  SlidersHorizontal,
  Square,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { pages, presetTemplates } from './data/presets.js'

const inputLagPreviewUrl = './inputlag-preview/index.html'

const defaultTransform = {
  x: 0,
  y: 0,
  scale: 1,
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

const timelineInset = 0.045
const timelineSpan = 1 - timelineInset * 2
const timelinePct = (time, duration) => `${(timelineInset + (time / duration) * timelineSpan) * 100}%`

const presetTabs = ['Start', 'End', 'Effects']
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
const sortedKeyframes = (project) => [...project.windowTrack.keyframes].sort((a, b) => a.time - b.time)
const sortedActions = (project) => [...project.actionTrack.actions].sort((a, b) => a.time - b.time)

const estimateWeight = (duration, fps) => {
  const frames = Math.round(duration * fps)
  return { frames, pngMb: Math.round(frames * 1.15), movMb: Math.round(frames * 0.85) }
}

const makeProject = ({ name = 'InputLag Project', duration = 6, fps, speed, page, presetId = 'empty' } = {}) => {
  const preset = presetTemplates.find((item) => item.id === presetId)
  const base = preset ? { ...preset.start, scale: Math.max(preset.start.scale, 0.86) } : { ...defaultTransform }
  return {
    name,
    duration: preset?.duration ?? duration,
    fps: fps ?? preset?.fps ?? 60,
    speed: speed ?? preset?.speed ?? 1,
    page: page ?? preset?.page ?? 'boost',
    sourceUrl: inputLagPreviewUrl,
    sourceName: 'C:/Users/yr4e/inputlag.ai-main/renderer',
    sourceFiles: 0,
    baseTransform: base,
    windowTrack: {
      name: 'Window',
      keyframes: preset
        ? [{
            id: crypto.randomUUID(),
            time: Number(preset.duration.toFixed(2)),
            transform: { ...preset.end, scale: Math.max(preset.end.scale, 0.86) },
            curvePreset: 'ease',
            preset: preset.id,
          }]
        : [],
    },
    actionTrack: {
      name: 'Action',
      actions: preset?.actions?.map((action) => ({
        id: crypto.randomUUID(),
        time: Number(Math.min(action.at ?? 0, preset.duration).toFixed(2)),
        duration: 0.45,
        type: action.type,
        label: action.label,
        preset: preset.id,
      })) ?? [],
    },
  }
}

const bezierY = (progress, curve) => {
  const t = clamp(progress)
  const inv = 1 - t
  return clamp(3 * inv * inv * t * curve[1] + 3 * inv * t * t * curve[3] + t * t * t, -0.4, 1.4)
}

const interpolateTransform = (from, to, progress, curveId) => {
  const eased = bezierY(progress, curveById(curveId).curve)
  return Object.fromEntries(Object.keys(defaultTransform).map((key) => {
    const value = from[key] + (to[key] - from[key]) * eased
    return [key, Number(value.toFixed(key === 'scale' ? 3 : 1))]
  }))
}

const getTransformAtTime = (project, time) => {
  const keyframes = sortedKeyframes(project)
  if (!keyframes.length) return project.baseTransform
  const first = keyframes[0]
  if (time <= first.time) {
    return interpolateTransform(project.baseTransform, first.transform, time / Math.max(first.time, 0.001), first.curvePreset)
  }
  for (let index = 1; index < keyframes.length; index += 1) {
    const prev = keyframes[index - 1]
    const next = keyframes[index]
    if (time <= next.time) {
      return interpolateTransform(prev.transform, next.transform, (time - prev.time) / Math.max(next.time - prev.time, 0.001), next.curvePreset)
    }
  }
  return keyframes[keyframes.length - 1].transform
}

const getSegmentForTime = (project, time, selectedKeyframeId) => {
  const keyframes = sortedKeyframes(project)
  if (!keyframes.length) return null
  const selected = selectedKeyframeId
    ? keyframes.find((keyframe) => keyframe.id === selectedKeyframeId)
    : keyframes.find((keyframe) => time <= keyframe.time) ?? keyframes[keyframes.length - 1]
  if (!selected) return null
  const index = keyframes.findIndex((keyframe) => keyframe.id === selected.id)
  return {
    fromTime: index > 0 ? keyframes[index - 1].time : 0,
    toTime: selected.time,
    keyframe: selected,
  }
}

function ProjectMeta({ project }) {
  const weight = estimateWeight(project.duration, project.fps)
  return (
    <div className="header-meta">
      <span>{project.fps} FPS</span>
      <span>{project.duration.toFixed(2)}s</span>
      <span>{weight.frames} frames</span>
      <span>~{weight.movMb}MB</span>
      <span className="source-path">{project.sourceName}</span>
    </div>
  )
}

function NewProjectModal({ open, onClose, onCreate, project, mode = 'create' }) {
  const [name, setName] = useState(project?.name ?? 'InputLag Project')
  const [duration, setDuration] = useState(String(project?.duration ?? 6))
  const [fps, setFps] = useState(String(project?.fps ?? 60))
  const [speed, setSpeed] = useState(String(project?.speed ?? 1))
  const [page, setPage] = useState(project?.page ?? 'boost')
  const [presetId, setPresetId] = useState('empty')

  useEffect(() => {
    if (!open) return
    setName(project?.name ?? 'InputLag Project')
    setDuration(String(project?.duration ?? 6))
    setFps(String(project?.fps ?? 60))
    setSpeed(String(project?.speed ?? 1))
    setPage(project?.page ?? 'boost')
    setPresetId('empty')
  }, [open, project])

  if (!open) return null
  return (
    <div className="modal-backdrop">
      <div className="new-modal">
        <div className="modal-head">
          <span>{mode === 'edit' ? 'Edit project' : 'Create new'}</span>
          <strong>{mode === 'edit' ? 'Timeline settings' : 'Project setup'}</strong>
        </div>
        <label>Project name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <div className="modal-field-grid">
          <label>Page<select value={page} onChange={(event) => setPage(event.target.value)}>{pages.filter((item) => item.id !== 'logo').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label>Duration<input type="number" min="1" max="90" step="0.1" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
          <label>FPS<input type="number" min="24" max="120" step="1" value={fps} onChange={(event) => setFps(event.target.value)} /></label>
          <label>Speed<input type="number" min="0.1" max="3" step="0.05" value={speed} onChange={(event) => setSpeed(event.target.value)} /></label>
        </div>
        {mode !== 'edit' && (
          <label>
            Starting preset
            <select value={presetId} onChange={(event) => setPresetId(event.target.value)}>
              <option value="empty">No preset - empty straight window</option>
              {presetTemplates.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>
          </label>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => onCreate({
            name,
            duration: Number(duration) || 6,
            fps: Number(fps) || 60,
            speed: Number(speed) || 1,
            page,
            presetId,
          })}>{mode === 'edit' ? 'Apply' : 'Create'}</button>
        </div>
      </div>
    </div>
  )
}

function InputLagWindow({ project, page, replayCommand, resetToken }) {
  const frameRef = useRef(null)
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
  const cleanSource = source.startsWith('blob:') || sourceIsHtml
    ? source.replace(/[?#].*$/, '')
    : source.replace(/[?#].*$/, '').replace(/\/?$/, '/')
  const pageUrl = source.startsWith('blob:')
    ? source
    : `${cleanSource}?renderCapture=boost-ai&studioPreview=1&page=${renderPageMap[page] ?? 'boost'}&studioReset=${resetToken}#${routeMap[page] ?? '/center'}`

  useEffect(() => {
    if (!replayCommand?.action || !frameRef.current?.contentWindow) return
    frameRef.current.contentWindow.postMessage({
      source: 'curvy-editor',
      command: 'replay-action',
      action: replayCommand.action,
    }, '*')
  }, [replayCommand])

  return (
    <div className="preview-shell">
      <iframe ref={frameRef} className="inputlag-frame" title="InputLag preview" src={pageUrl} />
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

function PresetBrowserModal({ open, onClose, onAdd }) {
  const [activeTab, setActiveTab] = useState('Start')
  const [selected, setSelected] = useState(presetGrid[0])
  const visiblePresets = activeTab === 'Effects'
    ? presetGrid.filter((preset) => preset.tag === 'text' || preset.page === 'logo')
    : activeTab === 'End'
      ? presetGrid.filter((preset) => preset.tag !== 'text')
      : presetGrid

  if (!open) return null
  return (
    <div className="modal-backdrop">
      <div className="preset-browser-modal">
        <div className="preset-browser-head">
          <div>
            <span>Ready presets</span>
            <strong>{activeTab} templates</strong>
          </div>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="preset-tabs">
          {presetTabs.map((tab) => (
            <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>
          ))}
        </div>
        <div className="preset-grid-24">
          {visiblePresets.slice(0, 24).map((preset) => (
            <button
              className={selected?.id === preset.id ? 'preset-tile active' : 'preset-tile'}
              key={`${activeTab}-${preset.id}`}
              onClick={() => setSelected(preset)}
            >
              <PresetMiniPreview preset={preset} />
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
        <div className="preset-browser-footer">
          <span>{selected ? `${selected.name} -> current playhead` : 'Select preset'}</span>
          <button disabled={!selected} onClick={() => { onAdd(selected, activeTab.toLowerCase()); onClose() }}>
            <Plus size={16} /> Add to current timeline
          </button>
        </div>
      </div>
    </div>
  )
}

function CodePanel({ project, playhead, onClose }) {
  const outputCode = {
    project: {
      name: project.name,
      page: project.page,
      duration: project.duration,
      fps: project.fps,
      speed: project.speed,
      source: project.sourceName,
      currentTime: Number(playhead.toFixed(3)),
      range: { from: 0, to: project.duration },
    },
    tracks: {
      window: {
        baseTransform: project.baseTransform,
        keyframes: sortedKeyframes(project).map((keyframe) => ({
          id: keyframe.id,
          time: keyframe.time,
          curve: keyframe.curvePreset,
          preset: keyframe.preset ?? null,
          transform: keyframe.transform,
        })),
      },
      action: {
        actions: sortedActions(project).map((action) => ({
          id: action.id,
          time: action.time,
          duration: action.duration,
          type: action.type,
          label: action.label,
          selector: action.selector ?? null,
          page: action.page ?? null,
          route: action.route ?? null,
          scrollTop: action.scrollTop ?? null,
          scrollLeft: action.scrollLeft ?? null,
          preset: action.preset ?? null,
          category: action.category ?? 'app',
        })),
      },
    },
    render: {
      mov: 'phase-2',
      frames: estimateWeight(project.duration, project.fps).frames,
      effects: sortedActions(project).filter((action) => action.category === 'effects'),
    },
  }

  return (
    <div className="code-drawer">
      <div className="code-drawer-head">
        <strong>Output code</strong>
        <button onClick={onClose}><X size={16} /></button>
      </div>
      <pre>{JSON.stringify(outputCode, null, 2)}</pre>
    </div>
  )
}

function Timeline({ project, playhead, zoom, selectedKeyframeId, selectedActionId, onZoom, onSeek, onSetFrame, onDragKeyframe, onSelectKeyframe, onSelectAction, onDragAction, onDeleteSelected }) {
  const trackRef = useRef(null)
  const duration = Math.max(project.duration, 1)
  const tickStep = 0.5
  const marks = Array.from({ length: Math.floor(duration / tickStep) + 1 }, (_, index) => Number((index * tickStep).toFixed(4))).filter((mark) => mark <= duration)
  const contentWidth = `${Math.max(100, zoom * 100)}%`
  const playheadPct = timelinePct(playhead, duration)

  const seekFromEvent = (event) => {
    const rect = trackRef.current.getBoundingClientRect()
    const raw = (event.clientX - rect.left) / rect.width
    const pct = clamp((raw - timelineInset) / timelineSpan)
    onSeek(Number((pct * duration).toFixed(3)))
  }

  const beginScrub = (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    seekFromEvent(event)
    const move = (moveEvent) => seekFromEvent(moveEvent)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const handleWheel = (event) => {
    if (!event.ctrlKey) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const anchor = clamp((event.clientX - rect.left) / rect.width)
    const nextZoom = Number(clamp(zoom + (event.deltaY > 0 ? -0.45 : 0.45), 1, 9).toFixed(2))
    onZoom(nextZoom, anchor)
  }

  return (
    <section className="timeline-panel" onWheel={handleWheel}>
      <div className="section-header">
        <div>
          <span>Timeline</span>
          <strong>{project.windowTrack.keyframes.length} window frames / {project.actionTrack.actions.length} actions</strong>
        </div>
        <div className="timeline-actions">
          <span>Ctrl + wheel zoom {zoom.toFixed(2)}x</span>
          <button className="set-frame-btn" onClick={onSetFrame}>Set frame</button>
          <button className="delete-frame-btn" disabled={!selectedKeyframeId && !selectedActionId} onClick={onDeleteSelected}><Trash2 size={15} /> Delete selected</button>
        </div>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-inner" style={{ width: contentWidth }} ref={trackRef}>
          <div className="timeline-ruler clean-ruler" onPointerDown={beginScrub}>
            {marks.map((mark) => (
              <span
                key={mark}
                className={`${Number.isInteger(mark) ? 'major-tick' : 'minor-tick'}${mark === 0 ? ' edge-start' : ''}${Math.abs(mark - duration) < 0.001 ? ' edge-end' : ''}`}
                style={{ left: timelinePct(mark, duration) }}
              >
                {mark % 1 === 0 ? `${mark.toFixed(0)}s` : `${mark.toFixed(1)}s`}
              </span>
            ))}
          </div>
          <div className="editor-track window-track" onPointerDown={beginScrub}>
            <span className="track-label">Window</span>
            <div className="track-lane">
              {sortedKeyframes(project).map((keyframe) => (
                <button
                  className={selectedKeyframeId === keyframe.id ? 'keyframe-marker active' : 'keyframe-marker'}
                  key={keyframe.id}
                  style={{ left: timelinePct(keyframe.time, duration) }}
                  title={`${keyframe.time}s / ${keyframe.curvePreset}`}
                  onClick={(event) => { event.stopPropagation(); onSelectKeyframe(keyframe.id); onSeek(keyframe.time) }}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onSelectKeyframe(keyframe.id)
                    onSeek(keyframe.time)
                    event.currentTarget.setPointerCapture(event.pointerId)
                    const rect = trackRef.current.getBoundingClientRect()
                    const move = (moveEvent) => {
                      const raw = (moveEvent.clientX - rect.left) / rect.width
                      const pct = clamp((raw - timelineInset) / timelineSpan)
                      onDragKeyframe(keyframe.id, Number((pct * duration).toFixed(3)))
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
          </div>
          <div className="editor-track action-track" onPointerDown={beginScrub}>
            <span className="track-label">Action</span>
            <div className="track-lane">
              {sortedActions(project).map((action) => (
                <button
                  className={selectedActionId === action.id ? 'action-chip active' : 'action-chip'}
                  key={action.id}
                  style={{ left: timelinePct(action.time, duration), width: `${Math.max((action.duration / duration) * timelineSpan * 100, 3)}%` }}
                  title={`${action.time}s / ${action.label || action.type}`}
                  onClick={(event) => { event.stopPropagation(); onSelectAction(action.id); onSeek(action.time) }}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onSelectAction(action.id)
                    onSeek(action.time)
                    event.currentTarget.setPointerCapture(event.pointerId)
                    const rect = trackRef.current.getBoundingClientRect()
                    const move = (moveEvent) => {
                      const raw = (moveEvent.clientX - rect.left) / rect.width
                      const pct = clamp((raw - timelineInset) / timelineSpan)
                      onDragAction(action.id, Number((pct * duration).toFixed(3)))
                    }
                    const up = () => {
                      window.removeEventListener('pointermove', move)
                      window.removeEventListener('pointerup', up)
                    }
                    window.addEventListener('pointermove', move)
                    window.addEventListener('pointerup', up)
                  }}
                >
                  {action.type === 'scroll' ? 'scroll' : action.label || action.type}
                </button>
              ))}
            </div>
          </div>
          <b className="playhead" style={{ left: playheadPct }} />
        </div>
      </div>
    </section>
  )
}

function TransformEditor({ value, onChange, onResetSelected, canReset }) {
  const [ctrlDown, setCtrlDown] = useState(false)
  const rows = [
    { key: 'x', min: -600, max: 600, step: 100, labels: ['-600', '-300', '0', '300', '600'] },
    { key: 'y', min: -360, max: 360, step: 60, labels: ['-360', '-180', '0', '180', '360'] },
    { key: 'scale', min: 0.4, max: 1.6, step: 0.1, labels: ['0.4', '0.8', '1', '1.2', '1.6'] },
    { key: 'rotateX', min: -60, max: 60, step: 5, labels: ['-60', '-30', '0', '30', '60'] },
    { key: 'rotateY', min: -60, max: 60, step: 5, labels: ['-60', '-30', '0', '30', '60'] },
    { key: 'rotateZ', min: -40, max: 40, step: 5, labels: ['-40', '-20', '0', '20', '40'] },
    { key: 'perspective', min: 800, max: 2400, step: 100, labels: ['800', '1200', '1600', '2000', '2400'] },
  ]
  const formatValue = (key, raw) => Number(raw.toFixed(key === 'scale' ? 3 : 1))
  const snapValue = (raw, step) => Math.round(raw / step) * step

  useEffect(() => {
    const down = (event) => {
      if (event.key === 'Control') setCtrlDown(true)
    }
    const up = (event) => {
      if (event.key === 'Control') setCtrlDown(false)
    }
    const blur = () => setCtrlDown(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  return (
    <div className="transform-editor">
      <div className="mini-title">
        <span>Transform</span>
        <div className="mini-title-actions">
          <button className="reset-frame-btn" disabled={!canReset} onClick={onResetSelected}>Reset position</button>
        </div>
      </div>
      {rows.map(({ key, min, max, step, labels }) => (
        <label key={key}>
          <span>{key}</span>
          <div className="snap-slider">
            <input
              type="range"
              min={min}
              max={max}
              step="any"
              value={value[key]}
              onChange={(event) => {
                const raw = Number(event.target.value)
                const next = ctrlDown ? raw : snapValue(raw, step)
                onChange({ [key]: formatValue(key, clamp(next, min, max)) })
              }}
            />
            <div className="snap-ticks" aria-hidden="true">
              {labels.map((label) => <i key={label}><em>{label}</em></i>)}
            </div>
          </div>
          <input
            className="transform-value-input"
            value={value[key]}
            onChange={(event) => {
              const raw = Number(event.target.value)
              if (Number.isNaN(raw)) return
              onChange({ [key]: formatValue(key, clamp(raw, min, max)) })
            }}
          />
        </label>
      ))}
    </div>
  )
}

function GraphEditor({ project, playhead, selectedKeyframeId, onSetCurve }) {
  const segment = getSegmentForTime(project, playhead, selectedKeyframeId)
  const activeId = segment?.keyframe?.curvePreset ?? 'linear'
  const active = curveById(activeId)
  const from = segment?.fromTime ?? 0
  const to = segment?.toTime ?? project.duration

  return (
    <div className="graph-editor">
      <div className="curve-header">
        <div>
          <span>Curve Editor</span>
          <strong>{segment ? `${from.toFixed(3)}s -> ${to.toFixed(3)}s` : 'Select a keyframe'}</strong>
        </div>
        <b>{active.label}</b>
      </div>
      <div className="curve-browser">
        {curvePresets.map((curve) => (
          <button className={curve.id === activeId ? 'curve-preset active' : 'curve-preset'} key={curve.id} onClick={() => onSetCurve(curve.id)}>
            <svg viewBox="0 0 260 130" preserveAspectRatio="none"><path d={curve.path} /></svg>
            <span>{curve.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Inspector({ project, currentTransform, selectedKeyframeId, onPatchProject, onPatchTransform, onSetFrame, onSetCurve, onResetSelected }) {
  return (
    <aside className="inspector inspector-split">
      <div className="panel-title">
        <SlidersHorizontal size={18} />
        <div><span>Inspector</span><strong>Transform</strong></div>
        <div className="control-hint inline-control-hint">
          <strong>Controls</strong>
          <span>LMB drag: move X/Y</span>
          <span>LMB + wheel: scale</span>
          <span>RMB hold + wheel: rotate Y</span>
          <span>Ctrl + wheel: rotate X</span>
        </div>
      </div>
      <TransformEditor value={currentTransform} onChange={onPatchTransform} onResetSelected={onResetSelected} canReset={Boolean(selectedKeyframeId)} />
      <GraphEditor project={project} playhead={project.playhead ?? 0} selectedKeyframeId={selectedKeyframeId} onSetCurve={onSetCurve} />
    </aside>
  )
}

export default function App() {
  const [project, setProject] = useState(makeProject())
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [timelineZoom, setTimelineZoom] = useState(1)
  const [viewportHint, setViewportHint] = useState('Move X/Y')
  const [renderStatus, setRenderStatus] = useState('')
  const [rendering, setRendering] = useState(false)
  const [rotateMode, setRotateMode] = useState(false)
  const [selectedKeyframeId, setSelectedKeyframeId] = useState(null)
  const [selectedActionId, setSelectedActionId] = useState(null)
  const [previewResetToken, setPreviewResetToken] = useState(0)
  const [replayCommand, setReplayCommand] = useState(null)
  const rafRef = useRef(null)
  const startedAtRef = useRef(0)
  const basePlayheadRef = useRef(0)
  const playbackLastTimeRef = useRef(0)
  const dragRef = useRef(null)
  const rotateTimerRef = useRef(null)
  const wheelFrameRef = useRef(null)
  const wheelPatchRef = useRef(null)

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
    if (!window.curvy?.onRenderSetTime) return undefined
    return window.curvy.onRenderSetTime((time) => {
      setPlaying(false)
      setPlayhead(Number((clamp(time / project.duration) * project.duration).toFixed(3)))
    })
  }, [project.duration])

  useEffect(() => {
    const handler = (event) => {
      if (event.data?.source !== 'inputlag-studio-preview' || !event.data.action) return
      if (playing) return
      recordAppAction({ ...event.data.action, page: project.page })
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [playing, playhead, project.duration, project.page])

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

  useEffect(() => {
    if (!playing) {
      playbackLastTimeRef.current = playhead
      return
    }
    setPreviewResetToken((value) => value + 1)
    playbackLastTimeRef.current = Math.max(0, playhead - 0.001)
  }, [playing])

  useEffect(() => {
    if (!playing) return
    const previous = playbackLastTimeRef.current
    if (playhead < previous) {
      setPreviewResetToken((value) => value + 1)
      playbackLastTimeRef.current = Math.max(0, playhead - 0.001)
      return
    }
    const dueActions = sortedActions(project).filter((action) => action.time > previous && action.time <= playhead + 0.012)
    dueActions.forEach((action, index) => {
      window.setTimeout(() => {
        setReplayCommand({ id: crypto.randomUUID(), action })
      }, index * 40)
    })
    playbackLastTimeRef.current = playhead
  }, [playing, playhead, project])

  const setFrameAtPlayhead = (transform = currentTransform, extra = {}) => {
    let nextId = selectedKeyframeId
    setProject((current) => {
      const time = Number(Math.max(0, Math.min(current.duration, playhead)).toFixed(3))
      const existing = current.windowTrack.keyframes.find((keyframe) => Math.abs(keyframe.time - time) < 0.01)
      if (existing) {
        nextId = existing.id
        return {
          ...current,
          windowTrack: {
            ...current.windowTrack,
            keyframes: current.windowTrack.keyframes.map((keyframe) => keyframe.id === existing.id ? { ...keyframe, transform, ...extra } : keyframe),
          },
        }
      }
      const id = crypto.randomUUID()
      nextId = id
      return {
        ...current,
        windowTrack: {
          ...current.windowTrack,
          keyframes: [...current.windowTrack.keyframes, { id, time, transform, curvePreset: 'linear', ...extra }].sort((a, b) => a.time - b.time),
        },
      }
    })
    setSelectedKeyframeId(nextId)
  }

  const patchTransformAtPlayhead = (patch) => {
    setFrameAtPlayhead({ ...currentTransform, ...patch })
  }

  const patchTransformThrottled = (patch) => {
    wheelPatchRef.current = { ...(wheelPatchRef.current || currentTransform), ...patch }
    if (wheelFrameRef.current) return
    wheelFrameRef.current = requestAnimationFrame(() => {
      patchTransformAtPlayhead(wheelPatchRef.current)
      wheelPatchRef.current = null
      wheelFrameRef.current = null
    })
  }

  const dragKeyframe = (id, time) => {
    const nextTime = Number((clamp(time / project.duration) * project.duration).toFixed(3))
    setPlayhead(nextTime)
    setSelectedKeyframeId(id)
    setProject((current) => ({
      ...current,
      windowTrack: {
        ...current.windowTrack,
        keyframes: current.windowTrack.keyframes.map((keyframe) => keyframe.id === id ? { ...keyframe, time: nextTime } : keyframe).sort((a, b) => a.time - b.time),
      },
    }))
  }

  const dragAction = (id, time) => {
    const nextTime = Number((clamp(time / project.duration) * project.duration).toFixed(3))
    setPlayhead(nextTime)
    setSelectedActionId(id)
    setSelectedKeyframeId(null)
    setProject((current) => ({
      ...current,
      actionTrack: {
        ...current.actionTrack,
        actions: current.actionTrack.actions.map((action) => action.id === id ? { ...action, time: nextTime } : action).sort((a, b) => a.time - b.time),
      },
    }))
  }

  const deleteKeyframe = (id) => {
    setProject((current) => ({
      ...current,
      windowTrack: {
        ...current.windowTrack,
        keyframes: current.windowTrack.keyframes.filter((keyframe) => keyframe.id !== id),
      },
    }))
    if (selectedKeyframeId === id) setSelectedKeyframeId(null)
  }

  const resetSelectedFrame = () => {
    if (!selectedKeyframeId) return
    setProject((current) => ({
      ...current,
      windowTrack: {
        ...current.windowTrack,
        keyframes: current.windowTrack.keyframes.map((keyframe) => (
          keyframe.id === selectedKeyframeId ? { ...keyframe, transform: { ...defaultTransform } } : keyframe
        )),
      },
    }))
  }

  const deleteAction = (id) => {
    setProject((current) => ({
      ...current,
      actionTrack: {
        ...current.actionTrack,
        actions: current.actionTrack.actions.filter((action) => action.id !== id),
      },
    }))
    if (selectedActionId === id) setSelectedActionId(null)
  }

  const deleteSelectedTimelineItem = () => {
    if (selectedKeyframeId) {
      deleteKeyframe(selectedKeyframeId)
      return
    }
    if (selectedActionId) deleteAction(selectedActionId)
  }

  useEffect(() => {
    const handleDelete = (event) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return
      if (!selectedKeyframeId && !selectedActionId) return
      event.preventDefault()
      deleteSelectedTimelineItem()
    }
    window.addEventListener('keydown', handleDelete)
    return () => window.removeEventListener('keydown', handleDelete)
  }, [selectedKeyframeId, selectedActionId])

  const setCurveForSegment = (curvePreset) => {
    const segment = getSegmentForTime(project, playhead, selectedKeyframeId)
    if (!segment?.keyframe) return
    setSelectedKeyframeId(segment.keyframe.id)
    setProject((current) => ({
      ...current,
      windowTrack: {
        ...current.windowTrack,
        keyframes: current.windowTrack.keyframes.map((keyframe) => keyframe.id === segment.keyframe.id ? { ...keyframe, curvePreset } : keyframe),
      },
    }))
  }

  const addPresetToTimeline = (preset, tab) => {
    const template = presetTemplates.find((item) => item.id === (preset.sourceId || preset.id))
    if (!template) return
    const startTime = Number(clamp(playhead / project.duration) * project.duration).toFixed(3)
    const endTime = Number(Math.min(project.duration, Number(startTime) + Math.min(template.duration, Math.max(0.5, project.duration - Number(startTime)))).toFixed(3))
    const category = tab === 'effects' ? 'effects' : tab
    const newKeyframe = {
      id: crypto.randomUUID(),
      time: endTime,
      transform: { ...template.end, scale: Math.max(template.end.scale, 0.86) },
      curvePreset: 'ease',
      preset: template.id,
      category,
    }
    const newActions = (template.actions || []).map((action) => ({
      id: crypto.randomUUID(),
      time: Number(Math.min(project.duration, Number(startTime) + (action.at || 0)).toFixed(3)),
      duration: 0.45,
      type: action.type,
      label: action.label,
      preset: template.id,
      category,
    }))
    setProject((current) => ({
      ...current,
      page: template.page === 'logo' ? current.page : template.page,
      windowTrack: {
        ...current.windowTrack,
        keyframes: [...current.windowTrack.keyframes, newKeyframe].sort((a, b) => a.time - b.time),
      },
      actionTrack: {
        ...current.actionTrack,
        actions: [...current.actionTrack.actions, ...newActions].sort((a, b) => a.time - b.time),
      },
    }))
    setSelectedKeyframeId(newKeyframe.id)
  }

  const recordAppAction = (action) => {
    const time = Number(Math.max(0, Math.min(project.duration, playhead)).toFixed(3))
    let nextId = null
    setProject((current) => {
      const last = current.actionTrack.actions[current.actionTrack.actions.length - 1]
      if (
        last &&
        Math.abs(last.time - time) < (action.type === 'scroll' ? 0.35 : 0.02) &&
        last.type === action.type &&
        last.label === action.label &&
        last.selector === action.selector &&
        (action.type !== 'scroll' || Math.abs((last.scrollTop ?? 0) - (action.scrollTop ?? 0)) < 18)
      ) {
        nextId = last.id
        return current
      }
      nextId = crypto.randomUUID()
      return {
        ...current,
        actionTrack: {
          ...current.actionTrack,
          actions: [...current.actionTrack.actions, {
            id: nextId,
            time,
            duration: 0.35,
            type: action.type,
            label: action.label,
            selector: action.selector,
            page: action.page,
            route: action.route,
            scrollTop: action.scrollTop,
            scrollLeft: action.scrollLeft,
            category: 'recorded',
          }].sort((a, b) => a.time - b.time),
        },
      }
    })
    setSelectedActionId(nextId)
    setSelectedKeyframeId(null)
  }

  const createProject = ({ name, duration, fps, speed, page, presetId }) => {
    setProject(makeProject({ name, duration, fps, speed, page, presetId }))
    setPlayhead(0)
    setPlaying(false)
    setSelectedKeyframeId(null)
    setSelectedActionId(null)
    setShowNew(false)
  }

  const editProject = ({ name, duration, fps, speed, page }) => {
    setProject((current) => ({
      ...current,
      name,
      duration: Math.max(1, duration || current.duration),
      fps: fps || current.fps,
      speed: speed || current.speed,
      page,
    }))
    setPlayhead((value) => Math.min(value, duration || project.duration))
    setShowEdit(false)
  }

  const handleViewportPointerDown = (event) => {
    if (event.button === 2) {
      event.preventDefault()
      setViewportHint('Hold RMB: rotate Y with wheel')
      rotateTimerRef.current = window.setTimeout(() => {
        setRotateMode(true)
        setViewportHint('Rotate Y')
      }, 450)
      return
    }
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, start: currentTransform }
    setViewportHint('Move X/Y')
  }

  const handleViewportPointerMove = (event) => {
    if (!dragRef.current) return
    patchTransformThrottled({
      x: Number((dragRef.current.start.x + event.clientX - dragRef.current.x).toFixed(1)),
      y: Number((dragRef.current.start.y + event.clientY - dragRef.current.y).toFixed(1)),
    })
  }

  const clearViewportPointer = () => {
    dragRef.current = null
    window.clearTimeout(rotateTimerRef.current)
    setRotateMode(false)
    setViewportHint('Move X/Y')
  }

  const handleViewportWheel = (event) => {
    event.preventDefault()
    const direction = event.deltaY > 0 ? -1 : 1
    if (event.ctrlKey) {
      patchTransformThrottled({ rotateX: Number((currentTransform.rotateX + direction).toFixed(1)) })
      setViewportHint('Ctrl + wheel: Rotate X')
      return
    }
    if (rotateMode || event.buttons === 2) {
      patchTransformThrottled({ rotateY: Number((currentTransform.rotateY + direction).toFixed(1)) })
      setViewportHint('RMB + wheel: Rotate Y')
      return
    }
    patchTransformThrottled({ scale: Number(clamp(currentTransform.scale + direction * 0.02, 0.35, 1.8).toFixed(3)) })
    setViewportHint('Wheel: Scale')
  }

  const handleTimelineZoom = (nextZoom) => {
    setTimelineZoom(nextZoom)
  }

  const exportMov = async () => {
    if (!window.curvy?.renderMov) {
      setRenderStatus('Render works in desktop build')
      return
    }
    setRendering(true)
    setRenderStatus('Rendering...')
    document.body.classList.add('render-alpha')
    const windowRect = document.querySelector('.preview-transform')?.getBoundingClientRect()
    const rect = windowRect
      ? { x: Math.round(windowRect.x), y: Math.round(windowRect.y), width: Math.round(windowRect.width), height: Math.round(windowRect.height) }
      : null
    try {
      const result = await window.curvy.renderMov({
        project: {
          name: project.name,
          duration: project.duration,
          fps: project.fps,
        },
        rect,
      })
      setRenderStatus(result?.ok ? `Rendered: ${result.output}` : `Render failed: ${result?.error || 'unknown error'}`)
    } finally {
      document.body.classList.remove('render-alpha')
      setRendering(false)
    }
  }

  return (
    <div className={rendering ? 'studio-app is-rendering' : 'studio-app'}>
      <header className="topbar split-topbar">
        <div className="app-logo">
          <img src="./curve-editor-logo-purple.png" alt="InputLag Render Studio" />
        </div>
        <div className="topbar-slash" />
        <div className="topbar-center-mark"><img src="./center-il-purple.png" alt="" /></div>
        <ProjectMeta project={project} />
        <div className="top-actions">
          <button className="icon-action ready-presets-top" title="Ready Presets" onClick={() => setShowPresets(true)}><Sparkles size={17} /></button>
          <button className="icon-action" title="Code" onClick={() => setShowCode((value) => !value)}><Code2 size={17} /></button>
          <button onClick={() => setShowNew(true)}><Plus size={16} /> New</button>
          <button className="render-action" disabled={rendering} onClick={exportMov}><Download size={16} /> Render MOV</button>
        </div>
      </header>

      <main className="workspace no-left">
        <section className="studio-center">
          <section className="preview-panel">
            <div className="section-header">
              <div><span>Live preview</span></div>
              <div className="preview-controls">
                <button className="preview-edit" title="Edit project" onClick={() => setShowEdit(true)}><Edit3 size={16} /></button>
                <button className="preview-play" onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={16} /> : <Play size={16} />} {playing ? 'Pause' : 'Play'}</button>
                <input type="range" min="0" max={project.duration} step="0.01" value={playhead} onChange={(event) => setPlayhead(Number(event.target.value))} />
                <span>{playhead.toFixed(2)}s</span>
              </div>
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
                <InputLagWindow project={project} page={project.page} replayCommand={replayCommand} resetToken={previewResetToken} />
              </div>
              {renderStatus && <div className="render-status">{renderStatus}</div>}
              {rendering && <div className="render-blocker">Rendering MOV...</div>}
            </div>
          </section>
          <Timeline
            project={project}
            playhead={playhead}
            zoom={timelineZoom}
            selectedKeyframeId={selectedKeyframeId}
            selectedActionId={selectedActionId}
            onZoom={handleTimelineZoom}
            onSeek={setPlayhead}
            onSetFrame={() => setFrameAtPlayhead()}
            onDragKeyframe={dragKeyframe}
            onSelectKeyframe={(id) => { setSelectedKeyframeId(id); setSelectedActionId(null) }}
            onSelectAction={(id) => { setSelectedActionId(id); setSelectedKeyframeId(null) }}
            onDragAction={dragAction}
            onDeleteSelected={deleteSelectedTimelineItem}
          />
        </section>
        <Inspector
          project={projectWithPlayhead}
          currentTransform={currentTransform}
          selectedKeyframeId={selectedKeyframeId}
          onPatchProject={(patch) => setProject((current) => ({ ...current, ...patch }))}
          onPatchTransform={patchTransformAtPlayhead}
          onSetFrame={() => setFrameAtPlayhead()}
          onSetCurve={setCurveForSegment}
          onResetSelected={resetSelectedFrame}
        />
      </main>
      {showCode && <CodePanel project={project} playhead={playhead} onClose={() => setShowCode(false)} />}
      <NewProjectModal open={showNew} onClose={() => setShowNew(false)} onCreate={createProject} />
      <NewProjectModal open={showEdit} onClose={() => setShowEdit(false)} onCreate={editProject} project={project} mode="edit" />
      <PresetBrowserModal open={showPresets} onClose={() => setShowPresets(false)} onAdd={addPresetToTimeline} />
    </div>
  )
}
