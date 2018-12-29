import React, { useState, useRef, useReducer, useEffect, useMemo, useContext, useLayoutEffect, useCallback } from 'react'
import { svgToPaths } from './svg-to-paths'
import { useThunkReducer } from './thunk-reducer'
import ReactDOM from 'react-dom'

const scale = 3 // px/mm

const initialState = {
  penUpHeight: 50,
  penDownHeight: 60,
  paperSize: Planning.paperSizes.ArchA.landscape,
  landscape: true,
  marginMm: 20,
  plan: null,
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
      return {...state, plan: action.plan}
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
  const plan = await replan(
    state.paths,
    state.paperSize,
    state.marginMm,
    state.selectedLayers,
    state.penUpHeight,
    state.penDownHeight
  )
  dispatch({type: 'SET_PLAN', plan})
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
  return <>
    <div>
      pen up:
      <input type="number" min="0" max="100"
        value={penUpHeight}
        onChange={e => setPenUpHeight(parseInt(e.target.value))}
      />
    </div>
    <div>
      pen down:
      <input type="number" min="0" max="100"
        value={penDownHeight}
        onChange={e => setPenDownHeight(parseInt(e.target.value))}
      />
    </div>
    <div>
      <button onClick={penUp}>pen up</button>
      <button onClick={penDown}>pen down</button>
    </div>
  </>
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
        <option>{name}</option>
      )}
      <option>Custom</option>
    </select>
    <input
      type="number"
      value={state.paperSize.size.x}
      onChange={e => setCustomPaperSize(Number(e.target.value), state.paperSize.size.y)}
    /> &times; <input
      type="number"
      value={state.paperSize.size.y}
      onChange={e => setCustomPaperSize(state.paperSize.size.x, Number(e.target.value))}
    /> mm
    <label>
      <input
        type="checkbox"
        checked={state.landscape}
        onChange={e => dispatch({type: 'SET_LANDSCAPE', value: e.target.checked})}
      /> landscape
    </label>
    <div>
      margin: <input
        type="number"
        value={state.marginMm}
        onChange={e => dispatch({type: 'SET_MARGIN', value: Number(e.target.value)})}
      /> mm
    </div>
  </div>
}

function MotorControl({driver}) {
  return <div>
    <button onClick={() => driver.limp()}>limp</button>
  </div>
}

function PlanStatistics({plan}) {
  if (!plan) return null
  return <div>Duration: {Util.formatDuration(plan.duration)}</div>
}

function PlanPreview({state}) {
  const ps = state.paperSize
  const memoizedPlanPreview = useMemo(() => {
    if (state.plan) {
      const lines = Planning.planPoints(state.plan)
      return <g transform={`scale(${1 / Device.Axidraw.stepsPerMm})`}>
        {lines.map((line, i) =>
          <path
            d={line.reduce((m, {x, y}, j) => m + `${j === 0 ? 'M' : 'L'}${x} ${y}`, '')}
            style={i % 2 === 0 ? {stroke: 'rgba(0, 0, 0, 0.3)', strokeWidth: 0.5} : {}}
          />
        )}
      </g>
    }
  }, [state.plan])
  const [microprogress, setMicroprogress] = useState(0)
  useLayoutEffect(() => {
    let rafHandle = null
    let cancelled = false
    if (state.progress != null) {
      const startingTime = Date.now()
      function updateProgress() {
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
    progressIndicator = 
      <svg
        width={ps.size.x * scale * 2}
        height={ps.size.y * scale * 2}
        viewBox={`${-ps.size.x} ${-ps.size.y} ${ps.size.x*2} ${ps.size.y*2}`}
        style={{transform: `translateZ(0.001px) translate(${-ps.size.x*scale}px, ${-ps.size.y*scale}px) translate(${pos.x/Device.Axidraw.stepsPerMm * scale}px,${pos.y/Device.Axidraw.stepsPerMm * scale}px)`}}
      >
        <g transform={`scale(${1 / Device.Axidraw.stepsPerMm})`}>
          <path
            d={`M-${ps.size.x * scale * Device.Axidraw.stepsPerMm} 0l${ps.size.x * 2 * scale * Device.Axidraw.stepsPerMm} 0M0 -${ps.size.y * scale * Device.Axidraw.stepsPerMm}l0 ${ps.size.y * 2 * scale * Device.Axidraw.stepsPerMm}`}
            style={{stroke: 'rgba(255, 0, 0, 0.4)', strokeWidth: 0.5}}
          />
          <path
            d={`M-10 0l20 0M0 -10l0 20`}
            style={{stroke: 'rgba(255, 0, 0, 0.8)', strokeWidth: 2}}
          />
        </g>
      </svg>
  }
  return <div className="preview">
    <svg
      width={ps.size.x * scale}
      height={ps.size.y * scale}
      viewBox={`0 0 ${ps.size.x} ${ps.size.y}`}
    >{memoizedPlanPreview}</svg>
    {progressIndicator}
  </div>
}

function LayerSelector({state}) {
  const dispatch = useContext(DispatchContext)
  if (state.layers.length <= 1) return null
  const layersChanged = e => {
    const selectedLayers = new Set([...e.target.selectedOptions].map(o => o.value))
    dispatch({type: 'SET_LAYERS', selectedLayers})
    dispatch(doReplan())
  }
  return <div>
    <select multiple={true} value={[...state.selectedLayers]} onChange={layersChanged}>
      {state.layers.map(layer => <option>{layer}</option>)}
    </select>
  </div>
}

function PlotButtons({state, driver}) {
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
  return <div>
    <button disabled={state.plan == null} onClick={() => plot(state.plan)}>plot</button>
    <button onClick={cancel}>cancel</button>
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
      reader.onload = e => {
        dispatch(setPaths(readSvg(reader.result)))
      }
      reader.readAsText(file)
    }
    const ondragover = e => { e.preventDefault() }
    const onpaste = e => {
      e.clipboardData.items[0].getAsString(s => {
        dispatch(setPaths(readSvg(s)))
      })
    }
    document.body.addEventListener('drop', ondrop)
    document.body.addEventListener('dragover', ondragover)
    document.addEventListener('paste', onpaste)
    return () => {
      document.body.removeEventListener('drop', ondrop)
      document.body.removeEventListener('dragover', ondragover)
      document.removeEventListener('paste', onpaste)
    }
  })
  return <DispatchContext.Provider value={dispatch}>
    <div>
      <PenHeight state={state} driver={driver} />
      <PaperConfig state={state} />
      <MotorControl driver={driver} />
      <PlanStatistics plan={state.plan} />
      <PlanPreview state={state} />
      <LayerSelector state={state} />
      <PlotButtons state={state} driver={driver} />
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
  return timed("svgToPaths")(() => svgToPaths(svgString))
}

async function replan(paths, paperSize, marginMm, selectedLayers, penUpHeight, penDownHeight) {
  // Compute scaling using _all_ the paths, so it's the same no matter what
  // layers are selected.
  const scaledToPaper = timed("scaledToPaper")(() => Planning.scaleToPaper(paths, paperSize, marginMm))

  // Rescaling loses the stroke info, so refer back to the original paths to
  // filter based on the stroke. Rescaling doesn't change the number or order
  // of the paths.
  const scaledToPaperSelected = scaledToPaper.filter((path, i) =>
    selectedLayers.has(paths[i].stroke))

  // Optimize based on just the selected layers.
  const optimized = timed("optimize")(() => Planning.optimize(scaledToPaperSelected))

  // Convert the paths to units of "steps".
  const {stepsPerMm} = Device.Axidraw
  const inSteps = optimized.map(ps => ps.map(p => [p[0] * stepsPerMm, p[1] * stepsPerMm]))

  // And finally, motion planning.
  const penUpPos = Device.Axidraw.penPctToPos(penUpHeight)
  const penDownPos = Device.Axidraw.penPctToPos(penDownHeight)
  const plan = timed("plan")(() => Planning.plan(inSteps, penUpPos, penDownPos))

  return plan
}
