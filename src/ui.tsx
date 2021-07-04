import useComponentSize from "@rehooks/component-size";
import React, { ChangeEvent, Fragment, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useReducer } from "react";
import ReactDOM from "react-dom";
import * as interpolator from "color-interpolate"
import * as colormap from "colormap"

import {flattenSVG} from "flatten-svg";
import {PaperSize} from "./paper-size";
import {Device, Plan, PlanOptions, defaultPlanOptions, XYMotion} from "./planning";
import {formatDuration} from "./util";
import {Vec2} from "./vec";

import PlanWorker from "./plan.worker";

import "./style.css";

import pathJoinRadiusIcon from "./icons/path-joining radius.svg";
import pointJoinRadiusIcon from "./icons/point-joining radius.svg";
import rotateDrawingIcon from "./icons/rotate-drawing.svg";

const defaultVisualizationOptions = {
  penStrokeWidth: 0.5,
  colorPathsByStrokeOrder: false,
}

const initialState = {
  connected: true,

  paused: false,

  deviceInfo: null as DeviceInfo | null,

  // UI state
  planOptions: defaultPlanOptions,
  visualizationOptions: defaultVisualizationOptions,

  // Options used to produce the current value of |plan|.
  plannedOptions: null as PlanOptions | null,

  // Info about the currently-loaded SVG.
  paths: null as Vec2[][] | null,
  groupLayers: [] as string[],
  strokeLayers: [] as string[],

  // While a plot is in progress, this will be the index of the current motion.
  progress: (null as number | null),
};

// Update the initial state with previously persisted settings (if present)
const persistedPlanOptions = JSON.parse(window.localStorage.getItem("planOptions")) || {};
initialState.planOptions = {...initialState.planOptions, ...persistedPlanOptions};
initialState.planOptions.paperSize = new PaperSize(initialState.planOptions.paperSize.size);

type State = typeof initialState;

const DispatchContext = React.createContext(null);

function reducer(state: State, action: any): State {
  switch (action.type) {
    case "SET_PLAN_OPTION":
      return {...state, planOptions: {...state.planOptions, ...action.value}};
    case "SET_VISUALIZATION_OPTION":
      return {...state, visualizationOptions: {...state.visualizationOptions, ...action.value}};
    case "SET_DEVICE_INFO":
      return {...state, deviceInfo: action.value};
    case "SET_PAUSED":
      return {...state, paused: action.value};
    case "SET_PATHS":
      const {paths, strokeLayers, selectedStrokeLayers, groupLayers, selectedGroupLayers, layerMode} = action;
      return {...state, paths, groupLayers, strokeLayers, planOptions: {...state.planOptions, selectedStrokeLayers, selectedGroupLayers, layerMode}};
    case "SET_PROGRESS":
      return {...state, progress: action.motionIdx};
    case "SET_CONNECTED":
      return {...state, connected: action.connected};
    default:
      console.warn(`Unrecognized action type '${action.type}'`);
      return state;
  }
}

interface DeviceInfo {
  path: string;
}

class Driver {
  public static connect(): Driver {
    const d = new Driver();
    d.connect();
    return d;
  }

  public onprogress: (motionIdx: number) => void | null;
  public oncancelled: () => void | null;
  public onfinished: () => void | null;
  public ondevinfo: (devInfo: DeviceInfo) => void | null;
  public onpause: (paused: boolean) => void | null;
  public onconnectionchange: (connected: boolean) => void | null;
  public onplan: (plan: Plan) => void | null;

  private socket: WebSocket;
  private connected: boolean;
  private pingInterval: number;

  public connect() {
    this.socket = new WebSocket(`ws://${document.location.host}/chat`);
    this.socket.addEventListener("open", () => {
      console.log(`Connected to EBB server.`);
      this.connected = true;
      if (this.onconnectionchange) {
        this.onconnectionchange(true);
      }
      this.pingInterval = window.setInterval(() => this.ping(), 30000);
    });
    this.socket.addEventListener("message", (e: MessageEvent) => {
      if (typeof e.data === "string") {
        const msg = JSON.parse(e.data);
        switch (msg.c) {
          case "pong": {
            // nothing
          } break;
          case "progress": {
            if (this.onprogress != null) {
              this.onprogress(msg.p.motionIdx);
            }
          } break;
          case "cancelled": {
            if (this.oncancelled != null) {
              this.oncancelled();
            }
          } break;
          case "finished": {
            if (this.onfinished != null) {
              this.onfinished();
            }
          } break;
          case "dev": {
            if (this.ondevinfo != null) {
              this.ondevinfo(msg.p);
            }
          } break;
          case "pause": {
            if (this.onpause != null) {
              this.onpause(msg.p.paused)
            }
          } break;
          case "plan": {
            if (this.onplan != null) {
              this.onplan(Plan.deserialize(msg.p.plan))
            }
          } break;
          default: {
            console.log("Unknown message from server:", msg);
          } break;
        }
      }
    });
    this.socket.addEventListener("error", (_e: ErrorEvent) => {
      // TODO: something
    });
    this.socket.addEventListener("close", () => {
      console.log(`Disconnected from EBB server, reconnecting in 5 seconds.`);
      window.clearInterval(this.pingInterval);
      this.pingInterval = null;
      this.connected = false;
      if (this.onconnectionchange) { this.onconnectionchange(false); }
      this.socket = null;
      setTimeout(() => this.connect(), 5000);
    });
  }

  public plot(plan: Plan) {
    fetch("/plot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new Blob([ JSON.stringify(plan.serialize()) ], { type: 'application/json' })
    });
  }

  public cancel() {
    fetch("/cancel", { method: "POST" });
  }

  public pause() {
    fetch("/pause", { method: "POST" });
  }

  public resume() {
    fetch("/resume", { method: "POST" });
  }

  public send(msg: object) {
    if (!this.connected) {
      throw new Error(`Can't send message: not connected`);
    }
    this.socket.send(JSON.stringify(msg));
  }

  public setPenHeight(height: number, rate: number) {
    this.send({ c: "setPenHeight", p: {height, rate} });
  }

  public limp() { this.send({ c: "limp" }); }
  public ping() { this.send({ c: "ping" }); }
}

const usePlan = (paths: Vec2[][] | null, planOptions: PlanOptions) => {
  const [isPlanning, setIsPlanning] = useState(false);
  const [latestPlan, setPlan] = useState(null);

  function serialize(po: PlanOptions): string {
    return JSON.stringify(po, (k, v) => v instanceof Set ? [...v] : v);
  }

  function attemptRejigger(previousOptions: PlanOptions, newOptions: PlanOptions, previousPlan: Plan) {
    const newOptionsWithOldPenHeights = {
      ...newOptions,
      penUpHeight: previousOptions.penUpHeight,
      penDownHeight: previousOptions.penDownHeight,
    };
    if (serialize(previousOptions) === serialize(newOptionsWithOldPenHeights)) {
      // The existing plan should be the same except for penup/pendown heights.
      return previousPlan.withPenHeights(
        Device.Axidraw.penPctToPos(newOptions.penUpHeight),
        Device.Axidraw.penPctToPos(newOptions.penDownHeight)
      );
    }
  }

  const lastPaths = useRef(null);
  const lastPlan = useRef(null);
  const lastPlanOptions = useRef(null);

  useEffect(() => {
    if (!paths) {
      return;
    }
    if (lastPlan.current != null && lastPaths.current === paths) {
      const rejiggered = attemptRejigger(lastPlanOptions.current, planOptions, lastPlan.current);
      if (rejiggered) {
        setPlan(rejiggered);
        lastPlan.current = rejiggered;
        lastPlanOptions.current = planOptions;
        return;
      }
    }
    lastPaths.current = paths;
    const worker = new (PlanWorker as any)();
    setIsPlanning(true);
    console.time("posting to worker");
    worker.postMessage({paths, planOptions});
    console.timeEnd("posting to worker");
    const listener = (m: any) => {
      console.time("deserializing");
      const deserialized = Plan.deserialize(m.data);
      console.timeEnd("deserializing");
      setPlan(deserialized);
      lastPlan.current = deserialized;
      lastPlanOptions.current = planOptions;
      setIsPlanning(false);
    };
    worker.addEventListener("message", listener);
    return () => {
      worker.terminate();
      worker.removeEventListener("message", listener);
      setIsPlanning(false);
    };
  }, [paths, serialize(planOptions)]);

  return [isPlanning, latestPlan, setPlan];
};

const setPaths = (paths: Vec2[][]) => {
  const strokes = new Set();
  const groups = new Set();
  for (const path of paths) {
    strokes.add((path as any).stroke);
    groups.add((path as any).groupId);
  }
  const layerMode = groups.size > 1 ? 'group' : 'stroke'
  const groupLayers = Array.from(groups).sort()
  const strokeLayers = Array.from(strokes).sort()
  return {type: "SET_PATHS", paths, groupLayers, strokeLayers, selectedGroupLayers: new Set(groupLayers), selectedStrokeLayers: new Set(strokeLayers), layerMode};
};

function PenHeight({state, driver}: {state: State; driver: Driver}) {
  const {penUpHeight, penDownHeight} = state.planOptions;
  const dispatch = useContext(DispatchContext);
  const setPenUpHeight = (x: number) => dispatch({type: "SET_PLAN_OPTION", value: {penUpHeight: x}});
  const setPenDownHeight = (x: number) => dispatch({type: "SET_PLAN_OPTION", value: {penDownHeight: x}});
  const penUp = () => {
    const height = Device.Axidraw.penPctToPos(penUpHeight);
    driver.setPenHeight(height, 1000);
  };
  const penDown = () => {
    const height = Device.Axidraw.penPctToPos(penDownHeight);
    driver.setPenHeight(height, 1000);
  };
  return <Fragment>
    <div className="flex">
      <label className="pen-label">
        up height (%)
        <input type="number" min="0" max="100"
          value={penUpHeight}
          onChange={(e) => setPenUpHeight(parseInt(e.target.value, 10))}
        />
      </label>
      <label className="pen-label">
        down height (%)
        <input type="number" min="0" max="100"
          value={penDownHeight}
          onChange={(e) => setPenDownHeight(parseInt(e.target.value, 10))}
        />
      </label>
    </div>
    <div className="flex">
      <button onClick={penUp}>pen up</button>
      <button onClick={penDown}>pen down</button>
    </div>
  </Fragment>;
}

function VisualizationOptions({state}: {state: State}) {
  const dispatch = useContext(DispatchContext);

  return <>
    <label title="Width of lines in preview. Does not affect plot.">
      visualized stroke width (mm)
      <input
        type="number"
        value={state.visualizationOptions.penStrokeWidth}
        min="0"
        max="10"
        step="0.1"
        onChange={(e) => dispatch({type: "SET_VISUALIZATION_OPTION", value: {penStrokeWidth: Number(e.target.value)}})}
      />
    </label>
    <label className="flex-checkbox" title="Color paths in the preview based on the order in which they will be plotted. Yellow is first, pink is last.">
      <input
        type="checkbox"
        checked={state.visualizationOptions.colorPathsByStrokeOrder}
        onChange={(e) => dispatch({type: "SET_VISUALIZATION_OPTION", value: {colorPathsByStrokeOrder: !!e.target.checked}})}
      />
      color based on order
    </label>
  </>;
}

function SwapPaperSizesButton({ onClick }: { onClick: () => void }) {
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
  </svg>;
}

function PaperConfig({state}: {state: State}) {
  const dispatch = useContext(DispatchContext);
  const landscape = state.planOptions.paperSize.isLandscape;
  function setPaperSize(e: ChangeEvent) {
    const name = (e.target as HTMLInputElement).value;
    if (name !== "Custom") {
      const ps = PaperSize.standard[name][landscape ? "landscape" : "portrait"];
      dispatch({type: "SET_PLAN_OPTION", value: {paperSize: ps}});
    }
  }
  function setCustomPaperSize(x: number, y: number) {
    dispatch({type: "SET_PLAN_OPTION", value: {paperSize: new PaperSize({x, y})}});
  }
  const {paperSize} = state.planOptions;
  const paperSizeName = Object.keys(PaperSize.standard).find((psName) => {
    const ps = PaperSize.standard[psName].size;
    return (ps.x === paperSize.size.x && ps.y === paperSize.size.y)
      || (ps.y === paperSize.size.x && ps.x === paperSize.size.y);
  }) || "Custom";
  return <div>
    <select
      value={paperSizeName}
      onChange={setPaperSize}
    >
      {Object.keys(PaperSize.standard).map((name) =>
        <option key={name}>{name}</option>
      )}
      <option>Custom</option>
    </select>
    <div className="paper-sizes">
      <label className="paper-label">
        width (mm)
        <input
          type="number"
          value={paperSize.size.x}
          onChange={(e) => setCustomPaperSize(Number(e.target.value), paperSize.size.y)}
        />
      </label>
      <SwapPaperSizesButton onClick={() => {
        dispatch({
          type: "SET_PLAN_OPTION",
          value: {paperSize: paperSize.isLandscape ? paperSize.portrait : paperSize.landscape}
        });
      }} />
      <label className="paper-label">
        height (mm)
        <input
          type="number"
          value={paperSize.size.y}
          onChange={(e) => setCustomPaperSize(paperSize.size.x, Number(e.target.value))}
        />
      </label>
    </div>
    <div>
      <label>
      rotate drawing (degrees)
        <div className="horizontal-labels">
          <img src={rotateDrawingIcon} alt="rotate drawing (degrees)"/>
          <input type="number" min="-90" step="90" max="360" placeholder="0" value={state.planOptions.rotateDrawing}
            onInput={(e) => {
              let value = (e.target as HTMLInputElement).value;
              if (Number(value) < 0) { (e.target as HTMLInputElement).value = "270"; }
              if (Number(value) > 270) { (e.target as HTMLInputElement).value = "0"; }
            }}
            onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {rotateDrawing: e.target.value}})}/>
        </div>
      </label>
    </div>
    <label>
      margin (mm)
      <input
        type="number"
        value={state.planOptions.marginMm}
        min="0"
        max={Math.min(paperSize.size.x / 2, paperSize.size.y / 2)}
        onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {marginMm: Number(e.target.value)}})}
      />
    </label>
  </div>;
}

function MotorControl({driver}: {driver: Driver}) {
  return <div>
    <button onClick={() => driver.limp()}>disengage motors</button>
  </div>;
}

function PlanStatistics({plan}: {plan: Plan}) {
  return <div className="duration">
    <div>Duration</div>
    <div><strong>{plan && plan.duration ? formatDuration(plan.duration()) : "-"}</strong></div>
  </div>;
}

function PlanPreview(
  {state, previewSize, plan}: {
    state: State;
    previewSize: {width: number; height: number};
    plan: Plan | null;
  }
) {
  const ps = state.planOptions.paperSize;
  const strokeWidth = state.visualizationOptions.penStrokeWidth * Device.Axidraw.stepsPerMm
  const colorPathsByStrokeOrder = state.visualizationOptions.colorPathsByStrokeOrder
  const memoizedPlanPreview = useMemo(() => {
    if (plan) {
      const palette = colorPathsByStrokeOrder
        ? interpolator(colormap({colormap: 'spring'}))
        : () => 'rgba(0, 0, 0, 0.8)'
      const lines = plan.motions.map((m) => {
        if (m instanceof XYMotion) {
          return m.blocks.map((b) => b.p1).concat([m.p2]);
        } else { return []; }
      }).filter((m) => m.length);
      return <g transform={`scale(${1 / Device.Axidraw.stepsPerMm})`}>
        {lines.map((line, i) =>
          <path
            key={i}
            d={line.reduce((m, {x, y}, j) => m + `${j === 0 ? "M" : "L"}${x} ${y}`, "")}
            style={i % 2 === 0 ? {stroke: "rgba(0, 0, 0, 0.3)", strokeWidth: 0.5} : { stroke: palette(1 - i / lines.length), strokeWidth }}
          />
        )}
      </g>;
    }
  }, [plan, strokeWidth, colorPathsByStrokeOrder]);

  // w/h of svg.
  // first try scaling so that h = area.h. if w < area.w, then ok.
  // otherwise, scale so that w = area.w.
  const {width, height} = ps.size.x / ps.size.y * previewSize.height <= previewSize.width
    ? {width: ps.size.x / ps.size.y * previewSize.height, height: previewSize.height}
    : {height: ps.size.y / ps.size.x * previewSize.width, width: previewSize.width};

  const [microprogress, setMicroprogress] = useState(0);
  useLayoutEffect(() => {
    let rafHandle: number = null;
    let cancelled = false;
    if (state.progress != null) {
      const startingTime = Date.now();
      const updateProgress = () => {
        if (cancelled) { return; }
        setMicroprogress(Date.now() - startingTime);
        rafHandle = requestAnimationFrame(updateProgress);
      };
      // rafHandle = requestAnimationFrame(updateProgress)
      updateProgress();
    }
    return () => {
      cancelled = true;
      if (rafHandle != null) {
        cancelAnimationFrame(rafHandle);
      }
      setMicroprogress(0);
    };
  }, [state.progress]);

  let progressIndicator = null;
  if (state.progress != null && plan != null) {
    const motion = plan.motion(state.progress);
    const pos = motion instanceof XYMotion
      ? motion.instant(Math.min(microprogress / 1000, motion.duration())).p
      : (plan.motion(state.progress - 1) as XYMotion).p2;
    const {stepsPerMm} = Device.Axidraw;
    const posXMm = pos.x / stepsPerMm;
    const posYMm = pos.y / stepsPerMm;
    progressIndicator =
      <svg
        width={width * 2}
        height={height * 2}
        viewBox={`${-width} ${-height} ${width * 2} ${height * 2}`}
        style={{
          transform: `translateZ(0.001px) ` +
            `translate(${-width}px, ${-height}px) ` +
            `translate(${posXMm / ps.size.x * 50}%,${posYMm / ps.size.y * 50}%)`
        }}
      >
        <g>
          <path
            d={`M-${width} 0l${width * 2} 0M0 -${height}l0 ${height * 2}`}
            style={{stroke: "rgba(222, 114, 114, 0.6)", strokeWidth: 1}}
          />
          <path
            d="M-10 0l20 0M0 -10l0 20"
            style={{stroke: "rgba(222, 114, 114, 1)", strokeWidth: 2}}
          />
        </g>
      </svg>;
  }
  const margins = <g>
    <rect
      x={state.planOptions.marginMm}
      y={state.planOptions.marginMm}
      width={(ps.size.x - state.planOptions.marginMm * 2)}
      height={(ps.size.y - state.planOptions.marginMm * 2)}
      fill="none"
      stroke="black"
      strokeWidth="0.1"
      strokeDasharray="1,1"
    />
  </g>;
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
  </div>;
}

function PlanLoader(
  {isLoadingFile, isPlanning}: {
    isLoadingFile: boolean;
    isPlanning: boolean;
  }
) {
  if (isLoadingFile || isPlanning) {
    return <div className="preview-loader">
      {isLoadingFile ? 'Loading file...' : 'Replanning...'}
    </div>;
  }

  return null;
}

function LayerSelector({state}: {state: State}) {
  const dispatch = useContext(DispatchContext);
  const layers = state.planOptions.layerMode === 'group' ? state.groupLayers : state.strokeLayers
  const selectedLayers = state.planOptions.layerMode === 'group' ? state.planOptions.selectedGroupLayers : state.planOptions.selectedStrokeLayers
  if (layers.length <= 1) { return null; }
  const layersChanged = state.planOptions.layerMode === 'group' ?
    (e: ChangeEvent) => {
      const selectedLayers = new Set([...(e.target as HTMLSelectElement).selectedOptions].map((o) => o.value));
      dispatch({type: "SET_PLAN_OPTION", value: {selectedGroupLayers: selectedLayers}});
    } :
    (e: ChangeEvent) => {
      const selectedLayers = new Set([...(e.target as HTMLSelectElement).selectedOptions].map((o) => o.value));
      dispatch({type: "SET_PLAN_OPTION", value: {selectedStrokeLayers: selectedLayers}});
    };
  return <div>
    <label>
      layers
      <select
        className="layer-select"
        multiple={true}
        value={[...selectedLayers]}
        onChange={layersChanged}
        size={3}
      >
        {layers.map((layer) => <option key={layer}>{layer}</option>)}
      </select>
    </label>
  </div>;
}

function PlotButtons(
  {state, plan, isPlanning, driver}: {
    state: State;
    plan: Plan | null;
    isPlanning: boolean;
    driver: Driver;
  }
) {
  function cancel() {
    driver.cancel();
  }
  function pause() {
    driver.pause();
  }
  function resume() {
    driver.resume();
  }
  function plot(plan: Plan) {
    driver.plot(plan);
  }

  return <div>
    {
      isPlanning
        ? <button
          className="replan-button"
          disabled={true}>
          Replanning...
        </button>
        : <button
          className={`plot-button ${state.progress != null ? "plot-button--plotting" : ""}`}
          disabled={plan == null || state.progress != null}
          onClick={() => plot(plan)}>
          {plan && state.progress != null ? "Plotting..." : "Plot"}
        </button>
    }
    <div className={`button-row`}>
      <button
        className={`cancel-button ${state.progress != null ? "cancel-button--active" : ""}`}
        onClick={state.paused ? resume : pause}
        disabled={plan == null || state.progress == null}
      >{state.paused ? "Resume" : "Pause"}</button>
      <button
        className={`cancel-button ${state.progress != null ? "cancel-button--active" : ""}`}
        onClick={cancel}
        disabled={plan == null || state.progress == null}
      >Cancel</button>
    </div>
  </div>;
}

function ResetToDefaultsButton() {
  const dispatch = useContext(DispatchContext);
  const onClick = () => {
    // Clear all user settings that have been saved and reset to the defaults
    window.localStorage.removeItem("planOptions");
    dispatch({type: "SET_PLAN_OPTION", value: {...defaultPlanOptions}});
  };

  return <button className="button-link" onClick={onClick}>reset all options</button>;

}

function PlanOptions({state}: {state: State}) {
  const dispatch = useContext(DispatchContext);
  return <div>
    <label className="flex-checkbox" title="Re-order paths to minimize pen-up travel time">
      <input
        type="checkbox"
        checked={state.planOptions.sortPaths}
        onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {sortPaths: !!e.target.checked}})}
      />
      sort paths
    </label>
    <label className="flex-checkbox" title="Re-scale and position the image to fit on the page">
      <input
        type="checkbox"
        checked={state.planOptions.fitPage}
        onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {fitPage: !!e.target.checked}})}
      />
      fit page
    </label>
    {!state.planOptions.fitPage ?
      <label className="flex-checkbox" title="Remove lines that fall outside the margins">
        <input
          type="checkbox"
          checked={state.planOptions.cropToMargins}
          onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {cropToMargins: !!e.target.checked}})}
        />
        crop to margins
      </label>
      : null}
    <label className="flex-checkbox" title="Split into layers according to group ID, instead of stroke">
      <input
        type="checkbox"
        checked={state.planOptions.layerMode === 'group'}
        onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {layerMode: e.target.checked ? 'group' : 'stroke'}})}
      />
      layer by group
    </label>
    <div className="horizontal-labels">

      <label title="point-joining radius (mm)" >
        <img src={pointJoinRadiusIcon} alt="point-joining radius (mm)"/>
        <input
          type="number"
          value={state.planOptions.pointJoinRadius}
          step="0.1"
          min="0"
          onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {pointJoinRadius: Number(e.target.value)}})}
        />
      </label>
      <label title="path-joining radius (mm)">
        <img src={pathJoinRadiusIcon} alt="path-joining radius (mm)" />
        <input
          type="number"
          value={state.planOptions.pathJoinRadius}
          step="0.1"
          min="0"
          onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {pathJoinRadius: Number(e.target.value)}})}
        />
      </label>
    </div>
    <div>
      <label title="Remove paths that are shorter than this length (in mm)">
        minimum path length
        <input
          type="number"
          value={state.planOptions.minimumPathLength}
          step="0.1"
          min="0"
          onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {minimumPathLength: Number(e.target.value)}})}
        />
      </label>
      <div className="flex">
        <label title="Acceleration when the pen is down (in mm/s^2)">
          down acc. (mm/s<sup>2</sup>)
          <input
            type="number"
            value={state.planOptions.penDownAcceleration}
            step="0.1"
            min="0"
            onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {penDownAcceleration: Number(e.target.value)}})}
          />
        </label>
        <label title="Maximum velocity when the pen is down (in mm/s)">
          down max vel. (mm/s)
          <input
            type="number"
            value={state.planOptions.penDownMaxVelocity}
            step="0.1"
            min="0"
            onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {penDownMaxVelocity: Number(e.target.value)}})}
          />
        </label>
      </div>
      <label>
        cornering factor
        <input
          type="number"
          value={state.planOptions.penDownCorneringFactor}
          step="0.01"
          min="0"
          onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {penDownCorneringFactor: Number(e.target.value)}})}
        />
      </label>
      <div className="flex">
        <label title="Acceleration when the pen is up (in mm/s^2)">
          up acc. (mm/s<sup>2</sup>)
          <input
            type="number"
            value={state.planOptions.penUpAcceleration}
            step="0.1"
            min="0"
            onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {penUpAcceleration: Number(e.target.value)}})}
          />
        </label>
        <label title="Maximum velocity when the pen is up (in mm/s)">
          up max vel. (mm/s)
          <input
            type="number"
            value={state.planOptions.penUpMaxVelocity}
            step="0.1"
            min="0"
            onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {penUpMaxVelocity: Number(e.target.value)}})}
          />
        </label>
      </div>
      <div className="flex">
        <label title="How long the pen takes to lift (in seconds)">
          pen lift duration (s)
          <input
            type="number"
            value={state.planOptions.penLiftDuration}
            step="0.01"
            min="0"
            onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {penLiftDuration: Number(e.target.value)}})}
          />
        </label>
        <label title="How long the pen takes to drop (in seconds)">
          pen drop duration (s)
          <input
            type="number"
            value={state.planOptions.penDropDuration}
            step="0.01"
            min="0"
            onChange={(e) => dispatch({type: "SET_PLAN_OPTION", value: {penDropDuration: Number(e.target.value)}})}
          />
        </label>
      </div>
    </div>
  </div>;
}

function Root({driver}: {driver: Driver}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isPlanning, plan, setPlan] = usePlan(state.paths, state.planOptions);
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  useEffect(() => {
    window.localStorage.setItem("planOptions", JSON.stringify(state.planOptions));
  }, [state.planOptions]);
  useEffect(() => {
    driver.onprogress = (motionIdx: number) => {
      dispatch({type: "SET_PROGRESS", motionIdx});
    };
    driver.oncancelled = driver.onfinished = () => {
      dispatch({type: "SET_PROGRESS", motionIdx: null});
    };
    driver.onconnectionchange = (connected: boolean) => {
      dispatch({type: "SET_CONNECTED", connected});
    };
    driver.ondevinfo = (devInfo: DeviceInfo) => {
      dispatch({type: "SET_DEVICE_INFO", value: devInfo});
    };
    driver.onpause = (paused: boolean) => {
      dispatch({type: "SET_PAUSED", value: paused});
    };
    driver.onplan = (plan: Plan) => {
      setPlan(plan);
    };
    const ondrop = (e: DragEvent) => {
      e.preventDefault();
      const item = e.dataTransfer.items[0];
      const file = item.getAsFile();
      const reader = new FileReader();
      setIsLoadingFile(true);
      setPlan(null);
      reader.onload = () => {
        dispatch(setPaths(readSvg(reader.result as string)));
        document.body.classList.remove("dragover");
        setIsLoadingFile(false);
      };
      reader.onerror = () => {
        setIsLoadingFile(false);
      };
      reader.readAsText(file);
    };
    const ondragover = (e: DragEvent) => {
      e.preventDefault();
      document.body.classList.add("dragover");
    };
    const ondragleave = (e: DragEvent) => {
      e.preventDefault();
      document.body.classList.remove("dragover");
    };
    const onpaste = (e: ClipboardEvent) => {
      e.clipboardData.items[0].getAsString((s) => {
        dispatch(setPaths(readSvg(s)));
      });
    };
    document.body.addEventListener("drop", ondrop);
    document.body.addEventListener("dragover", ondragover);
    document.body.addEventListener("dragleave", ondragleave);
    document.addEventListener("paste", onpaste);
    return () => {
      document.body.removeEventListener("drop", ondrop);
      document.body.removeEventListener("dragover", ondragover);
      document.body.removeEventListener("dragleave", ondragleave);
      document.removeEventListener("paste", onpaste);
    };
  });

  const previewArea = useRef(null);
  const previewSize = useComponentSize(previewArea);
  const showDragTarget = !plan && !isLoadingFile && !isPlanning;

  return <DispatchContext.Provider value={dispatch}>
    <div className={`root ${state.connected ? "connected" : "disconnected"}`}>
      <div className="control-panel">
        <div className={`saxi-title red`} title={state.deviceInfo ? state.deviceInfo.path : null}>
          <span className="red reg">s</span><span className="teal">axi</span>
        </div>
        {!state.connected ? <div className="info-disconnected">disconnected</div> : null}
        <div className="section-header">pen</div>
        <div className="section-body">
          <PenHeight state={state} driver={driver} />
          <MotorControl driver={driver} />
          <ResetToDefaultsButton />
        </div>
        <div className="section-header">paper</div>
        <div className="section-body">
          <PaperConfig state={state} />
          <LayerSelector state={state} />
        </div>
        <details>
          <summary className="section-header">more</summary>
          <div className="section-body">
            <PlanOptions state={state} />
            <VisualizationOptions state={state} />
          </div>
        </details>
        <div className="spacer" />
        <div className="control-panel-bottom">
          <div className="section-header">plot</div>
          <div className="section-body section-body__plot">
            <PlanStatistics plan={plan} />
            <PlotButtons plan={plan} isPlanning={isPlanning} state={state} driver={driver} />
          </div>
        </div>
      </div>
      <div className="preview-area" ref={previewArea}>
        <PlanPreview
          state={state}
          previewSize={{width: Math.max(0, previewSize.width - 40), height: Math.max(0, previewSize.height - 40)}}
          plan={plan}
        />
        <PlanLoader isPlanning={isPlanning} isLoadingFile={isLoadingFile} />
        {showDragTarget ? <DragTarget/> : null}
      </div>
    </div>
  </DispatchContext.Provider>;
}

function DragTarget() {
  return <div className="drag-target">
    <div className="drag-target-message">
      Drag SVG here
    </div>
  </div>;
}

ReactDOM.render(<Root driver={Driver.connect()}/>, document.getElementById("app"));

function withSVG<T>(svgString: string, fn: (svg: SVGSVGElement) => T): T {
  const div = document.createElement("div");
  div.style.position = "absolute";
  div.style.left = "99999px";
  document.body.appendChild(div);
  try {
    div.innerHTML = svgString;
    const svg = div.querySelector("svg") as SVGSVGElement;
    return fn(svg);
  } finally {
    div.remove();
  }
}

function readSvg(svgString: string): Vec2[][] {
  return withSVG(svgString, flattenSVG).map((line) => {
    const a = line.points.map(([x, y]: [number, number]) => ({x, y}));
    (a as any).stroke = line.stroke;
    (a as any).groupId = line.groupId;
    return a;
  });
}
