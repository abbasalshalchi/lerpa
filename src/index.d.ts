// SPDX-License-Identifier: MIT
// Lerpa -- Copyright (C) 2026 Abbas Alshalchi

/** A parsed .lerpa: the artwork, the tracks, and both resting states. */
export interface LerpaDocument {
  /** Author-space width in pixels. Drawing is scaled to the canvas from this. */
  w: number;
  h: number;
  /** Seconds. */
  dur: number;
  fps: number;
  groups?: string[];
  colors?: string[];
  bg?: string | null;
  /** The resting states, as standalone SVG strings. */
  states?: { start?: string; end?: string } | null;
  els: unknown[];
  [key: string]: unknown;
}

export interface LerpaPlayerOptions {
  /** CSS colour painted before each frame. Defaults to the file's own. */
  background?: string | null;
  /** How the drawing fits the canvas. Default `'contain'`. */
  fit?: 'contain' | 'cover' | 'stretch';
  /** Playback rate multiplier. Default `1`. */
  speed?: number;
  /** Multiplies every stroke width, for hairlines on dense scenes. Default `1`. */
  lineScale?: number;
  /**
   * Stroke each fill in its own colour to close the antialiasing hairline
   * between abutting polygons. On by default; every 2D rasteriser needs it.
   */
  seamFix?: boolean;
  seamWidth?: number;
  /** Fires when a non-looping run reaches the end. */
  onend?: (() => void) | null;
  /** Re-fit on container resize via ResizeObserver. On by default. */
  autoResize?: boolean;
}

export interface LerpaPlayOptions {
  loop?: boolean;
  /** Run the timeline backwards. Costs nothing: reversal is a time transform. */
  reverse?: boolean;
  /** Start from this time in seconds instead of the current position. */
  from?: number;
}

export interface LerpaBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LerpaHit {
  /** The element's stable id, when the bake shipped ids. */
  id: string | null;
  group: string;
  index: number;
}

/** Placement for `drawInto`, applied on top of the context's own transform. */
export interface LerpaTransform {
  x?: number;
  y?: number;
  /** Radians, clockwise, about the anchor. */
  rotation?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  /** Default `'center'`. */
  anchor?: 'center' | 'topleft';
}

export declare class LerpaPlayer {
  /**
   * Pass `null` for a *detached* player: no canvas of its own, drawn only
   * through `drawInto`. That is how many instances share one surface.
   */
  constructor(canvas: HTMLCanvasElement | null, doc: LerpaDocument, options?: LerpaPlayerOptions);

  readonly canvas: HTMLCanvasElement | null;
  readonly width: number;
  readonly height: number;
  /** Seconds. */
  readonly duration: number;
  readonly fps: number;
  readonly groups: string[];
  /** Current position in seconds. */
  time: number;
  playing: boolean;
  speed: number;
  lineScale: number;
  /** Elements drawn in the last frame, after culling. */
  readonly visible: number;

  /** The parsed document, including `doc.motion` — which way the camera moved. */
  readonly doc: LerpaDocument;

  play(options?: LerpaPlayOptions): this;
  /** Play backwards. No second file: reversal is a time transform. */
  reverse(options?: LerpaPlayOptions): this;
  pause(): this;
  /** Jump to a time in seconds and paint it. */
  seek(t: number): this;
  /** Paint one frame without touching playback state. No-op when detached. */
  render(t: number): void;
  /**
   * Draw one frame into a context you own, without clearing it. Lets many
   * instances share a single canvas — clear once yourself, then draw each.
   */
  drawInto(ctx: CanvasRenderingContext2D, t: number, transform?: LerpaTransform): void;
  /** Re-read the canvas size and re-fit. Called for you unless autoResize is off. */
  resize(): void;
  /**
   * Size the canvas from numbers rather than layout: CSS pixels and a device
   * pixel ratio. `resize` measures and calls this; call it yourself where there
   * is no layout to measure, as in a worker.
   */
  resizeTo(cssWidth: number, cssHeight: number, dpr?: number): void;

  /** Recolour every element in a group. Live data binding, no re-bake. */
  setGroupColor(group: string, css: string): this;
  setElementColor(id: string, css: string | null): this;
  /** The same for many ids, in one repaint. `null` clears them. */
  setElementColors(ids: Iterable<string>, css: string | null): this;

  /** Fade or hide a group. 0 hides, 1 restores, null drops the override. */
  setGroupOpacity(group: string, alpha: number | null): this;
  setElementOpacity(id: string, alpha: number | null): this;
  /** Show only these groups; `rest` is what the others drop to (0 hides). */
  isolateGroups(groups: string | string[] | null, rest?: number): this;
  /** Where a group sits on screen at `t`, in author coordinates. */
  groupBounds(group: string | string[], t?: number): LerpaBox | null;
  /** Zoom and pan so a group fills the canvas. Keeps `pick` in agreement. */
  frameGroup(group: string | string[],
             options?: { padding?: number; time?: number }): LerpaBox | null;
  /** Recolour one palette swatch, and everything drawn in it. */
  setColor(index: number, css: string): this;

  /**
   * Hit-test in client coordinates. Tests the curve, not the polyline, so it
   * matches what the viewer can see.
   */
  pick(clientX: number, clientY: number, slop?: number): LerpaHit | null;

  /** A resting state as an SVG string, for cutting to static artwork. */
  state(which?: 'start' | 'end'): string | null;

  destroy(): void;
}

/** Parse an .lerpa (or bare track JSON) that you already have as text. */
export declare function parseDocument(text: string): LerpaDocument;

/** Fetch and parse an .lerpa. */
export declare function fetchDocument(src: string, init?: RequestInit): Promise<LerpaDocument>;

/**
 * Register `<lerpa-player>`. Called on import of the package root; safe to call
 * again, and a no-op where `customElements` does not exist, so it does not
 * break server rendering.
 */
export declare function defineElement(tag?: string): void;

export declare class LerpaPlayerElement extends HTMLElement {
  readonly player: LerpaPlayer | null;
  play(options?: LerpaPlayOptions): this;
  reverse(options?: LerpaPlayOptions): this;
  pause(): this;
  seek(t: number): this;
  setGroupColor(group: string, css: string): this;
  pick(x: number, y: number): LerpaHit | null;
  /** Hand off to the static resting state — the transition-to-DOM pattern. */
  showState(which?: 'start' | 'end'): this;
  showAnimation(): this;
}

export interface LerpaLoadOptions extends LerpaPlayerOptions {
  autoplay?: boolean;
  loop?: boolean;
}

/**
 * Load an .lerpa and attach it to a container. Pass a canvas to draw into it, or
 * any element to have one created and sized inside it.
 */
export declare function load(
  source: string | LerpaDocument,
  target: HTMLElement | HTMLCanvasElement,
  options?: LerpaLoadOptions,
): Promise<LerpaPlayer>;

export interface LerpaOffscreenOptions {
  /** URL of the .lerpa for the worker to fetch. */
  src?: string;
  /** The .lerpa as text, when you already have it. Skips the worker's fetch. */
  text?: string;
  /** CSS colour painted before each frame. Defaults to the file's own. */
  background?: string | null;
  /** Default `'contain'`. */
  fit?: 'contain' | 'cover' | 'stretch';
  /** On by default, as for `LerpaPlayer`. */
  seamFix?: boolean;
  /** Device pixel ratio. Defaults to the window's. */
  dpr?: number;
  /** Called with the time of each frame once the worker has drawn it. */
  onDrawn?: ((t: number) => void) | null;
}

/** A player running on a worker, driven by messages. */
export interface LerpaOffscreenView {
  /** Seconds. */
  readonly duration: number;
  readonly fps: number;
  /** How many elements the document has. */
  readonly elements: number;
  /** Author-space size. */
  readonly width: number;
  readonly height: number;
  /** Ask for a time. Faster than frames is fine: only the newest is drawn. */
  seek(t: number): this;
  /** Re-measure the canvas element here and pass the size to the worker. */
  resize(): this;
  /** Zoom and pan: CSS pixels per author unit, then an offset in CSS pixels. */
  view(scaleX: number, scaleY: number, offX: number, offY: number, t?: number): this;
  setBackground(value: string | null): this;
  /** Write-only: replaces `onDrawn`. */
  onframe: ((t: number) => void) | null;
  destroy(): void;
}

/** True when this browser can play on a worker; fall back to `load` if not. */
export declare function canOffscreen(): boolean;

/**
 * Hand a canvas to a worker and play there, so drawing never blocks input.
 * Resolves once the first frame is drawn. The canvas is transferred for good:
 * nothing else may draw to it afterwards, and there is no `pick()`.
 */
export declare function mountOffscreen(
  canvas: HTMLCanvasElement,
  options?: LerpaOffscreenOptions,
): Promise<LerpaOffscreenView>;

declare const _default: { load: typeof load; defineElement: typeof defineElement };
export default _default;
