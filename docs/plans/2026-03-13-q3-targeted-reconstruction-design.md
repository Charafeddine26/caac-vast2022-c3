# Q3 Targeted Reconstruction — Design Document

**Date:** 2026-03-13
**Scope:** Fix quality gaps in Q3 (Employment Dynamics) dashboard to match Q1/Q2 rigor.
**Approach:** Targeted in-place fixes — no new panels, no architecture changes, 7 files modified.

---

## Context

Q3 was implemented following the same MVC pattern as Q1/Q2 (D3 class + React Container + Redux slices), but the review identified several quality issues that make it visually unusable and inconsistent with Q1/Q2.

**Data reality:** 249 employers, 15 months. 185/249 (74%) have identical minimum turnover (0.0667). Only ~64 employers show variation. Headcounts are tiny (1–8).

---

## Decisions Summary

| Decision | Choice |
|----------|--------|
| Heatmap filtering | Filter to top/bottom N employers (not all 249) |
| Scatter legends | Color gradient legend + size reference circles |
| ControlBar label | Explicit: "Top/bottom employers by turnover:" |
| Event handler pattern | Fix all 3 D3 classes: `.on()` after `.join()` |
| `hoveredMonth` interaction | Skip — no receiving panel for temporal cross-linking |
| ControlBar h1 style | Remove inline style, use CSS class |
| Tooltip enhancement | Add turnover rank |

---

## Fix 1: Heatmap Reconstruction (`HeatmapD3.js` + `HeatmapContainer.jsx`)

### Problem
Renders all 249 employers as rows. 74% have identical turnover → dense unreadable wall of uniform color. `topN` only controls Y-axis labels, not actual rendering. `updateHighlighting` mutates DOM during `.each()` iteration over ~3,700 cells.

### Solution

**HeatmapContainer.jsx** — compute filtered data in `useMemo`:
- Sort employers by `avg_turnover` descending
- Take top N + bottom N (deduplicated)
- Filter `monthly` to only include those employer IDs
- Pass filtered data to D3

**HeatmapD3.update()** — receives only filtered data:
- `yScale` domain is top N + bottom N employer IDs (~20 rows)
- Cells are large enough to read individually
- Add a visual separator line between the top N (high turnover) and bottom N (stable) groups
- Color scale domain based on filtered data range for better contrast

**HeatmapD3.updateHighlighting()** — fix DOM mutation:
- Remove `this.parentNode.appendChild(this)` inside `.each()`
- Use stroke-based highlighting only (no z-order changes needed for rect grid)

**Event handlers** — move `.on()` after `.join()`:
```js
.join(enter => ..., update => ..., exit => ...)
.on("mouseenter", ...)
.on("mouseleave", ...)
.on("click", ...);
```

---

## Fix 2: Scatter Plot Legends + Event Fix (`TurnoverScatterD3.js`)

### Problem
Color (hourly rate via `interpolateRdYlGn`) and size (departures via `scaleSqrt`) have no visual key. User cannot decode encodings without hovering every dot. Event handlers only on enter callback.

### Solution

**Right margin** — increase from 30 to 100 to fit legends.

**Color gradient legend** (in `create()`):
- Same pattern as heatmap's gradient legend
- SVG `linearGradient` in `<defs>`
- Rect filled with gradient + `axisRight` with dollar-formatted ticks
- Label: "Hourly rate ($)"

**Size legend** (in `create()`, below color legend):
- 3 reference circles: small (min departures), medium, large (max departures)
- Each circle with a text label showing the value
- Updated in `update()` once actual data extents are known

**Event handlers** — move `.on()` after `.join()`.

---

## Fix 3: Bar Chart Event Fix (`TurnoverBarD3.js`)

### Problem
Event handlers only on enter. `updateHighlighting` does `this.parentNode.appendChild(this)` — unnecessary for horizontal bars (no overlap to resolve).

### Solution
- Move `.on()` after `.join()`
- Remove `this.parentNode.appendChild(this)` from `updateHighlighting`

---

## Fix 4: ControlBar (`Q3ControlBar.jsx`)

### Problem
Inline `style={{ fontSize: "16px", margin: 0 }}` on `h1` duplicates CSS and omits `margin-right: auto`, breaking layout alignment. Label "Show top/bottom:" is vague.

### Solution
- Remove inline style — `.controlbar h1` CSS rule already handles sizing and auto-margin
- Change label to `"Top/bottom employers by turnover:"`

---

## Fix 5: Tooltip Enhancement (`Q3Tooltip.jsx`)

### Problem
Shows "Employer {id}" as title — same info already on axes. No contextual ranking.

### Solution
- Compute rank: sort employers by `avg_turnover` descending, find index
- Display `"Rank: #X of 249 by turnover"` after the employer ID header

---

## Files Modified

| File | Type |
|------|------|
| `client/src/components/q3/heatmap/HeatmapD3.js` | Rebuild |
| `client/src/components/q3/heatmap/HeatmapContainer.jsx` | Modify |
| `client/src/components/q3/turnoverscatter/TurnoverScatterD3.js` | Modify |
| `client/src/components/q3/turnoverbar/TurnoverBarD3.js` | Modify |
| `client/src/components/q3/controlbar/Q3ControlBar.jsx` | Modify |
| `client/src/components/q3/tooltip/Q3Tooltip.jsx` | Modify |

## Files Unchanged

- `Q3Dashboard.jsx` — layout stays the same
- `Q3DataSlice.js` — data shape stays the same
- `Q3InteractionSlice.js` — no `hoveredMonth` needed
- `store.js`, `App.jsx`, `TabBar.jsx` — already wired correctly
- `preprocess_q3.py`, `server/app.py` — data pipeline unchanged
