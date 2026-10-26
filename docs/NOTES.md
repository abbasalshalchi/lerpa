# Player notes

What has been learned about the Lerpa player from 2 August to 13 September 2026:
the bugs, the performance measurements, the format additions, and the ideas that
were measured and not built. The [README](../README.md) is how to use it; this is
why it is the way it is.

The baker's notes, which cover ordering, merging and the rest of the pipeline, are
kept with VecBake.

---

## Bugs

| Seen | Symptom | Cause | Fix |
|---|---|---|---|
| 2026-08-01 | The animation trails behind every frame it passes through | `background="transparent"` is a truthy string, so the fill branch ran, and a transparent fill composites to nothing — the canvas was never cleared | Always `clearRect`, then fill only a real background |
| 2026-08-03 | Everything disappears for a moment when a transition starts | `play()` only scheduled a frame; on a reverse it moved the clock without painting, so one frame showed the wrong end of the clip | Paint immediately |
| 2026-08-09 | TypeScript consumers fail to resolve the package | `types` pointed at a missing `index.d.ts`; the README said to install `ivg` | Declarations for all entry points; `prepublishOnly` imports the package with no DOM (`7e52132`) |
| 2026-08-10 | `hsl()` colours come out as the wrong red; named colours come out black | `setGroupColor` scraped the first three numbers from any string; 8-digit hex overflowed the sign bit | A real parser, with a paint-and-read-back fallback that makes `oklch()`, `lab()` and `color-mix()` work (`a62cc50`) |
| 2026-08-21 | A correctly ordered stroke shows through between two abutting fills | `seamWidth` was in scene units, and the seam is one *device* pixel: at fit scale 0.575 the stroke was 0.4 px and closed nothing | At least one device pixel, from the context's own transform (`a252480`) |
| 2026-08-22 | The player seizes under the cursor | `pick()` on empty background built and rasterised a path for every drawn element: 69 ms | Reject by bounding box first: 5.1 ms (`2279335`) |
| 2026-08-31 | Elements with equal depths reorder between frames | Found while replacing the sort: depths differing by 9e-13 against a 6e-6 quantum were ordered by float noise | Ties go to element index (`29636db`) |
| 2026-09-05 | Split parts show their cut as an outline | A merged outline is a stroked fill whose silhouette includes the cut | `sw`, a per-point seam mask: the fill keeps the cut, the stroke skips it (`dc05cca`) |
| 2026-09-13 | A dark wedge sweeps across the docking module in a VecBake preview | Nothing read the baker's `sp` field, so a merged fill's three rings were traced as one 87-point path and the jumps between ring ends crossed the part. The installed copy of the player was older still — every reinstall that session copied only the add-on's `.py` files | Trace each ring as its own subpath (`f7da28a`); reinstall the whole add-on folder. Diagnosed twice as a baker fault first |

---

## Performance

### The hairline cliff
The single biggest lever on frame rate. The cost is not canvas size, canvas width or
drawn area — each was tested and eliminated. It is the stroke's width in device pixels:

    device px = stroke_width × (drawn width / document width) × devicePixelRatio

At or below 1.0 the rasteriser takes a hairline path; above it, every segment becomes
a polygon. On 5,699 elements with 4,940 strokes:

| device px | fps |
|---|---|
| 1.60 | 15 |
| 1.12 | 17 |
| **1.00** | **39** |
| 0.96 | 41 |

Budget `stroke_width × scale × dpr ≤ 1.0`. A half-width hero of a 1920-wide document
at `stroke_width` 1.6 is 0.8 px at dpr 1 (~106 fps) and 1.6 px at dpr 2 (16 fps). Cap
dpr or bake thinner lines — the same lever.

### Where a frame goes
Voyager probe, 6,307 elements drawn, 960 px wide:

| | ms | share |
|---|---|---|
| Interpolating the tracks (JS) | ~17 | 33% |
| Building paths and setting styles | 6–12 | 12–22% |
| Rasterisation | 24–29 | 46–55% |

Canvas 2D in Chrome is already GPU-backed; the rasterisation half is draw-call
overhead, not fill rate.

### Measured
| Change | Result | Status |
|---|---|---|
| Pack depth and index into one double for the engine's native sort | `_solve` 10.15 → 6.63 ms, pixel-identical | Shipped (`29636db`) |
| Render in a worker on a transferred `OffscreenCanvas` | No frame cheaper; main-thread wait during a drag 44.5 → 0.2 ms median, 159.6 → 0.4 ms p95 | Shipped (`29636db`) |
| Seam fix on a fill-heavy scene (1,654 elements) | 8–11 → 4–5 ms with it off | README |
| Seam fix on a stroke-heavy scene (Voyager) | 52.0 vs 52.3 ms — no measurable cost | — |
| One `fill()` per butterfly instead of 11 (120 instances) | 12.97 → 2.83 ms | Measured on the swarm demo |
| Batch fills by colour on the Voyager | Neutral | Not shipped |
| Cache `Path2D` per element | Butterfly 16.32 → 7.88 ms | Not built |
| A WebGL renderer | Ceiling ~2.5–3× while interpolation stays on the CPU | Not built — "no WebGL required" is part of the pitch |
| three.js, same model and camera | 5–6× faster at 960 px, 8–9× at 1080p; both 1.88 MB over the wire | Comparison only |

### Measurement traps
- **`lastRenderMs` under-reports by about 10×.** Canvas 2D submits asynchronously.
  Read back one pixel to force a finish before timing a frame.
- **A hidden tab runs no `requestAnimationFrame`.** Frame rates and screenshots from a
  background tab mean nothing.
- **Pixels read from a canvas in the document are not stable** across renders in Chrome,
  even with identical internal state. Measure at the document's own size, with no
  transform change.

---

## Format additions

Additive, in that an older player still parses the file — but not always harmlessly.
`sp` is the exception, and it is worth knowing why: ignoring it does not lose a
ring, it joins all of them into one path, and the jumps between ring ends cut
straight across the part. See the wedge in the bug table above.

| Field | Version | Meaning |
|---|---|---|
| group opacity, bounds, framing | 0.3.0 | Runtime part explorers: hide, isolate and frame a group on the file already loaded. `groupBounds` takes a time, because a part on a turntable moves |
| `w`, `oc` on a fill | 0.4.0 | A fill that strokes its own outline — how a merged silhouette draws its line |
| `sw` | after 0.4.0 | Static per-point seam mask: spans of a merged outline filled but not stroked |
| `sp` | after 0.4.0 (`f7da28a`) | Points per subpath: a merged fill with several rings under nonzero winding — a hole wound against its container, an island wound with it. Guard `test/subpaths.mjs` |

---

## Licence

From 0.5.0 (26 October 2026) the player is **MIT**. It was AGPL-3.0-or-later with a
commercial licence for closed-source use, on the reasoning that AGPL is the condition a
closed product cannot meet and so leaves something to sell. It left nothing to sell in
practice: no company to sign a licence with, no lawyer to write one, and real downloads at
zero. AGPL mainly kept away the people whose use of it would count. The project is now
free and open source as a whole -- the Blender add-on stays GPL-3.0-or-later, as anything
linking Blender's Python API must -- and baked files never carried any obligation.
Versions up to 0.4.0 remain under the terms they were released with.

## Releases

`npm publish` and `npm login` are run by the maintainer, never by an assistant, and no
token leaves npm. Publishing runs from GitHub Actions with trusted publishing; see
[RELEASING.md](../RELEASING.md). The first version of a package has to be published by
hand, because npm cannot configure a trusted publisher for a package that does not exist.

The package name is `lerpa-player`: `lerpa` was rejected at publish time by npm's
typosquat filter as too close to `lerna`, although the registry reported it free.
