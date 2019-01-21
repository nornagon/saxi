import React, { useState, useRef, useEffect, useMemo, useContext, useLayoutEffect, Fragment } from 'react'
import { svgToPaths } from './svg-to-paths'
import { useThunkReducer } from './thunk-reducer'
import ReactDOM from 'react-dom'
import useComponentSize from '@rehooks/component-size'

// TODO: this doesn't work
// import './saxi.css'

const initialState = {
  penUpHeight: 50,
  penDownHeight: 60,
  resolution: 0,
  paperSize: Planning.paperSizes.ArchA.landscape,
  landscape: true,
  marginMm: 20,
  plan: null,
  plannedOptions: null,
  paths: null,
  layers: [],
  selectedLayers: new Set,
  progress: null,
}

const DispatchContext = React.createContext(null)

function reducer(state, action) {
  switch (action.type) {
  case 'SET_PEN_UP_HEIGHT':
    return {...state, penUpHeight: action.value}
  case 'SET_PEN_DOWN_HEIGHT':
    return {...state, penDownHeight: action.value}
  case 'SET_RESOLUTION':
    return {...state, resolution: action.value}
  case 'SET_PAPER_SIZE':
    const landscape = action.size.size.x === action.size.landscape.size.x
      && action.size.size.y === action.size.landscape.size.y
    return {...state, paperSize: action.size, landscape}
  case 'SET_LANDSCAPE':
    const paperSize = state.paperSize[action.value ? 'landscape' : 'portrait']
    return {...state, landscape: action.value, paperSize}
  case 'SET_MARGIN':
    return {...state, marginMm: action.value}
  case 'SET_PATHS':
    const {paths, layers, selectedLayers} = action
    return {...state, plan: null, paths, layers, selectedLayers}
  case 'SET_PLAN':
    return {...state, plan: action.plan, plannedOptions: action.planOptions}
  case 'SET_LAYERS':
    return {...state, selectedLayers: action.selectedLayers}
  case 'SET_PROGRESS':
    return {...state, progress: action.motionIdx}
  default:
    console.warn(`Unrecognized action type '${action.type}'`)
    return state
  }
}

const doReplan = () => async (dispatch, getState) => {
  const state = getState()
  const planOptions = {
    paperSize: state.paperSize,
    marginMm: state.marginMm,
    selectedLayers: state.selectedLayers,
    penUpHeight: state.penUpHeight,
    penDownHeight: state.penDownHeight,
    resolution: state.resolution,
  }
  const plan = await replan(state.paths, planOptions)
  dispatch({type: 'SET_PLAN', plan, planOptions})
}

const setPaths = paths => dispatch => {
  const strokes = new Set()
  for (const path of paths) { strokes.add(path.stroke) }
  const layers = Array.from(strokes).sort()
  dispatch({type: 'SET_PATHS', paths, layers, selectedLayers: new Set(layers)})
  dispatch(doReplan())
}

function PenHeight({state, driver}) {
  const {penUpHeight, penDownHeight} = state
  const dispatch = useContext(DispatchContext)
  const setPenUpHeight = (x) => dispatch({type: 'SET_PEN_UP_HEIGHT', value: x})
  const setPenDownHeight = (x) => dispatch({type: 'SET_PEN_DOWN_HEIGHT', value: x})
  const penUp = () => {
    const height = Device.Axidraw.penPctToPos(penUpHeight)
    driver.setPenHeight(height, 1000)
  }
  const penDown = () => {
    const height = Device.Axidraw.penPctToPos(penDownHeight)
    driver.setPenHeight(height, 1000)
  }
  return <Fragment>
    <div className="flex">
      <label className="pen-label">
        up height (%)
        <input type="number" min="0" max="100"
          value={penUpHeight}
          onChange={e => setPenUpHeight(parseInt(e.target.value))}
        />
      </label>
      <label className="pen-label">
        down height (%)
        <input type="number" min="0" max="100"
          value={penDownHeight}
          onChange={e => setPenDownHeight(parseInt(e.target.value))}
        />
      </label>
    </div>
    <div className="flex">
      <button onClick={penUp}>pen up</button>
      <button onClick={penDown}>pen down</button>
    </div>
  </Fragment>
}

function SwapPaperSizesButton({ onClick }) {
  return <svg
    className="paper-sizes__swap"
    xmlns="http://www.w3.org/2000/svg"
    width="14.05"
    height="11.46"
    viewBox="0 0 14.05 11.46"
    onClick={onClick}
  >
    <g>
      <polygon points="14.05 3.04 8.79 0 8.79 1.78 1.38 1.78 1.38 4.29 8.79 4.29 8.79 6.08 14.05 3.04" />
      <polygon points="0 8.43 5.26 11.46 5.26 9.68 12.67 9.68 12.67 7.17 5.26 7.17 5.26 5.39 0 8.43" />
    </g>
  </svg>
}

function PaperConfig({state}) {
  const dispatch = useContext(DispatchContext)
  function setPaperSize(e) {
    const name = e.target.value
    if (name !== 'Custom') {
      const ps = Planning.paperSizes[name][state.landscape ? 'landscape' : 'portrait']
      dispatch({type: 'SET_PAPER_SIZE', size: ps})
    }
  }
  function setCustomPaperSize(x, y) {
    dispatch({type: 'SET_PAPER_SIZE', size: PaperSize(Vec2(x, y))})
  }
  const paperSize = Object.keys(Planning.paperSizes).find(psName => {
    const ps = Planning.paperSizes[psName].size
    return (ps.x === state.paperSize.size.x && ps.y === state.paperSize.size.y)
      || (ps.y === state.paperSize.size.x && ps.x === state.paperSize.size.y)
  }) || 'Custom'
  return <div>
    <select
      value={paperSize}
      onChange={setPaperSize}
    >
      {Object.keys(Planning.paperSizes).map(name =>
        <option key={name}>{name}</option>
      )}
      <option>Custom</option>
    </select>
    <div className="paper-sizes">
      <label className="paper-label">
        width (mm)
        <input
          type="number"
          value={state.paperSize.size.x}
          onChange={e => setCustomPaperSize(Number(e.target.value), state.paperSize.size.y)}
        />
      </label>
      <SwapPaperSizesButton onClick={() => dispatch({type: 'SET_LANDSCAPE', value: !state.landscape})} />
      <label className="paper-label">
        height (mm)
        <input
          type="number"
          value={state.paperSize.size.y}
          onChange={e => setCustomPaperSize(state.paperSize.size.x, Number(e.target.value))}
        />
      </label>
    </div>
    <label>
      margin (mm)
      <input
        type="number"
        value={state.marginMm}
        min="0"
        max={Math.min(state.paperSize.size.x/2, state.paperSize.size.y/2)}
        onChange={e => dispatch({type: 'SET_MARGIN', value: Number(e.target.value)})}
      />
    </label>
  </div>
}

function MotorControl({driver}) {
  return <div>
    <button onClick={() => driver.limp()}>limp</button>
  </div>
}

function PlanStatistics({plan}) {
  return <div className="duration">
    <div>Duration</div>
    <div><strong>{plan && plan.duration ? Util.formatDuration(plan.duration) : '-'}</strong></div>
  </div>
}

function PlanPreview({state, previewSize}) {
  const ps = state.paperSize
  const memoizedPlanPreview = useMemo(() => {
    if (state.plan) {
      const lines = Planning.planPoints(state.plan)
      return <g transform={`scale(${1 / Device.Axidraw.stepsPerMm})`}>
        {lines.map((line, i) =>
          <path
            key={i}
            d={line.reduce((m, {x, y}, j) => m + `${j === 0 ? 'M' : 'L'}${x} ${y}`, '')}
            style={i % 2 === 0 ? {stroke: 'rgba(0, 0, 0, 0.3)', strokeWidth: 0.5} : {}}
          />
        )}
      </g>
    }
  }, [state.plan])

  // w/h of svg.
  // first try scaling so that h = area.h. if w < area.w, then ok.
  // otherwise, scale so that w = area.w.
  const {width, height} = ps.size.x / ps.size.y * previewSize.height <= previewSize.width
    ? {width: ps.size.x / ps.size.y * previewSize.height, height: previewSize.height}
    : {height: ps.size.y / ps.size.x * previewSize.width, width: previewSize.width}

  const [microprogress, setMicroprogress] = useState(0)
  useLayoutEffect(() => {
    let rafHandle = null
    let cancelled = false
    if (state.progress != null) {
      const startingTime = Date.now()
      const updateProgress = () => {
        if (cancelled) return
        setMicroprogress(Date.now() - startingTime)
        rafHandle = requestAnimationFrame(updateProgress)
      }
      //rafHandle = requestAnimationFrame(updateProgress)
      updateProgress()
    }
    return () => {
      cancelled = true
      if (rafHandle != null) {
        cancelAnimationFrame(rafHandle)
      }
      setMicroprogress(0)
    }
  }, [state.progress])

  let progressIndicator = null
  if (state.progress != null && state.plan != null) {
    const motion = state.plan.motion(state.progress)
    const pos = motion.$classData.name === 'saxi.Planning$XYMotion'
      ? motion.instant(Math.min(microprogress / 1000, motion.duration)).p
      : state.plan.motion(state.progress-1).p2
    const {stepsPerMm} = Device.Axidraw
    const posXMm = pos.x / stepsPerMm
    const posYMm = pos.y / stepsPerMm
    progressIndicator = 
      <svg
        width={width * 2}
        height={height * 2}
        viewBox={`${-width} ${-height} ${width*2} ${height*2}`}
        style={{transform: `translateZ(0.001px) translate(${-width}px, ${-height}px) translate(${posXMm/ps.size.x*50}%,${posYMm/ps.size.y*50}%)`}}
      >
        <g>
          <path
            d={`M-${width} 0l${width * 2} 0M0 -${height}l0 ${height * 2}`}
            style={{stroke: 'rgba(222, 114, 114, 0.6)', strokeWidth: 1}}
          />
          <path
            d="M-10 0l20 0M0 -10l0 20"
            style={{stroke: 'rgba(222, 114, 114, 1)', strokeWidth: 2}}
          />
        </g>
      </svg>
  }
  const margins = <g>
    <rect
      x={state.marginMm}
      y={state.marginMm}
      width={(ps.size.x - state.marginMm * 2)}
      height={(ps.size.y - state.marginMm * 2)}
      fill="none"
      stroke="black"
      strokeWidth="0.1"
      strokeDasharray="1,1"
    />
  </g>
  return <div className="preview">
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${ps.size.x} ${ps.size.y}`}
    >
      {memoizedPlanPreview}
      {margins}
    </svg>
    {progressIndicator}
  </div>
}

function LayerSelector({state}) {
  const dispatch = useContext(DispatchContext)
  if (state.layers.length <= 1) return null
  const layersChanged = e => {
    const selectedLayers = new Set([...e.target.selectedOptions].map(o => o.value))
    dispatch({type: 'SET_LAYERS', selectedLayers})
  }
  return <div>
    <label>
      layers
      <select
        className="layer-select"
        multiple={true}
        value={[...state.selectedLayers]}
        onChange={layersChanged}
        size="3"
      >
        {state.layers.map(layer => <option key={layer}>{layer}</option>)}
      </select>
    </label>
  </div>
}

function PlotButtons({state }) {
  const dispatch = useContext(DispatchContext)
  function cancel() {
    // TODO: move to Driver.scala
    fetch('/cancel', {
      method: 'POST',
    }).then(res => res.json()).then(data => console.log(data))
  }
  function plot(plan) {
    const pickled = Driver.picklePlan(plan)
    fetch('/plot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: pickled,
    }).then(res => res.json()).then(data => console.log(data))
  }

  function setEq(a, b) {
    if (a.size !== b.size) return false
    for (let e of a)
      if (!b.has(e))
        return false
    return true
  }

  const needsReplan = state.plan != null && (
    state.plannedOptions.penUpHeight !== state.penUpHeight ||
    state.plannedOptions.penDownHeight !== state.penDownHeight ||
    state.plannedOptions.resolution !== state.resolution ||
    state.plannedOptions.marginMm !== state.marginMm ||
    state.plannedOptions.paperSize.size.x !== state.paperSize.size.x ||
    state.plannedOptions.paperSize.size.y !== state.paperSize.size.y ||
    !setEq(state.plannedOptions.selectedLayers, state.selectedLayers)
  )
  return <div >
    {
      needsReplan
        ? <button
          className="replan-button"
          onClick={() => dispatch(doReplan())}>
            Replan
        </button>
        : <button
          className={`plot-button ${state.progress ? 'plot-button--plotting' : ''}`}
          disabled={state.plan == null || state.progress}
          onClick={() => plot(state.plan)}>
            {state.plan && state.progress ? 'Plotting...' : 'Plot'}
        </button>
    }
    <button
      className={`cancel-button ${state.progress ? 'cancel-button--active' : ''}`}
      onClick={cancel}
      disabled={state.plan == null || !state.progress}
    >Cancel</button>
  </div>
}

function PlanOptions({state}) {
  const dispatch = useContext(DispatchContext)
  return <div>
    <div>
      <label>
        point-joining radius (mm)
        <input
          type="number"
          value={state.resolution}
          step="0.1"
          onChange={e => dispatch({type: 'SET_RESOLUTION', value: Number(e.target.value)})}
        />
      </label>
    </div>
  </div>
}

function Root({driver}) {
  const [state, dispatch] = useThunkReducer(reducer, initialState)
  useEffect(() => {
    driver.onprogress = motionIdx => {
      dispatch({type: 'SET_PROGRESS', motionIdx})
    }
    driver.oncancelled = () => {
      dispatch({type: 'SET_PROGRESS', motionIdx: null})
    }
    const ondrop = e => {
      e.preventDefault()
      const item = e.dataTransfer.items[0]
      const file = item.getAsFile()
      const reader = new FileReader()
      reader.onload = () => {
        dispatch(setPaths(readSvg(reader.result)))
        document.body.classList.remove('dragover')
      }
      reader.readAsText(file)
    }
    const ondragover = e => {
      e.preventDefault()
      document.body.classList.add('dragover')
    }
    const ondragleave = e => {
      e.preventDefault()
      document.body.classList.remove('dragover')
    }
    const onpaste = e => {
      e.clipboardData.items[0].getAsString(s => {
        dispatch(setPaths(readSvg(s)))
      })
    }
    document.body.addEventListener('drop', ondrop)
    document.body.addEventListener('dragover', ondragover)
    document.body.addEventListener('dragleave', ondragleave)
    document.addEventListener('paste', onpaste)
    return () => {
      document.body.removeEventListener('drop', ondrop)
      document.body.removeEventListener('dragover', ondragover)
      document.removeEventListener('paste', onpaste)
    }
  })
  const previewArea = useRef(null)
  const previewSize = useComponentSize(previewArea)
  return <DispatchContext.Provider value={dispatch}>
    <div className="control-panel">
      <div className="saxi-title red">
        <span className="red reg">s</span><span className="teal">axi</span>
      </div>
      <div className="section-header">pen</div>
      <div className="section-body">
        <PenHeight state={state} driver={driver} />
        <MotorControl driver={driver} />
      </div>
      <div className="section-header">paper</div>
      <div className="section-body">
        <PaperConfig state={state} />
        <PlanOptions state={state} />
        <LayerSelector state={state} />
      </div>
      <div className="spacer" />
      <div className="control-panel-bottom">
        <div className="section-header">plot</div>
        <div className="section-body section-body__plot">
          <PlanStatistics plan={state.plan} />
          <PlotButtons state={state} />
        </div>
      </div>
    </div>
    <div className="preview-area" ref={previewArea}>
      <PlanPreview state={state} previewSize={{width: previewSize.width - 40, height: previewSize.height - 40}} />
    </div>
  </DispatchContext.Provider>
}

ReactDOM.render(<Root driver={Driver.connect()}/>, document.getElementById('app'))

function timed(name) {
  return f => {
    const t0 = performance.now()
    const v = f()
    const t1 = performance.now()
    console.info(`${name} took ${(t1 - t0)} ms`)
    return v
  }
}

function readSvg(svgString) {
  return timed('svgToPaths')(() => svgToPaths(svgString))
}

async function replan(paths, {paperSize, marginMm, selectedLayers, penUpHeight, penDownHeight, resolution}) {
  // Compute scaling using _all_ the paths, so it's the same no matter what
  // layers are selected.
  const scaledToPaper = timed('scaledToPaper')(() => Planning.scaleToPaper(paths, paperSize, marginMm))

  // Rescaling loses the stroke info, so refer back to the original paths to
  // filter based on the stroke. Rescaling doesn't change the number or order
  // of the paths.
  const scaledToPaperSelected = scaledToPaper.filter((path, i) =>
    selectedLayers.has(paths[i].stroke))

  const deduped = resolution === 0 ? scaledToPaperSelected : Planning.dedupPoints(scaledToPaperSelected, resolution)

  // Optimize based on just the selected layers.
  const optimized = timed('optimize')(() => Planning.optimize(deduped))

  // Convert the paths to units of "steps".
  const {stepsPerMm} = Device.Axidraw
  const inSteps = optimized.map(ps => ps.map(p => [p[0] * stepsPerMm, p[1] * stepsPerMm]))

  // And finally, motion planning.
  const penUpPos = Device.Axidraw.penPctToPos(penUpHeight)
  const penDownPos = Device.Axidraw.penPctToPos(penDownHeight)
  const plan = timed('plan')(() => Planning.plan(inSteps, penUpPos, penDownPos))

  return plan
}
