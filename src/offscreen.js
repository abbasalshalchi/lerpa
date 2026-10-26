// SPDX-License-Identifier: MIT
// Lerpa -- Copyright (C) 2026 Abbas Alshalchi
/**
 * Play a .lerpa on a worker thread, so drawing never blocks input.
 *
 *     const view = await mount(canvas, { src: '/anim/voyager.lerpa' });
 *     canvas.onpointermove = (e) => view.seek(timeFromX(e.clientX));
 *
 * The trade is deliberate: the same frame takes the same time, but it is spent
 * somewhere the pointer, the scroll and the rest of the page cannot feel it.
 * That matters most for a dragged scrub, where the hand is in the loop and lag
 * reads as the control being broken rather than the picture being slow.
 *
 * What you give up by moving off the main thread: `pick()` and anything else
 * that wants the DOM stays here, and the canvas is transferred, so nothing else
 * may draw to it afterwards -- `transferControlToOffscreen` is one-way for the
 * life of the element.
 *
 * @module
 */

/** True when this browser can actually do it; callers should fall back if not. */
export function canOffscreen() {
  return typeof Worker !== 'undefined' &&
         typeof OffscreenCanvas !== 'undefined' &&
         typeof HTMLCanvasElement !== 'undefined' &&
         typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';
}

/**
 * Hand `canvas` to a worker and return a handle for driving it.
 *
 * Resolves once the document is parsed and the first frame is up, so callers
 * can await a picture rather than guess. Pass `text` to skip the worker's own
 * fetch when the document is already in hand.
 */
export function mount(canvas, options = {}) {
  if (!canOffscreen()) return Promise.reject(new Error('OffscreenCanvas unavailable'));

  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const offscreen = canvas.transferControlToOffscreen();
  const dpr = () => (options.dpr || (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1));
  const box = () => {
    const r = canvas.getBoundingClientRect();
    return [r.width || canvas.width, r.height || canvas.height];
  };

  let onDrawn = options.onDrawn || null;

  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'error') { reject(new Error(msg.message)); return; }
      if (msg.type === 'drawn') { if (onDrawn) onDrawn(msg.t); return; }
      if (msg.type !== 'ready') return;

      const view = {
        duration: msg.duration,
        fps: msg.fps,
        elements: msg.elements,
        width: msg.width,
        height: msg.height,

        /** Ask for a time. Faster than frames is fine -- extras are dropped. */
        seek(t) { worker.postMessage({ type: 'seek', t }); return view; },

        /** Re-measure the element here and tell the worker what it found. */
        resize() {
          const [cw, ch] = box();
          worker.postMessage({ type: 'resize', cssWidth: cw, cssHeight: ch, dpr: dpr() });
          return view;
        },

        /** Zoom and pan, in the same terms the player uses. */
        view(scaleX, scaleY, offX, offY, t) {
          worker.postMessage({ type: 'view', scaleX, scaleY, offX, offY, t });
          return view;
        },

        setBackground(value) {
          worker.postMessage({ type: 'background', value });
          return view;
        },

        set onframe(fn) { onDrawn = fn; },

        destroy() { worker.terminate(); },
      };
      resolve(view);
    };
    worker.onerror = (err) => reject(err.error || new Error(err.message || 'worker failed'));

    const [cssWidth, cssHeight] = box();
    worker.postMessage({
      type: 'init',
      canvas: offscreen,
      src: options.src,
      text: options.text,
      background: options.background,
      options: { fit: options.fit || 'contain', seamFix: options.seamFix !== false },
      cssWidth, cssHeight, dpr: dpr(),
    }, [offscreen]);
  });
}
