# Q3 Design — Employment Dynamics Dashboard

**VAST Challenge 2022 — Mini-challenge Economic (Q3)**

> "Describe the health of the various employers within the city limits.
> What employment patterns do you observe?
> Do you notice any areas of particularly high or low turnover?"

**Date:** 2026-03-13
**Status:** Approved

---

## Design Decisions Summary

| Decision | Choice |
|---|---|
| Turnover computation | Monthly employer assignment (reuse Q1's monthly_job CTE), detect transitions between consecutive months |
| Heatmap color scale | Sequential white → orange → dark red (d3.interpolateOrRd) |
| Heatmap row sorting | By average turnover rate, highest at top |
| Panel H style | Horizontal bar chart ranked by turnover (not divergent — turnover ≥ 0) |
| Panel H filtering | TopN control (show top N + bottom N) |
| Panel I scatter | Turnover rate (Y) vs employer size (X), colored by avg hourly rate, sized by total departures |
| Q3 ControlBar | Title + topN slider + clear selection (mirrors Q1) |
| Q3 Tooltip | EmployerId, avg headcount, avg turnover, arrivals, departures, tenure, hourly rate |
| Layout | Row 1: Heatmap full width / Row 2: Bar chart (flex:1) + Scatter (flex:2) |
| Redux | Separate Q3DataSlice + Q3InteractionSlice |
| Data loading | Lazy — fetch only when Q3 tab activated |

---

## 1. Data Pipeline (`preprocess_q3.py`)

### Input

- Activity Logs (`ParticipantStatusLogs*.csv`, 113M rows) — participantId → jobId per timestamp
- Jobs.csv (1,328 rows) — jobId → employerId, hourlyRate
- Employers.csv (253 rows) — employerId

### DuckDB Query — Monthly employer assignment

Reuses Q1's `monthly_job` CTE:

```sql
WITH monthly_job AS (
    SELECT
        participantId,
        date_trunc('month', timestamp::TIMESTAMP) AS month,
        LAST(jobId ORDER BY timestamp::TIMESTAMP) AS jobId
    FROM ActivityLogs
    WHERE jobId IS NOT NULL
    GROUP BY participantId, date_trunc('month', timestamp::TIMESTAMP)
)
SELECT
    mj.participantId,
    mj.month,
    j.employerId
FROM monthly_job mj
JOIN Jobs j ON mj.jobId = j.jobId
ORDER BY mj.participantId, mj.month
```

### Transition detection (Pandas)

For each participant, compare consecutive months:
- employerId changes → departure from old, arrival at new
- Participant disappears → departure
- Participant appears → arrival

### Derived attributes per employer per month

- `headcount`: COUNT(DISTINCT participantId)
- `arrivals`: participants whose first month at this employer = current month
- `departures`: participants whose last month at this employer = current month
- `turnover_rate`: (arrivals + departures) / (2 * headcount)

### Employer summary

- `avg_headcount`: mean monthly headcount
- `avg_turnover`: mean monthly turnover rate
- `total_arrivals`: sum
- `total_departures`: sum
- `avg_tenure`: mean duration (months) of all participant stints
- `avg_hourly_rate`: mean hourlyRate from Jobs table

### Output JSON

**`turnover_monthly.json`** (~3,795 records):
```json
{
  "employerId": 381,
  "month": "2022-03-01",
  "headcount": 12,
  "arrivals": 2,
  "departures": 1,
  "turnover_rate": 0.125
}
```

**`employers_turnover.json`** (253 records):
```json
{
  "employerId": 381,
  "avg_headcount": 11.5,
  "avg_turnover": 0.13,
  "total_arrivals": 18,
  "total_departures": 15,
  "avg_tenure": 8.2,
  "avg_hourly_rate": 18.45
}
```

---

## 2. Server & API

```python
@app.route("/api/q3/data")
def get_q3_data():
    with open(os.path.join(DATA_DIR, "turnover_monthly.json")) as f:
        monthly = json.load(f)
    with open(os.path.join(DATA_DIR, "employers_turnover.json")) as f:
        employers = json.load(f)
    return jsonify({"monthly": monthly, "employers": employers})
```

---

## 3. Architecture

### Redux store additions

```js
q3Dataset: q3DatasetReducer,
q3Interaction: q3InteractionReducer
```

**Q3DataSlice.js:**
```js
initialState: {
  status: "idle",
  error: null,
  monthly: [],
  employers: []
}
```

**Q3InteractionSlice.js:**
```js
initialState: {
  hoveredEmployerId: null,
  selectedEmployerIds: [],
  topN: 10
}
```

### File tree

```
client/src/
  components/
    Q3Dashboard.jsx                                     NEW
    q3/
      controlbar/Q3ControlBar.jsx                       NEW
      heatmap/HeatmapD3.js                              NEW
      heatmap/HeatmapContainer.jsx                      NEW
      turnoverbar/TurnoverBarD3.js                      NEW
      turnoverbar/TurnoverBarContainer.jsx              NEW
      turnoverscatter/TurnoverScatterD3.js              NEW
      turnoverscatter/TurnoverScatterContainer.jsx      NEW
      tooltip/Q3Tooltip.jsx                             NEW
  store/
    Q3DataSlice.js                                      NEW
    Q3InteractionSlice.js                               NEW
```

---

## 4. Panel G — Turnover Heatmap

### Purpose

Matrix of 253 employers × 15 months colored by turnover rate. Uses matrix visualization from course (Tuto4). Reveals row patterns (chronic high turnover employers), column patterns (systemic months), and isolated events.

### Dimensions

1080 × 400px (full width). Margins: `{ top: 20, right: 30, bottom: 40, left: 60 }`.

### Visual encoding

| Data variable | Munzner type | Channel | Details |
|---|---|---|---|
| Employer | Categorical nominal | Position Y (rows) | Sorted by avg turnover, highest at top. `d3.scaleBand` |
| Month | Quantitative ordered | Position X (columns) | 15 columns. `d3.scaleBand` |
| Turnover rate | Quantitative sequential | Color fill | `d3.scaleSequential(d3.interpolateOrRd)` white→orange→red |

### D3 details

- 3,795 `<rect>` cells via `.data(monthly).join()`
- Color legend: gradient bar in top-right
- Y-axis: only top/bottom N employer labels shown (253 would be unreadable)
- X-axis: month labels

### Interaction

- `mouseenter` on cell → `setHoveredEmployer(employerId)` → row outlines, others dim
- `click` → `toggleSelectedEmployer(employerId)`

### updateHighlighting

- Hovered row: stroke #000, stroke-width 1.5 on all cells in row
- Selected rows: lighter outline
- Others: opacity 0.4 when something active

---

## 5. Panel H — Turnover Ranking (Bar Chart)

### Purpose

Ranks top N + bottom N employers by turnover rate. Shows areas of high/low turnover.

### Dimensions

350 × 400px (flex: 1). Margins: `{ top: 20, right: 20, bottom: 40, left: 70 }`.

### Visual encoding

| Data variable | Munzner type | Channel | Details |
|---|---|---|---|
| Avg turnover rate | Quantitative continuous | Position X (bar length) | `d3.scaleLinear`, 0 to max |
| Employer | Categorical nominal | Position Y (sorted) | Highest turnover at top |
| Stability | Categorical binary | Hue | Green (#2ca02c) = bottom N (stable), Red (#d62728) = top N (unstable) |

Reference line: vertical dashed at median turnover.

### Interaction

Same as Q1 Panel B. Hover/click synchronized.

---

## 6. Panel I — Turnover vs Size Scatter

### Purpose

Tests correlations: employer size vs turnover, pay level vs retention.

### Dimensions

700 × 400px (flex: 2). Margins: `{ top: 20, right: 30, bottom: 50, left: 60 }`.

### Visual encoding

| Data variable | Munzner type | Channel | Details |
|---|---|---|---|
| Avg headcount | Quantitative continuous | Position X | Employer size |
| Avg turnover rate | Quantitative continuous | Position Y | Instability |
| Avg hourly rate | Quantitative continuous | Color | `d3.scaleSequential(d3.interpolateRdYlGn)` red→yellow→green |
| Total departures | Quantitative continuous | Size | `d3.scaleSqrt()`, [3, 18] |

No quadrant reference lines (axes not divergent).

### Interaction

Same pattern as Q1 ScatterplotD3. Hover/click/brushing & linking.

---

## 7. Q3 ControlBar & Tooltip

### Q3ControlBar

- Title: "VAST 2022 -- Employment Dynamics"
- TopN slider: "Show top/bottom:" number input (1-50, default 10)
- Clear selection button

### Q3Tooltip

Employer hover shows: employerId, avg headcount, avg turnover (%), total arrivals, total departures, avg tenure (months), avg hourly rate ($).

---

## 8. Layout

```
+------------------------------------------------------+
|  Tab Bar: [Q1] [Q2] [Q3*]                           |
+------------------------------------------------------+
|  Q3 ControlBar                                       |
+------------------------------------------------------+
|                                                      |
|  Panel G — Heatmap (1080 × 400)                     |
|  Employer × Month Turnover Rate                      |
|                                                      |
+---------------------------+--------------------------+
|                           |                          |
|  Panel H — Bar Chart      |  Panel I — Scatter       |
|  Turnover Ranking         |  Turnover vs Size        |
|  (350 × 400, flex:1)     |  (700 × 400, flex:2)    |
|                           |                          |
+---------------------------+--------------------------+
```

---

## 9. Coordination Summary

| Action | Panel G (Heatmap) | Panel H (Bar) | Panel I (Scatter) |
|---|---|---|---|
| Hover employer | Row outlined, others dim | Bar highlighted | Dot highlighted |
| Click employer | Row stays outlined | Bar stays highlighted | Dot stays selected |
| TopN changed | No change (all rows) | Filters to top/bottom N | No change (all dots) |
| Clear selection | All normal | All normal | All normal |

State priority: hover > selection. No cluster concept — individual employer analysis.

---

## 10. Edge Cases

- Employers with 0 headcount in some months: turnover_rate = 0 for that cell (white in heatmap)
- Very small employers (1-2 people): turnover rate can spike to 100% from a single departure. Scatter plot size encoding helps contextualize this (small dot = low impact)
- 253 × 15 = 3,795 cells in heatmap: well within D3 performance
- Heatmap Y-axis labels: only show top/bottom N to avoid clutter
