# Q2 Design — Resident Financial Health Dashboard

**VAST Challenge 2022 — Mini-challenge Economic (Q2)**

> "How does the financial health of the residents change over the period covered by the dataset?
> How do wages compare to the overall cost of living in Engagement?
> Are there groups that appear to exhibit similar patterns?"

**Date:** 2026-03-12
**Status:** Approved

---

## Design Decisions Summary

| Decision | Choice |
|---|---|
| Panel D aggregation | Median per resident |
| Cluster count | Elbow method (data-driven, likely 3-4) |
| Cluster interaction | Focus+context (bold cluster + dashed full-pop reference) |
| Full-pop reference style | Dashed reference lines |
| Color palette | Warm expenses (oranges/reds), cool income (blue) |
| Tab navigation | Tab bar above ControlBar |
| Q2 ControlBar | Cluster toggle buttons + clear selection |
| Q2 Tooltip | Financial summary + demographics |
| Redux architecture | Separate slices per question, Q1 files unchanged |
| Data loading | Lazy — fetch only when Q2 tab activated |

---

## 1. Data Pipeline (`preprocess_q2.py`)

### Input

- `FinancialJournal.csv` (~1.8M rows) — ALL categories (Wage, Food, Shelter, Recreation, Education)
- `Attributes/Participants.csv` (1,011 rows) — demographics
- Activity Logs + Jobs.csv — reuse Q1 join path for employer linkage

### DuckDB Query — Monthly financial summary per resident

```sql
SELECT
    participantId,
    date_trunc('month', timestamp::TIMESTAMP) AS month,
    SUM(CASE WHEN category = 'Wage' THEN amount ELSE 0 END) AS income,
    SUM(CASE WHEN category = 'Food' THEN ABS(amount) ELSE 0 END) AS food,
    SUM(CASE WHEN category = 'Shelter' THEN ABS(amount) ELSE 0 END) AS shelter,
    SUM(CASE WHEN category = 'Recreation' THEN ABS(amount) ELSE 0 END) AS recreation,
    SUM(CASE WHEN category = 'Education' THEN ABS(amount) ELSE 0 END) AS education
FROM FinancialJournal
GROUP BY participantId, date_trunc('month', timestamp::TIMESTAMP)
```

### Derived attributes (Pandas)

- `total_expenses = food + shelter + recreation + education`
- `net_balance = income - total_expenses`
- Per participant slopes (linear regression over 15 months): `income_slope`, `expense_slope`, `net_balance_slope`

### Clustering (sklearn)

1. Feature matrix: `[avg_income, income_slope, avg_net_balance, net_balance_slope]` per participant
2. StandardScaler normalize
3. Elbow method: k-means for k=2..8, select optimal k
4. Final k-means with optimal k
5. Assign cluster labels

### Output JSON

**`residents_monthly.json`** (~15,165 records):
```json
{
  "participantId": 123,
  "month": "2022-03-01",
  "income": 2500.0,
  "food": 300.0,
  "shelter": 800.0,
  "recreation": 150.0,
  "education": 50.0,
  "total_expenses": 1300.0,
  "net_balance": 1200.0
}
```

**`residents_summary.json`** (1,011 records):
```json
{
  "participantId": 123,
  "avg_income": 2500.0,
  "avg_expenses": 1300.0,
  "avg_net_balance": 1200.0,
  "income_slope": 15.3,
  "expense_slope": 8.1,
  "net_balance_slope": 7.2,
  "cluster": 0,
  "householdSize": 2,
  "haveKids": false,
  "age": 34,
  "educationLevel": "Bachelors",
  "interestGroup": "G"
}
```

**`cluster_meta.json`** (k records):
```json
{
  "cluster": 0,
  "label": "Improving",
  "count": 312,
  "avg_income": 2800.0,
  "avg_net_balance": 1400.0,
  "color": "#e65100"
}
```

---

## 2. Server & API

New endpoint in `app.py`:

```python
@app.route("/api/q2/data")
def get_q2_data():
    with open(os.path.join(DATA_DIR, "residents_monthly.json")) as f:
        monthly = json.load(f)
    with open(os.path.join(DATA_DIR, "residents_summary.json")) as f:
        residents = json.load(f)
    with open(os.path.join(DATA_DIR, "cluster_meta.json")) as f:
        clusters = json.load(f)
    return jsonify({"monthly": monthly, "residents": residents, "clusters": clusters})
```

Existing `/api/data` unchanged.

---

## 3. App Architecture & Navigation

### Tab bar

`TabBar.jsx` — horizontal tabs above ControlBar:
- Q1 — Prosperity des employeurs
- Q2 — Sante financiere des residents
- Q3 — Dynamique de l'emploi (disabled until built)

Active tab stored in `NavigationSlice.js` (`activeTab: "q1" | "q2" | "q3"`).

### App.jsx

Conditional rendering based on active tab:
- `activeTab === "q1"` → `<Q1Dashboard />` (extracted from current App.jsx)
- `activeTab === "q2"` → `<Q2Dashboard />`

### Redux store

```js
configureStore({
  reducer: {
    dataset: datasetReducer,             // Q1 — unchanged
    interaction: interactionReducer,      // Q1 — unchanged
    navigation: navigationReducer,        // NEW
    q2Dataset: q2DatasetReducer,          // NEW
    q2Interaction: q2InteractionReducer   // NEW
  }
});
```

### Q2InteractionSlice

```js
initialState: {
  hoveredResidentId: null,
  hoveredMonth: null,
  selectedResidentIds: [],
  selectedCluster: null
}
```

### New file tree

```
client/src/
  components/
    TabBar.jsx                                          NEW
    Q1Dashboard.jsx                                     NEW (extracted)
    Q2Dashboard.jsx                                     NEW
    q2/
      controlbar/Q2ControlBar.jsx                       NEW
      areachart/AreaChartD3.js                          NEW
      areachart/AreaChartContainer.jsx                  NEW
      boxplot/BoxPlotD3.js                              NEW
      boxplot/BoxPlotContainer.jsx                      NEW
      residentscatter/ResidentScatterD3.js              NEW
      residentscatter/ResidentScatterContainer.jsx      NEW
      tooltip/Q2Tooltip.jsx                             NEW
  store/
    NavigationSlice.js                                  NEW
    Q2DataSlice.js                                      NEW
    Q2InteractionSlice.js                               NEW
```

---

## 4. Panel D — Stacked Area Chart (Income vs Cost of Living)

### Purpose

Shows median resident's income (blue line) overlaid on stacked expense areas (warm palette), over 15 months.

### Dimensions

700 x 400px. Margins: `{ top: 30, right: 30, bottom: 40, left: 80 }`.

### Visual encoding

| Data variable | Munzner type | Channel | Color |
|---|---|---|---|
| Month | Quantitative ordered | Position X | — |
| Shelter expense | Quantitative continuous | Stacked area (bottom) | `#bf360c` (deep orange-brown) |
| Food expense | Quantitative continuous | Stacked area | `#e65100` (orange) |
| Recreation expense | Quantitative continuous | Stacked area | `#ff8f00` (amber) |
| Education expense | Quantitative continuous | Stacked area (top) | `#ffb74d` (light amber) |
| Median income | Quantitative continuous | Line overlay | `#1565c0` (blue), stroke-width 2.5 |

Stacking order bottom-to-top by typical magnitude: Shelter > Food > Recreation > Education.

### D3 details

- `d3.stack()` with keys `['shelter', 'food', 'recreation', 'education']`
- `d3.area()` with `curve(d3.curveMonotoneX)`
- `d3.line()` for income overlay
- Legend: small color swatches in top-right corner
- Y-axis label: "Monthly amount ($)"

### Focus+context

When cluster selected:
- Areas and income line transition to selected cluster's medians
- Two dashed reference lines appear: full-pop median income (dashed blue) and full-pop median total expenses (dashed grey)
- Label: "All residents" in grey

When cluster deselected: reference lines fade out, data transitions back to full population.

### Data computation (in container)

```js
function computeMonthlyMedians(monthly, residents, selectedCluster) {
  const activeIds = selectedCluster !== null
    ? new Set(residents.filter(r => r.cluster === selectedCluster).map(r => r.participantId))
    : null;
  const byMonth = d3.groups(monthly, d => d.month);
  return byMonth.map(([month, records]) => {
    const filtered = activeIds ? records.filter(r => activeIds.has(r.participantId)) : records;
    return {
      month,
      income: d3.median(filtered, d => d.income),
      shelter: d3.median(filtered, d => d.shelter),
      food: d3.median(filtered, d => d.food),
      recreation: d3.median(filtered, d => d.recreation),
      education: d3.median(filtered, d => d.education),
    };
  }).sort((a, b) => new Date(a.month) - new Date(b.month));
}
```

---

## 5. Panel E — Box Plots (Net Balance Distribution)

### Purpose

Shows distribution of net balance (income - expenses) across residents for each month. Reveals spread, inequality, and how many residents fall below zero.

### Dimensions

700 x 350px. Margins: `{ top: 20, right: 30, bottom: 40, left: 80 }`.

### Visual encoding

| Data variable | Munzner type | Channel | Details |
|---|---|---|---|
| Month | Quantitative ordered | Position X | `d3.scaleBand`, 15 bands |
| Q1-Q3 range | Quantitative continuous | Box rect | Fill: `#78909c` (blue-grey), opacity 0.7 |
| Median | Quantitative continuous | Horizontal line in box | Stroke: `#263238`, width 2 |
| Whiskers (1.5xIQR) | Quantitative continuous | Vertical lines + caps | Thin lines |
| Outliers | Quantitative continuous | Small circles | r=2, opacity 0.5 |
| Zero reference | — | Horizontal dashed line | `#d32f2f` (red), dasharray "6,3" |

### Data computation (in container)

```js
function computeBoxStats(monthly, residents, selectedCluster) {
  const activeIds = selectedCluster !== null
    ? new Set(residents.filter(r => r.cluster === selectedCluster).map(r => r.participantId))
    : null;
  const byMonth = d3.groups(monthly, d => d.month);
  return byMonth.map(([month, records]) => {
    const filtered = activeIds ? records.filter(r => activeIds.has(r.participantId)) : records;
    const values = filtered.map(r => r.net_balance).sort(d3.ascending);
    const q1 = d3.quantile(values, 0.25);
    const median = d3.quantile(values, 0.5);
    const q3 = d3.quantile(values, 0.75);
    const iqr = q3 - q1;
    const whiskerLow = Math.max(d3.min(values), q1 - 1.5 * iqr);
    const whiskerHigh = Math.min(d3.max(values), q3 + 1.5 * iqr);
    const outliers = values.filter(v => v < whiskerLow || v > whiskerHigh);
    return { month, q1, median, q3, whiskerLow, whiskerHigh, outliers };
  }).sort((a, b) => new Date(a.month) - new Date(b.month));
}
```

### Focus+context

When cluster selected: boxes show cluster distribution, dashed grey trend line shows full-pop median per month.

### Highlight behavior

When a resident is hovered in Panel F: small colored dots (r=4, cluster color) appear on each month's box plot showing where that resident's net_balance falls. When selected: persistent dots (r=3). This shows individual trajectory against population distribution.

### Box hover

Hovering a box dispatches `setHoveredMonth`. Q2Tooltip shows month stats: median, Q1, Q3, count below zero.

---

## 6. Panel F — Resident Scatter Plot (Clustered)

### Purpose

Positions 1,011 residents in financial trajectory space, colored by cluster. Reveals natural groupings.

### Dimensions

1080 x 400px (full width). Margins: `{ top: 20, right: 30, bottom: 50, left: 60 }`.

### Visual encoding

| Data variable | Munzner type | Channel | Details |
|---|---|---|---|
| Income slope | Quantitative divergent | Position X | Symmetric domain around 0 |
| Net balance slope | Quantitative divergent | Position Y | Symmetric domain around 0 |
| Cluster | Categorical nominal | Hue | Colors from `cluster_meta.json` |
| Average income | Quantitative continuous | Size | `d3.scaleSqrt()`, range [3, 14] |

### Quadrant labels

- Top-right: "Improving"
- Bottom-left: "Declining"
- Top-left: "Cutting costs"
- Bottom-right: "Cost of living rising"

### Interaction

Same controller methods pattern as Q1 scatterplot. Hover, click, brushing & linking.

### Highlighting priority

1. Cluster focus (from ControlBar): in-cluster dots full opacity, others 0.1
2. Individual hover: bold stroke, full opacity, brought to front
3. Individual selection: medium emphasis, persists

---

## 7. Q2 ControlBar & Tooltip

### Q2ControlBar

Title: "VAST 2022 -- Resident Financial Health"

Cluster toggle buttons rendered from `cluster_meta.json`:
- Colored swatch (8x8px) + label + count
- Toggle behavior: click to focus, click again to clear
- Active state: colored border + tint

Clear selection button: appears when `selectedResidentIds.length > 0`.

### Q2Tooltip

Single tooltip component handling two modes:
- **Resident hover** (from Panel F): participantId, cluster label (colored), avg income, avg expenses, net balance trend, age, education, household size
- **Month hover** (from Panel E): month name, median net balance, Q1, Q3, count below zero

---

## 8. Layout

```
+------------------------------------------------------+
|  Tab Bar: [Q1] [Q2*] [Q3]                           |
+------------------------------------------------------+
|  Q2 ControlBar                                       |
+------------------------------------------------------+
|  Panel D — Stacked Area (700 x 400)                 |
|  Median Income vs Cost of Living                     |
+------------------------------------------------------+
|  Panel E — Box Plots (700 x 350)                    |
|  Net Balance Distribution                            |
+------------------------------------------------------+
|  Panel F — Resident Scatter (1080 x 400)            |
|  Resident Financial Trajectories                     |
+------------------------------------------------------+
```

Panels D and E vertically aligned so months line up visually. Panel F at bottom for drill-down. All panels full-width. Same border/radius/padding styling as Q1.

---

## 9. Coordination Summary

| Action | Panel D | Panel E | Panel F |
|---|---|---|---|
| Cluster selected | Transitions to cluster medians + dashed reference | Transitions to cluster distribution + dashed reference | In-cluster dots full opacity, others fade |
| Cluster cleared | Back to full pop | Back to full pop | All dots normal |
| Resident hovered | No change | Highlight dots on boxes | Bold dot, others dim |
| Resident clicked | No change | Persistent highlight dots | Selected dot emphasized |
| Box hovered | No change | Tooltip with month stats | No change |
| Clear selection | No change | Highlights removed | Selections cleared |

State priority: cluster focus > hover > selection (same layering as Q1).

---

## 10. Edge Cases

- Residents with 0 income in some months: handled naturally by median/box computation
- Small clusters: box plots still render, report notes statistical thinness
- Tab switching during load: thunk only fires on `status === "idle"`, no double-fetch
- 1,011 dots in scatter: well within D3 performance limits
- All transitions: 500ms, consistent with Q1
