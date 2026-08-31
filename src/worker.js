// SPDX-License-Identifier: AGPL-3.0-or-later
// Lerpa -- Copyright (C) 2026 Abbas Alshalchi
// Also available under a commercial licence; see COMMERCIAL.md
/**
 * Worker half of offscreen playback: owns a player on a transferred canvas.
 *
 * Nothing here makes a frame cheaper. It makes the *main thread* free while a
 * frame is drawn, which is what a dragged scrub needs -- the pointer keeps
 * being handled at full rate and the picture trails it, instead of the pointer
 * itself stalling for the length of a frame.
 *
 * Started by `mount()` in offscreen.js; not intended to be imported directly.
 *
 * @module
 */

import { LerpaPlayer, parseDocument } from './player.js';

let player = null;
let want = null;        // latest time asked for, or null when nothing is due
let raf = 0;         // pending coalesced draw, 0 when none is queued

/**
 * Draw the most recent request and nothing else.
 *
 * A drag posts a time per pointer event, which arrive faster than frames can be
 * drawn. Rendering each in turn would build a queue and show the viewer an
 * ever-staler picture -- the exact lag this is meant to remove. Only the newest
 * time survives; the rest are dropped unseen, which is the correct answer for
 * every one of them.
 */
function pump() {
  raf = 0;
  if (!player || want === null) return;
  const t = want;
  want = null;
  player.render(t);
  self.postMessage({ type: 'drawn', t });
}

function schedule() {
  // Not requestAnimationFrame: a dedicated worker has no animation frames, and
  // calling it here would throw. A macrotask is the right shape anyway --
  // messages arriving while a frame is being drawn all land before this task
  // runs, so they collapse into one render of the newest time.
  if (!raf) raf = setTimeout(pump, 0);
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      const doc = msg.text ? parseDocument(msg.text)
                           : await fetch(msg.src).then((r) => r.text()).then(parseDocument);
      player = new LerpaPlayer(msg.canvas, doc, {
        ...(msg.options || {}),
        autoResize: false,          // no layout to observe in here
      });
      if (msg.background) player.background = msg.background;
      player.resizeTo(msg.cssWidth, msg.cssHeight, msg.dpr);
      self.postMessage({
        type: 'ready',
        duration: player.duration,
        fps: doc.fps,
        width: doc.w,
        height: doc.h,
        elements: doc.els.length,
      });
      return;
    }
    if (!player) return;
    if (msg.type === 'seek')   { want = msg.t; schedule(); return; }
    if (msg.type === 'resize') { player.resizeTo(msg.cssWidth, msg.cssHeight, msg.dpr); return; }
    if (msg.type === 'view') {
      // zoom and pan, applied where the drawing happens
      player.scaleX = msg.scaleX; player.scaleY = msg.scaleY;
      player.offX = msg.offX; player.offY = msg.offY;
      want = msg.t !== undefined ? msg.t : player.time;
      schedule();
      return;
    }
    if (msg.type === 'background') { player.background = msg.value; want = player.time; schedule(); return; }
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error && error.message || error) });
  }
};
