# Q3 Employment Dynamics — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Q3 dashboard tab answering "What is the health of employers? What employment patterns exist? Where is turnover high or low?" with three coordinated views: turnover heatmap, turnover ranking bar chart, and turnover-vs-size scatter plot.

**Architecture:** Extends the existing tab-based navigation (built in Q2). Q3 gets its own Redux slices (data + interaction) and D3+React components following the established MVC pattern. Data is precomputed via DuckDB/Pandas and served by Flask. The heatmap is the novel component (from Tuto4 Matrix pattern); the bar chart and scatter reuse Q1 patterns closely.

**Tech Stack:** Python (DuckDB, Pandas, NumPy) for preprocessing. React 19 + Redux Toolkit + D3.js 7.9 + Vite for frontend. Flask + CORS for API.

**Design doc:** `docs/plans/2026-03-13-q3-employment-dynamics-design.md`

**Prerequisite:** Q2 implementation must be complete (tab system, multi-question Redux architecture already in place).

---

## Task 1: Preprocessing Pipeline (`preprocess_q3.py`)

**Files:**
- Create: `server/preprocess_q3.py`
- Create: `server/data/turnover_monthly.json` (output)
- Create: `server/data/employers_turnover.json` (output)

**Step 1: Create `server/preprocess_q3.py`**

```python
"""
VAST Challenge 2022 — Q3 Preprocessing: Employment Dynamics & Turnover
Produces server/data/turnover_monthly.json and employers_turnover.json
Run from project root: python server/preprocess_q3.py
"""

import duckdb
import pandas as pd
import numpy as np
import os
import json
import time

# ── Paths ────────────────────────────────────────────────────────────────────
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGS_GLOB = os.path.join(BASE, "VAST-Challenge-2022", "Datasets", "Activity Logs", "*.csv").replace("\\", "/")
JOBS_CSV = os.path.join(BASE, "VAST-Challenge-2022", "Datasets", "Attributes", "Jobs.csv").replace("\\", "/")
DATA_DIR = os.path.join(BASE, "server", "data")
os.makedirs(DATA_DIR, exist_ok=True)

LOGS_READ = f"read_csv_auto('{LOGS_GLOB}', union_by_name=true, nullstr='NA')"

# ── Connect ──────────────────────────────────────────────────────────────────
print("Connecting to DuckDB...")
con = duckdb.connect()

# ── Query 1: Monthly employer assignment per participant ─────────────────────
print("Querying monthly employer assignments (this reads ~17 GB, may take a few minutes)...")
t0 = time.time()
df_assignments = con.execute(f"""
    WITH monthly_job AS (
        SELECT
            participantId,
            date_trunc('month', timestamp::TIMESTAMP) AS month,
            LAST(jobId ORDER BY timestamp::TIMESTAMP) AS jobId
        FROM {LOGS_READ}
        WHERE jobId IS NOT NULL
        GROUP BY participantId, date_trunc('month', timestamp::TIMESTAMP)
    )
    SELECT
        mj.participantId,
        mj.month,
        j.employerId
    FROM monthly_job mj
    JOIN read_csv_auto('{JOBS_CSV}') j ON mj.jobId = j.jobId
    ORDER BY mj.participantId, mj.month
""").fetchdf()
print(f"  Query done in {time.time()-t0:.1f}s — {len(df_assignments)} rows")

df_assignments['month'] = pd.to_datetime(df_assignments['month'])

# ── Query 2: Hourly rates per employer ───────────────────────────────────────
print("Loading hourly rates per employer...")
df_jobs = con.execute(f"""
    SELECT employerId, AVG(hourlyRate) AS avg_hourly_rate
    FROM read_csv_auto('{JOBS_CSV}')
    GROUP BY employerId
""").fetchdf()

# ── Detect arrivals and departures ───────────────────────────────────────────
print("Detecting arrivals and departures...")

# For each participant, get sorted monthly assignments
df_sorted = df_assignments.sort_values(['participantId', 'month']).reset_index(drop=True)

# Shift to compare consecutive months
df_sorted['prev_employer'] = df_sorted.groupby('participantId')['employerId'].shift(1)
df_sorted['prev_month'] = df_sorted.groupby('participantId')['month'].shift(1)

# An arrival at employer X = first time this participant appears at X
# (either their first month overall, or they switched from a different employer)
df_sorted['is_arrival'] = (
    df_sorted['prev_employer'].isna() |  # first month in dataset
    (df_sorted['employerId'] != df_sorted['prev_employer'])  # changed employer
).astype(int)

# A departure from employer X = participant's employer next month is different or they disappear
df_sorted['next_employer'] = df_sorted.groupby('participantId')['employerId'].shift(-1)
df_sorted['next_month'] = df_sorted.groupby('participantId')['month'].shift(-1)

df_sorted['is_departure'] = (
    df_sorted['next_employer'].isna() |  # last month in dataset
    (df_sorted['employerId'] != df_sorted['next_employer'])  # will change employer
).astype(int)

# ── Aggregate per employer per month ─────────────────────────────────────────
print("Aggregating per employer per month...")

monthly_stats = df_sorted.groupby(['employerId', 'month']).agg(
    headcount=('participantId', 'nunique'),
    arrivals=('is_arrival', 'sum'),
    departures=('is_departure', 'sum'),
).reset_index()

# Turnover rate: (arrivals + departures) / (2 * headcount)
monthly_stats['turnover_rate'] = np.where(
    monthly_stats['headcount'] > 0,
    (monthly_stats['arrivals'] + monthly_stats['departures']) / (2 * monthly_stats['headcount']),
    0.0
)

print(f"  {len(monthly_stats)} employer-month records")

# ── Compute tenure per participant-employer stint ────────────────────────────
print("Computing tenure...")

# A stint = consecutive months at the same employer
# We detect stint boundaries using the is_arrival flag
df_sorted['stint_id'] = df_sorted.groupby('participantId')['is_arrival'].cumsum()

tenure_df = df_sorted.groupby(['participantId', 'stint_id', 'employerId']).agg(
    start_month=('month', 'min'),
    end_month=('month', 'max'),
).reset_index()

# Tenure in months (inclusive: if start=march, end=may → 3 months)
tenure_df['tenure_months'] = (
    (tenure_df['end_month'].dt.year - tenure_df['start_month'].dt.year) * 12
    + (tenure_df['end_month'].dt.month - tenure_df['start_month'].dt.month)
    + 1
)

avg_tenure_by_employer = tenure_df.groupby('employerId')['tenure_months'].mean().reset_index()
avg_tenure_by_employer.columns = ['employerId', 'avg_tenure']

# ── Employer summary ─────────────────────────────────────────────────────────
print("Building employer summary...")

employer_summary = monthly_stats.groupby('employerId').agg(
    avg_headcount=('headcount', 'mean'),
    avg_turnover=('turnover_rate', 'mean'),
    total_arrivals=('arrivals', 'sum'),
    total_departures=('departures', 'sum'),
).reset_index()

employer_summary = employer_summary.merge(avg_tenure_by_employer, on='employerId', how='left')
employer_summary = employer_summary.merge(df_jobs, on='employerId', how='left')

# Fill NaN for employers with no tenure data
employer_summary['avg_tenure'] = employer_summary['avg_tenure'].fillna(0)
employer_summary['avg_hourly_rate'] = employer_summary['avg_hourly_rate'].fillna(0)

print(f"  {len(employer_summary)} employers in summary")

# ── Export turnover_monthly.json ─────────────────────────────────────────────
print("Exporting turnover_monthly.json...")
tm_out = monthly_stats.copy()
tm_out['month'] = tm_out['month'].dt.strftime('%Y-%m-%d')
tm_out['employerId'] = tm_out['employerId'].astype(int)
tm_out['headcount'] = tm_out['headcount'].astype(int)
tm_out['arrivals'] = tm_out['arrivals'].astype(int)
tm_out['departures'] = tm_out['departures'].astype(int)
tm_out['turnover_rate'] = tm_out['turnover_rate'].astype(float).round(4)

tm_records = tm_out.to_dict(orient='records')
for rec in tm_records:
    for k, v in rec.items():
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
            rec[k] = None

tm_path = os.path.join(DATA_DIR, "turnover_monthly.json")
with open(tm_path, 'w') as f:
    json.dump(tm_records, f)
print(f"  {tm_path} — {len(tm_records)} records")

# ── Export employers_turnover.json ───────────────────────────────────────────
print("Exporting employers_turnover.json...")
es_out = employer_summary.copy()
es_out['employerId'] = es_out['employerId'].astype(int)
es_out['total_arrivals'] = es_out['total_arrivals'].astype(int)
es_out['total_departures'] = es_out['total_departures'].astype(int)
for col in ['avg_headcount', 'avg_turnover', 'avg_tenure', 'avg_hourly_rate']:
    es_out[col] = es_out[col].astype(float).round(4)

es_records = es_out.to_dict(orient='records')
for rec in es_records:
    for k, v in rec.items():
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
            rec[k] = None

es_path = os.path.join(DATA_DIR, "employers_turnover.json")
with open(es_path, 'w') as f:
    json.dump(es_records, f)
print(f"  {es_path} — {len(es_records)} records")

print("Done.")
con.close()
```

**Step 2: Run the preprocessing**

```bash
cd C:/Users/swae2/Documents/DataViz
python server/preprocess_q3.py
```

Expected: Two JSON files created. Console shows row counts and timing.

**Step 3: Validate output**

```bash
python -c "
import json
with open('server/data/turnover_monthly.json') as f: m = json.load(f)
with open('server/data/employers_turnover.json') as f: e = json.load(f)
print(f'Monthly: {len(m)} records, keys: {list(m[0].keys())}')
print(f'Employers: {len(e)} records, keys: {list(e[0].keys())}')
# Sanity checks
employers = set(r['employerId'] for r in e)
print(f'Unique employers: {len(employers)}')
turnover_vals = [r['avg_turnover'] for r in e]
print(f'Turnover range: {min(turnover_vals):.3f} - {max(turnover_vals):.3f}')
print(f'Top turnover employer: {max(e, key=lambda r: r[\"avg_turnover\"])[\"employerId\"]}')
print(f'Most stable employer: {min(e, key=lambda r: r[\"avg_turnover\"])[\"employerId\"]}')
"
```

**Step 4: Commit**

```bash
git add server/preprocess_q3.py server/data/turnover_monthly.json server/data/employers_turnover.json
git commit -m "feat(q3): add preprocessing pipeline for employment dynamics and turnover

Detects monthly job transitions from Activity Logs, computes arrivals,
departures, turnover rates, and tenure per employer. Exports two JSON files."
```

---

## Task 2: Flask API Endpoint

**Files:**
- Modify: `server/app.py`

**Step 1: Add Q3 endpoint**

Add after the existing `/api/q2/data` route in `server/app.py`:

```python
@app.route("/api/q3/data")
def get_q3_data():
    with open(os.path.join(DATA_DIR, "turnover_monthly.json")) as f:
        monthly = json.load(f)
    with open(os.path.join(DATA_DIR, "employers_turnover.json")) as f:
        employers = json.load(f)
    return jsonify({"monthly": monthly, "employers": employers})
```

**Step 2: Test the endpoint**

```bash
cd C:/Users/swae2/Documents/DataViz
python server/app.py &
sleep 2
curl -s http://localhost:5000/api/q3/data | python -c "import sys,json; d=json.load(sys.stdin); print(f'monthly: {len(d[\"monthly\"])}, employers: {len(d[\"employers\"])}')"
kill %1
```

Expected: `monthly: ~3795, employers: 253`

**Step 3: Commit**

```bash
git add server/app.py
git commit -m "feat(q3): add /api/q3/data Flask endpoint"
```

---

## Task 3: Q3 Redux Slices + Enable Q3 Tab

**Files:**
- Create: `client/src/store/Q3DataSlice.js`
- Create: `client/src/store/Q3InteractionSlice.js`
- Modify: `client/src/store/store.js`
- Modify: `client/src/components/TabBar.jsx`

**Step 1: Create Q3DataSlice.js**

```js
// client/src/store/Q3DataSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export const fetchQ3Data = createAsyncThunk("q3Dataset/fetchQ3Data", async () => {
  const response = await fetch("http://localhost:5000/api/q3/data");
  const data = await response.json();
  return { monthly: data.monthly, employers: data.employers };
});

const q3DataSlice = createSlice({
  name: "q3Dataset",
  initialState: {
    status: "idle",
    error: null,
    monthly: [],
    employers: [],
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchQ3Data.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchQ3Data.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.monthly = action.payload.monthly;
        state.employers = action.payload.employers;
      })
      .addCase(fetchQ3Data.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message;
      });
  },
});

export const selectQ3Monthly = (state) => state.q3Dataset.monthly;
export const selectQ3Employers = (state) => state.q3Dataset.employers;
export const selectQ3DataStatus = (state) => state.q3Dataset.status;

export default q3DataSlice.reducer;
```

**Step 2: Create Q3InteractionSlice.js**

```js
// client/src/store/Q3InteractionSlice.js
import { createSlice } from "@reduxjs/toolkit";

const q3InteractionSlice = createSlice({
  name: "q3Interaction",
  initialState: {
    hoveredEmployerId: null,
    selectedEmployerIds: [],
    topN: 10,
  },
  reducers: {
    setQ3HoveredEmployer(state, action) {
      state.hoveredEmployerId = action.payload;
    },
    toggleQ3SelectedEmployer(state, action) {
      const id = action.payload;
      const index = state.selectedEmployerIds.indexOf(id);
      if (index >= 0) {
        state.selectedEmployerIds.splice(index, 1);
      } else {
        state.selectedEmployerIds.push(id);
      }
    },
    clearQ3Selection(state) {
      state.selectedEmployerIds = [];
    },
    setQ3TopN(state, action) {
      state.topN = action.payload;
    },
  },
});

export const {
  setQ3HoveredEmployer,
  toggleQ3SelectedEmployer,
  clearQ3Selection,
  setQ3TopN,
} = q3InteractionSlice.actions;

export const selectQ3HoveredEmployer = (state) => state.q3Interaction.hoveredEmployerId;
export const selectQ3SelectedEmployers = (state) => state.q3Interaction.selectedEmployerIds;
export const selectQ3TopN = (state) => state.q3Interaction.topN;

export default q3InteractionSlice.reducer;
```

**Step 3: Update store.js**

Add Q3 reducers to `client/src/store/store.js`:

```js
import { configureStore } from "@reduxjs/toolkit";
import datasetReducer from "./DataSetSlice.js";
import interactionReducer from "./InteractionSlice.js";
import navigationReducer from "./NavigationSlice.js";
import q2DatasetReducer from "./Q2DataSlice.js";
import q2InteractionReducer from "./Q2InteractionSlice.js";
import q3DatasetReducer from "./Q3DataSlice.js";
import q3InteractionReducer from "./Q3InteractionSlice.js";

export const store = configureStore({
  reducer: {
    dataset: datasetReducer,
    interaction: interactionReducer,
    navigation: navigationReducer,
    q2Dataset: q2DatasetReducer,
    q2Interaction: q2InteractionReducer,
    q3Dataset: q3DatasetReducer,
    q3Interaction: q3InteractionReducer,
  },
});
```

**Step 4: Enable Q3 tab in TabBar.jsx**

In `client/src/components/TabBar.jsx`, remove `disabled: true` from the Q3 tab:

```jsx
const TABS = [
  { id: "q1", label: "Q1 \u2014 Prosp\u00e9rit\u00e9 des employeurs" },
  { id: "q2", label: "Q2 \u2014 Sant\u00e9 financi\u00e8re des r\u00e9sidents" },
  { id: "q3", label: "Q3 \u2014 Dynamique de l\u2019emploi" },
];
```

**Step 5: Commit**

```bash
git add client/src/store/Q3DataSlice.js client/src/store/Q3InteractionSlice.js client/src/store/store.js client/src/components/TabBar.jsx
git commit -m "feat(q3): add Q3 Redux slices and enable Q3 tab"
```

---

## Task 4: Q3Dashboard Shell + ControlBar + Tooltip

**Files:**
- Create: `client/src/components/Q3Dashboard.jsx`
- Create: `client/src/components/q3/controlbar/Q3ControlBar.jsx`
- Create: `client/src/components/q3/tooltip/Q3Tooltip.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/styles/App.css`

**Step 1: Create Q3ControlBar**

```jsx
// client/src/components/q3/controlbar/Q3ControlBar.jsx
import { useSelector, useDispatch } from "react-redux";
import {
  selectQ3SelectedEmployers,
  selectQ3TopN,
  setQ3TopN,
  clearQ3Selection,
} from "../../../store/Q3InteractionSlice.js";

export default function Q3ControlBar() {
  const dispatch = useDispatch();
  const topN = useSelector(selectQ3TopN);
  const selectedIds = useSelector(selectQ3SelectedEmployers);

  return (
    <div className="controlbar">
      <h1 style={{ fontSize: "16px", margin: 0 }}>
        VAST 2022 -- Employment Dynamics
      </h1>
      <label>
        Show top/bottom:
        <input
          type="number"
          min={1}
          max={50}
          value={topN}
          onChange={(e) => dispatch(setQ3TopN(Number(e.target.value)))}
        />
      </label>
      {selectedIds.length > 0 && (
        <button onClick={() => dispatch(clearQ3Selection())}>
          Clear selection ({selectedIds.length})
        </button>
      )}
    </div>
  );
}
```

**Step 2: Create Q3Tooltip**

```jsx
// client/src/components/q3/tooltip/Q3Tooltip.jsx
import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { selectQ3Employers } from "../../../store/Q3DataSlice.js";
import { selectQ3HoveredEmployer } from "../../../store/Q3InteractionSlice.js";

export default function Q3Tooltip() {
  const hoveredId = useSelector(selectQ3HoveredEmployer);
  const employers = useSelector(selectQ3Employers);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  if (hoveredId === null) return null;

  const emp = employers.find((d) => d.employerId === hoveredId);
  if (!emp) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: mouse.x + 15,
        top: mouse.y - 10,
        pointerEvents: "none",
        background: "white",
        border: "1px solid #ccc",
        borderRadius: "4px",
        padding: "8px 12px",
        fontSize: "13px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        zIndex: 1000,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: "bold" }}>Employer {emp.employerId}</div>
      <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #eee" }} />
      <div>Avg headcount: {emp.avg_headcount.toFixed(1)}</div>
      <div>Avg turnover: {(emp.avg_turnover * 100).toFixed(1)}%</div>
      <div>Total arrivals: {emp.total_arrivals}</div>
      <div>Total departures: {emp.total_departures}</div>
      <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #eee" }} />
      <div>Avg tenure: {emp.avg_tenure.toFixed(1)} months</div>
      <div>Avg hourly rate: ${emp.avg_hourly_rate.toFixed(2)}</div>
    </div>
  );
}
```

**Step 3: Create Q3Dashboard**

```jsx
// client/src/components/Q3Dashboard.jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchQ3Data, selectQ3DataStatus } from "../store/Q3DataSlice.js";
import Q3ControlBar from "./q3/controlbar/Q3ControlBar.jsx";
import Q3Tooltip from "./q3/tooltip/Q3Tooltip.jsx";

export default function Q3Dashboard() {
  const dispatch = useDispatch();
  const status = useSelector(selectQ3DataStatus);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchQ3Data());
    }
  }, [dispatch, status]);

  if (status === "loading") return <p>Loading Q3 data...</p>;
  if (status === "failed") return <p>Failed to load Q3 data.</p>;
  if (status !== "succeeded") return null;

  return (
    <>
      <Q3ControlBar />
      <div className="panels-row">
        <div className="heatmap-panel">
          <h3 className="panel-title">Employer x Month Turnover Rate</h3>
          <p style={{ color: "#999" }}>Panel G — coming next</p>
        </div>
      </div>
      <div className="panels-row">
        <div className="turnoverbar-panel">
          <h3 className="panel-title">Turnover Ranking</h3>
          <p style={{ color: "#999" }}>Panel H — coming next</p>
        </div>
        <div className="turnoverscatter-panel">
          <h3 className="panel-title">Turnover vs Employer Size</h3>
          <p style={{ color: "#999" }}>Panel I — coming next</p>
        </div>
      </div>
      <Q3Tooltip />
    </>
  );
}
```

**Step 4: Add Q3 panel CSS to App.css**

Append to `client/src/styles/App.css`:

```css
/* Q3 panels */
.heatmap-panel {
  width: 100%;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px;
  min-height: 400px;
}

.turnoverbar-panel {
  flex: 1;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px;
  min-height: 400px;
}

.turnoverscatter-panel {
  flex: 2;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px;
  min-height: 400px;
}
```

**Step 5: Wire Q3Dashboard into App.jsx**

Update `client/src/App.jsx` to import and render Q3Dashboard:

```jsx
import { useSelector } from "react-redux";
import { selectActiveTab } from "./store/NavigationSlice.js";
import TabBar from "./components/TabBar.jsx";
import Q1Dashboard from "./components/Q1Dashboard.jsx";
import Q2Dashboard from "./components/Q2Dashboard.jsx";
import Q3Dashboard from "./components/Q3Dashboard.jsx";
import "./styles/App.css";

function App() {
  const activeTab = useSelector(selectActiveTab);

  return (
    <div className="dashboard">
      <TabBar />
      {activeTab === "q1" && <Q1Dashboard />}
      {activeTab === "q2" && <Q2Dashboard />}
      {activeTab === "q3" && <Q3Dashboard />}
    </div>
  );
}

export default App;
```

**Step 6: Verify**

- Q3 tab is now clickable
- Shows ControlBar with title and topN slider
- Three placeholder panels with correct layout (heatmap full width, bar+scatter side by side)
- Data loads from API

**Step 7: Commit**

```bash
git add client/src/components/Q3Dashboard.jsx client/src/components/q3/ client/src/App.jsx client/src/styles/App.css
git commit -m "feat(q3): add Q3Dashboard shell with ControlBar, Tooltip, and panel placeholders"
```

---

## Task 5: Panel G — Turnover Heatmap

**Files:**
- Create: `client/src/components/q3/heatmap/HeatmapD3.js`
- Create: `client/src/components/q3/heatmap/HeatmapContainer.jsx`
- Modify: `client/src/components/Q3Dashboard.jsx`

**Step 1: Create HeatmapD3.js**

```js
// client/src/components/q3/heatmap/HeatmapD3.js
import * as d3 from "d3";

export default class HeatmapD3 {
  constructor(container, controllerMethods) {
    this.container = container;
    this.controllerMethods = controllerMethods;
  }

  create({ width, height }) {
    this.width = width;
    this.height = height;
    this.margins = { top: 20, right: 80, bottom: 40, left: 60 };
    this.innerWidth = width - this.margins.left - this.margins.right;
    this.innerHeight = height - this.margins.top - this.margins.bottom;

    this.svg = d3.select(this.container)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height);

    this.mainG = this.svg.append("g")
      .attr("transform", `translate(${this.margins.left},${this.margins.top})`);

    this.cellsG = this.mainG.append("g").attr("class", "cells");
    this.xAxisG = this.mainG.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${this.innerHeight})`);
    this.yAxisG = this.mainG.append("g")
      .attr("class", "y-axis");
    this.legendG = this.mainG.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${this.innerWidth + 10}, 0)`);
  }

  update(monthly, employers, topN) {
    const { innerWidth, innerHeight } = this;
    const controllerMethods = this.controllerMethods;

    // Sort employers by avg turnover (highest first)
    const sorted = [...employers].sort((a, b) => b.avg_turnover - a.avg_turnover);
    const employerIds = sorted.map((d) => d.employerId);
    const months = [...new Set(monthly.map((d) => d.month))].sort();

    // Determine top/bottom N for Y-axis labels
    this.topIds = new Set(sorted.slice(0, topN).map((d) => d.employerId));
    this.bottomIds = new Set(sorted.slice(-topN).map((d) => d.employerId));

    // Scales
    this.xScale = d3.scaleBand().domain(months).range([0, innerWidth]).padding(0.02);
    this.yScale = d3.scaleBand().domain(employerIds).range([0, innerHeight]).padding(0.02);

    const maxTurnover = d3.max(monthly, (d) => d.turnover_rate) || 1;
    this.colorScale = d3.scaleSequential(d3.interpolateOrRd).domain([0, maxTurnover]);

    const xScale = this.xScale;
    const yScale = this.yScale;
    const colorScale = this.colorScale;

    // Cells
    this.cellsG.selectAll("rect.cell")
      .data(monthly, (d) => `${d.employerId}-${d.month}`)
      .join(
        (enter) => enter.append("rect")
          .attr("class", "cell")
          .attr("x", (d) => xScale(d.month))
          .attr("y", (d) => yScale(d.employerId))
          .attr("width", xScale.bandwidth())
          .attr("height", yScale.bandwidth())
          .attr("fill", (d) => colorScale(d.turnover_rate))
          .attr("opacity", 0.9)
          .on("mouseenter", (event, d) => controllerMethods.handleHover(d.employerId))
          .on("mouseleave", () => controllerMethods.handleUnhover())
          .on("click", (event, d) => controllerMethods.handleClick(d.employerId)),
        (update) => update.transition().duration(500)
          .attr("x", (d) => xScale(d.month))
          .attr("y", (d) => yScale(d.employerId))
          .attr("width", xScale.bandwidth())
          .attr("height", yScale.bandwidth())
          .attr("fill", (d) => colorScale(d.turnover_rate)),
        (exit) => exit.remove()
      );

    // X axis
    this.xAxisG.call(
      d3.axisBottom(xScale).tickFormat((m) => d3.timeFormat("%b %y")(new Date(m)))
    ).selectAll("text").attr("font-size", "9px");

    // Y axis — only show labels for top/bottom N employers
    const topIds = this.topIds;
    const bottomIds = this.bottomIds;
    const labeledIds = employerIds.filter((id) => topIds.has(id) || bottomIds.has(id));

    this.yAxisG.call(
      d3.axisLeft(yScale)
        .tickValues(labeledIds)
        .tickFormat((id) => `E${id}`)
    ).selectAll("text").attr("font-size", "8px");

    // Color legend
    this.legendG.selectAll("*").remove();
    const legendHeight = Math.min(innerHeight, 200);
    const legendWidth = 12;

    // Gradient
    const defs = this.svg.selectAll("defs").data([0]).join("defs");
    const gradientId = "turnover-gradient";
    const gradient = defs.selectAll(`#${gradientId}`).data([0]).join("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0%").attr("y1", "100%")
      .attr("x2", "0%").attr("y2", "0%");

    gradient.selectAll("stop").data([
      { offset: "0%", color: colorScale(0) },
      { offset: "50%", color: colorScale(maxTurnover / 2) },
      { offset: "100%", color: colorScale(maxTurnover) },
    ]).join("stop")
      .attr("offset", (d) => d.offset)
      .attr("stop-color", (d) => d.color);

    this.legendG.append("rect")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("fill", `url(#${gradientId})`);

    const legendScale = d3.scaleLinear().domain([0, maxTurnover]).range([legendHeight, 0]);
    this.legendG.append("g")
      .attr("transform", `translate(${legendWidth}, 0)`)
      .call(d3.axisRight(legendScale).ticks(5).tickFormat(d3.format(".0%")))
      .selectAll("text").attr("font-size", "9px");

    this.legendG.append("text")
      .attr("x", legendWidth / 2)
      .attr("y", -8)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .text("Turnover");
  }

  updateHighlighting(hoveredId, selectedIds) {
    const cells = this.cellsG.selectAll("rect.cell");
    const hasHover = hoveredId !== null;
    const hasSelection = selectedIds.length > 0;

    if (!hasHover && !hasSelection) {
      cells.attr("opacity", 0.9).attr("stroke", "none");
      return;
    }

    cells.each(function (d) {
      const el = d3.select(this);
      const isHovered = d.employerId === hoveredId;
      const isSelected = selectedIds.includes(d.employerId);

      if (isHovered) {
        el.attr("opacity", 1).attr("stroke", "#000").attr("stroke-width", 1.5);
        this.parentNode.appendChild(this);
      } else if (isSelected) {
        el.attr("opacity", 1).attr("stroke", "#000").attr("stroke-width", 1);
      } else {
        el.attr("opacity", hasHover ? 0.3 : 0.5).attr("stroke", "none");
      }
    });
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
```

**Step 2: Create HeatmapContainer.jsx**

```jsx
// client/src/components/q3/heatmap/HeatmapContainer.jsx
import { useRef, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectQ3Monthly, selectQ3Employers } from "../../../store/Q3DataSlice.js";
import {
  selectQ3HoveredEmployer,
  selectQ3SelectedEmployers,
  selectQ3TopN,
  setQ3HoveredEmployer,
  toggleQ3SelectedEmployer,
} from "../../../store/Q3InteractionSlice.js";
import HeatmapD3 from "./HeatmapD3.js";

export default function HeatmapContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);
  const dispatch = useDispatch();

  const monthly = useSelector(selectQ3Monthly);
  const employers = useSelector(selectQ3Employers);
  const hoveredId = useSelector(selectQ3HoveredEmployer);
  const selectedIds = useSelector(selectQ3SelectedEmployers);
  const topN = useSelector(selectQ3TopN);

  const controllerMethods = useMemo(
    () => ({
      handleHover: (id) => dispatch(setQ3HoveredEmployer(id)),
      handleUnhover: () => dispatch(setQ3HoveredEmployer(null)),
      handleClick: (id) => dispatch(toggleQ3SelectedEmployer(id)),
    }),
    [dispatch]
  );

  useEffect(() => {
    const instance = new HeatmapD3(ref.current, controllerMethods);
    instance.create({ width: 1080, height: 400 });
    d3Ref.current = instance;
    return () => instance.clear();
  }, [controllerMethods]);

  useEffect(() => {
    if (d3Ref.current && monthly.length > 0) {
      d3Ref.current.update(monthly, employers, topN);
    }
  }, [monthly, employers, topN]);

  useEffect(() => {
    if (d3Ref.current) {
      d3Ref.current.updateHighlighting(hoveredId, selectedIds);
    }
  }, [hoveredId, selectedIds]);

  return <div ref={ref} className="heatmap-panel"><h3 className="panel-title">Employer x Month Turnover Rate</h3></div>;
}
```

**Step 3: Wire into Q3Dashboard**

Replace Panel G placeholder in `Q3Dashboard.jsx`:

```jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchQ3Data, selectQ3DataStatus } from "../store/Q3DataSlice.js";
import Q3ControlBar from "./q3/controlbar/Q3ControlBar.jsx";
import HeatmapContainer from "./q3/heatmap/HeatmapContainer.jsx";
import Q3Tooltip from "./q3/tooltip/Q3Tooltip.jsx";

export default function Q3Dashboard() {
  const dispatch = useDispatch();
  const status = useSelector(selectQ3DataStatus);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchQ3Data());
    }
  }, [dispatch, status]);

  if (status === "loading") return <p>Loading Q3 data...</p>;
  if (status === "failed") return <p>Failed to load Q3 data.</p>;
  if (status !== "succeeded") return null;

  return (
    <>
      <Q3ControlBar />
      <div className="panels-row">
        <HeatmapContainer />
      </div>
      <div className="panels-row">
        <div className="turnoverbar-panel">
          <h3 className="panel-title">Turnover Ranking</h3>
          <p style={{ color: "#999" }}>Panel H — coming next</p>
        </div>
        <div className="turnoverscatter-panel">
          <h3 className="panel-title">Turnover vs Employer Size</h3>
          <p style={{ color: "#999" }}>Panel I — coming next</p>
        </div>
      </div>
      <Q3Tooltip />
    </>
  );
}
```

**Step 4: Verify**

- Heatmap renders 253 rows × 15 columns of colored cells
- Color gradient from white (low turnover) to red (high turnover)
- Rows sorted by average turnover (reddest rows at top)
- Y-axis shows labels for top/bottom N employers only
- Color legend in right margin
- Hover a cell: entire row highlights, tooltip shows employer info
- Click: selection persists

**Step 5: Commit**

```bash
git add client/src/components/q3/heatmap/ client/src/components/Q3Dashboard.jsx
git commit -m "feat(q3): implement Panel G — turnover heatmap (employer x month matrix)"
```

---

## Task 6: Panel H — Turnover Ranking Bar Chart

**Files:**
- Create: `client/src/components/q3/turnoverbar/TurnoverBarD3.js`
- Create: `client/src/components/q3/turnoverbar/TurnoverBarContainer.jsx`
- Modify: `client/src/components/Q3Dashboard.jsx`

**Step 1: Create TurnoverBarD3.js**

```js
// client/src/components/q3/turnoverbar/TurnoverBarD3.js
import * as d3 from "d3";

export default class TurnoverBarD3 {
  constructor(container, controllerMethods) {
    this.container = container;
    this.controllerMethods = controllerMethods;
  }

  create({ width, height }) {
    this.width = width;
    this.height = height;
    this.margins = { top: 20, right: 20, bottom: 40, left: 70 };
    this.innerWidth = width - this.margins.left - this.margins.right;
    this.innerHeight = height - this.margins.top - this.margins.bottom;

    this.svg = d3.select(this.container)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height);

    this.mainG = this.svg.append("g")
      .attr("transform", `translate(${this.margins.left},${this.margins.top})`);

    this.barsG = this.mainG.append("g").attr("class", "bars");
    this.refLineG = this.mainG.append("g").attr("class", "ref-line");
    this.xAxisG = this.mainG.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${this.innerHeight})`);
    this.yAxisG = this.mainG.append("g")
      .attr("class", "y-axis");

    // X axis label
    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", this.innerWidth / 2)
      .attr("y", this.innerHeight + 35)
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .text("Avg turnover rate");
  }

  update(employers, topN) {
    const { innerWidth, innerHeight } = this;
    const controllerMethods = this.controllerMethods;

    // Sort by turnover, take top N + bottom N
    const sorted = [...employers].sort((a, b) => b.avg_turnover - a.avg_turnover);
    this.topIds = new Set(sorted.slice(0, topN).map((d) => d.employerId));
    this.bottomIds = new Set(sorted.slice(-topN).map((d) => d.employerId));

    const displayed = [
      ...sorted.slice(0, topN),
      ...sorted.slice(-topN),
    ];
    // Remove duplicates if topN * 2 > total
    const seen = new Set();
    const unique = displayed.filter((d) => {
      if (seen.has(d.employerId)) return false;
      seen.add(d.employerId);
      return true;
    });

    // Scales
    this.xScale = d3.scaleLinear()
      .domain([0, d3.max(unique, (d) => d.avg_turnover)])
      .range([0, innerWidth])
      .nice();

    this.yScale = d3.scaleBand()
      .domain(unique.map((d) => d.employerId))
      .range([0, innerHeight])
      .padding(0.15);

    const xScale = this.xScale;
    const yScale = this.yScale;
    const topIds = this.topIds;

    // Median reference line
    const medianTurnover = d3.median(employers, (d) => d.avg_turnover);
    this.refLineG.selectAll("*").remove();
    this.refLineG.append("line")
      .attr("x1", xScale(medianTurnover)).attr("x2", xScale(medianTurnover))
      .attr("y1", 0).attr("y2", innerHeight)
      .attr("stroke", "#999").attr("stroke-dasharray", "4,4").attr("stroke-width", 1);

    // Bars
    this.barsG.selectAll("rect")
      .data(unique, (d) => d.employerId)
      .join(
        (enter) => enter.append("rect")
          .attr("x", 0)
          .attr("y", (d) => yScale(d.employerId))
          .attr("width", 0)
          .attr("height", yScale.bandwidth())
          .attr("fill", (d) => topIds.has(d.employerId) ? "#d62728" : "#2ca02c")
          .attr("opacity", 0.8)
          .call((sel) => sel.transition().duration(500)
            .attr("width", (d) => xScale(d.avg_turnover)))
          .on("mouseenter", (event, d) => controllerMethods.handleHover(d.employerId))
          .on("mouseleave", () => controllerMethods.handleUnhover())
          .on("click", (event, d) => controllerMethods.handleClick(d.employerId)),
        (update) => update.transition().duration(500)
          .attr("y", (d) => yScale(d.employerId))
          .attr("width", (d) => xScale(d.avg_turnover))
          .attr("height", yScale.bandwidth())
          .attr("fill", (d) => topIds.has(d.employerId) ? "#d62728" : "#2ca02c"),
        (exit) => exit.transition().duration(300).attr("width", 0).remove()
      );

    // Axes
    this.xAxisG.transition().duration(500).call(
      d3.axisBottom(xScale).ticks(5).tickFormat(d3.format(".0%"))
    );
    this.yAxisG.transition().duration(500).call(
      d3.axisLeft(yScale).tickFormat((id) => `E${id}`)
    ).selectAll("text").attr("font-size", "9px");
  }

  updateHighlighting(hoveredId, selectedIds) {
    const bars = this.barsG.selectAll("rect");
    const hasHover = hoveredId !== null;
    const hasSelection = selectedIds.length > 0;

    if (!hasHover && !hasSelection) {
      bars.attr("opacity", 0.8).attr("stroke", "none");
      return;
    }

    const topIds = this.topIds;

    bars.each(function (d) {
      const el = d3.select(this);
      const isHovered = d.employerId === hoveredId;
      const isSelected = selectedIds.includes(d.employerId);

      if (isHovered) {
        el.attr("opacity", 1).attr("stroke", "#000").attr("stroke-width", 2);
        this.parentNode.appendChild(this);
      } else if (isSelected) {
        el.attr("opacity", 0.9).attr("stroke", "#000").attr("stroke-width", 1);
      } else {
        el.attr("opacity", 0.2).attr("stroke", "none");
      }
    });
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
```

**Step 2: Create TurnoverBarContainer.jsx**

```jsx
// client/src/components/q3/turnoverbar/TurnoverBarContainer.jsx
import { useRef, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectQ3Employers } from "../../../store/Q3DataSlice.js";
import {
  selectQ3HoveredEmployer,
  selectQ3SelectedEmployers,
  selectQ3TopN,
  setQ3HoveredEmployer,
  toggleQ3SelectedEmployer,
} from "../../../store/Q3InteractionSlice.js";
import TurnoverBarD3 from "./TurnoverBarD3.js";

export default function TurnoverBarContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);
  const dispatch = useDispatch();

  const employers = useSelector(selectQ3Employers);
  const hoveredId = useSelector(selectQ3HoveredEmployer);
  const selectedIds = useSelector(selectQ3SelectedEmployers);
  const topN = useSelector(selectQ3TopN);

  const controllerMethods = useMemo(
    () => ({
      handleHover: (id) => dispatch(setQ3HoveredEmployer(id)),
      handleUnhover: () => dispatch(setQ3HoveredEmployer(null)),
      handleClick: (id) => dispatch(toggleQ3SelectedEmployer(id)),
    }),
    [dispatch]
  );

  useEffect(() => {
    const instance = new TurnoverBarD3(ref.current, controllerMethods);
    instance.create({ width: 350, height: 400 });
    d3Ref.current = instance;
    return () => instance.clear();
  }, [controllerMethods]);

  useEffect(() => {
    if (d3Ref.current && employers.length > 0) {
      d3Ref.current.update(employers, topN);
    }
  }, [employers, topN]);

  useEffect(() => {
    if (d3Ref.current) {
      d3Ref.current.updateHighlighting(hoveredId, selectedIds);
    }
  }, [hoveredId, selectedIds]);

  return <div ref={ref} className="turnoverbar-panel"><h3 className="panel-title">Turnover Ranking</h3></div>;
}
```

**Step 3: Wire into Q3Dashboard**

Replace Panel H placeholder:

```jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchQ3Data, selectQ3DataStatus } from "../store/Q3DataSlice.js";
import Q3ControlBar from "./q3/controlbar/Q3ControlBar.jsx";
import HeatmapContainer from "./q3/heatmap/HeatmapContainer.jsx";
import TurnoverBarContainer from "./q3/turnoverbar/TurnoverBarContainer.jsx";
import Q3Tooltip from "./q3/tooltip/Q3Tooltip.jsx";

export default function Q3Dashboard() {
  const dispatch = useDispatch();
  const status = useSelector(selectQ3DataStatus);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchQ3Data());
    }
  }, [dispatch, status]);

  if (status === "loading") return <p>Loading Q3 data...</p>;
  if (status === "failed") return <p>Failed to load Q3 data.</p>;
  if (status !== "succeeded") return null;

  return (
    <>
      <Q3ControlBar />
      <div className="panels-row">
        <HeatmapContainer />
      </div>
      <div className="panels-row">
        <TurnoverBarContainer />
        <div className="turnoverscatter-panel">
          <h3 className="panel-title">Turnover vs Employer Size</h3>
          <p style={{ color: "#999" }}>Panel I — coming next</p>
        </div>
      </div>
      <Q3Tooltip />
    </>
  );
}
```

**Step 4: Verify**

- Bar chart shows top 10 (red) + bottom 10 (green) employers by turnover
- Bars sorted by turnover, highest at top
- Median reference line visible
- Hover: bar highlights, heatmap row highlights, tooltip shows
- TopN slider: bar chart updates

**Step 5: Commit**

```bash
git add client/src/components/q3/turnoverbar/ client/src/components/Q3Dashboard.jsx
git commit -m "feat(q3): implement Panel H — turnover ranking bar chart"
```

---

## Task 7: Panel I — Turnover vs Size Scatter

**Files:**
- Create: `client/src/components/q3/turnoverscatter/TurnoverScatterD3.js`
- Create: `client/src/components/q3/turnoverscatter/TurnoverScatterContainer.jsx`
- Modify: `client/src/components/Q3Dashboard.jsx`

**Step 1: Create TurnoverScatterD3.js**

```js
// client/src/components/q3/turnoverscatter/TurnoverScatterD3.js
import * as d3 from "d3";

export default class TurnoverScatterD3 {
  constructor(container, controllerMethods) {
    this.container = container;
    this.controllerMethods = controllerMethods;
  }

  create({ width, height }) {
    this.width = width;
    this.height = height;
    this.margins = { top: 20, right: 30, bottom: 50, left: 60 };
    this.innerWidth = width - this.margins.left - this.margins.right;
    this.innerHeight = height - this.margins.top - this.margins.bottom;

    this.svg = d3.select(this.container)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height);

    this.mainG = this.svg.append("g")
      .attr("transform", `translate(${this.margins.left},${this.margins.top})`);

    this.dotsG = this.mainG.append("g").attr("class", "dots");
    this.xAxisG = this.mainG.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${this.innerHeight})`);
    this.yAxisG = this.mainG.append("g")
      .attr("class", "y-axis");

    // Axis labels
    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", this.innerWidth / 2)
      .attr("y", this.innerHeight + 40)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .text("Average headcount");

    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", -this.innerHeight / 2)
      .attr("y", -45)
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("font-size", "12px")
      .text("Average turnover rate");
  }

  update(employers) {
    const { innerWidth, innerHeight } = this;
    const controllerMethods = this.controllerMethods;

    // Scales
    this.xScale = d3.scaleLinear()
      .domain([0, d3.max(employers, (d) => d.avg_headcount)])
      .range([0, innerWidth])
      .nice();

    this.yScale = d3.scaleLinear()
      .domain([0, d3.max(employers, (d) => d.avg_turnover)])
      .range([innerHeight, 0])
      .nice();

    this.sizeScale = d3.scaleSqrt()
      .domain(d3.extent(employers, (d) => d.total_departures))
      .range([3, 18]);

    this.colorScale = d3.scaleSequential(d3.interpolateRdYlGn)
      .domain(d3.extent(employers, (d) => d.avg_hourly_rate));

    const xScale = this.xScale;
    const yScale = this.yScale;
    const sizeScale = this.sizeScale;
    const colorScale = this.colorScale;

    // Dots
    this.dotsG.selectAll("circle")
      .data(employers, (d) => d.employerId)
      .join(
        (enter) => enter.append("circle")
          .attr("cx", (d) => xScale(d.avg_headcount))
          .attr("cy", (d) => yScale(d.avg_turnover))
          .attr("r", 0)
          .attr("fill", (d) => colorScale(d.avg_hourly_rate))
          .attr("stroke", "#333")
          .attr("stroke-width", 0.5)
          .attr("opacity", 0.8)
          .call((sel) => sel.transition().duration(500)
            .attr("r", (d) => sizeScale(d.total_departures)))
          .on("mouseenter", (event, d) => controllerMethods.handleHover(d.employerId))
          .on("mouseleave", () => controllerMethods.handleUnhover())
          .on("click", (event, d) => controllerMethods.handleClick(d.employerId)),
        (update) => update.transition().duration(500)
          .attr("cx", (d) => xScale(d.avg_headcount))
          .attr("cy", (d) => yScale(d.avg_turnover))
          .attr("r", (d) => sizeScale(d.total_departures)),
        (exit) => exit.transition().duration(300).attr("r", 0).remove()
      );

    // Axes
    this.xAxisG.transition().duration(500).call(d3.axisBottom(xScale));
    this.yAxisG.transition().duration(500).call(
      d3.axisLeft(yScale).tickFormat(d3.format(".0%"))
    );
  }

  updateHighlighting(hoveredId, selectedIds) {
    const circles = this.dotsG.selectAll("circle");
    const hasHover = hoveredId !== null;
    const hasSelection = selectedIds.length > 0;

    if (!hasHover && !hasSelection) {
      circles.attr("opacity", 0.8).attr("stroke-width", 0.5).attr("stroke", "#333");
      return;
    }

    circles.each(function (d) {
      const el = d3.select(this);
      const isHovered = d.employerId === hoveredId;
      const isSelected = selectedIds.includes(d.employerId);

      if (isHovered) {
        el.attr("opacity", 1).attr("stroke-width", 2.5).attr("stroke", "#000");
        this.parentNode.appendChild(this);
      } else if (isSelected) {
        el.attr("opacity", 0.9).attr("stroke-width", 2).attr("stroke", "#000");
      } else if (hasHover) {
        el.attr("opacity", 0.2).attr("stroke-width", 0.5).attr("stroke", "#333");
      } else {
        el.attr("opacity", 0.8).attr("stroke-width", 0.5).attr("stroke", "#333");
      }
    });
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
```

**Step 2: Create TurnoverScatterContainer.jsx**

```jsx
// client/src/components/q3/turnoverscatter/TurnoverScatterContainer.jsx
import { useRef, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectQ3Employers } from "../../../store/Q3DataSlice.js";
import {
  selectQ3HoveredEmployer,
  selectQ3SelectedEmployers,
  setQ3HoveredEmployer,
  toggleQ3SelectedEmployer,
} from "../../../store/Q3InteractionSlice.js";
import TurnoverScatterD3 from "./TurnoverScatterD3.js";

export default function TurnoverScatterContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);
  const dispatch = useDispatch();

  const employers = useSelector(selectQ3Employers);
  const hoveredId = useSelector(selectQ3HoveredEmployer);
  const selectedIds = useSelector(selectQ3SelectedEmployers);

  const controllerMethods = useMemo(
    () => ({
      handleHover: (id) => dispatch(setQ3HoveredEmployer(id)),
      handleUnhover: () => dispatch(setQ3HoveredEmployer(null)),
      handleClick: (id) => dispatch(toggleQ3SelectedEmployer(id)),
    }),
    [dispatch]
  );

  useEffect(() => {
    const instance = new TurnoverScatterD3(ref.current, controllerMethods);
    instance.create({ width: 700, height: 400 });
    d3Ref.current = instance;
    return () => instance.clear();
  }, [controllerMethods]);

  useEffect(() => {
    if (d3Ref.current && employers.length > 0) {
      d3Ref.current.update(employers);
    }
  }, [employers]);

  useEffect(() => {
    if (d3Ref.current) {
      d3Ref.current.updateHighlighting(hoveredId, selectedIds);
    }
  }, [hoveredId, selectedIds]);

  return <div ref={ref} className="turnoverscatter-panel"><h3 className="panel-title">Turnover vs Employer Size</h3></div>;
}
```

**Step 3: Final Q3Dashboard.jsx**

```jsx
// client/src/components/Q3Dashboard.jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchQ3Data, selectQ3DataStatus } from "../store/Q3DataSlice.js";
import Q3ControlBar from "./q3/controlbar/Q3ControlBar.jsx";
import HeatmapContainer from "./q3/heatmap/HeatmapContainer.jsx";
import TurnoverBarContainer from "./q3/turnoverbar/TurnoverBarContainer.jsx";
import TurnoverScatterContainer from "./q3/turnoverscatter/TurnoverScatterContainer.jsx";
import Q3Tooltip from "./q3/tooltip/Q3Tooltip.jsx";

export default function Q3Dashboard() {
  const dispatch = useDispatch();
  const status = useSelector(selectQ3DataStatus);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchQ3Data());
    }
  }, [dispatch, status]);

  if (status === "loading") return <p>Loading Q3 data...</p>;
  if (status === "failed") return <p>Failed to load Q3 data.</p>;
  if (status !== "succeeded") return null;

  return (
    <>
      <Q3ControlBar />
      <div className="panels-row">
        <HeatmapContainer />
      </div>
      <div className="panels-row">
        <TurnoverBarContainer />
        <TurnoverScatterContainer />
      </div>
      <Q3Tooltip />
    </>
  );
}
```

**Step 4: Verify**

- Scatter renders 253 dots
- X = employer size, Y = turnover rate
- Color: red (low pay) → green (high pay)
- Size: proportional to total departures
- Hover: dot highlights, heatmap row highlights, bar chart bar highlights
- All three panels coordinated via brushing & linking

**Step 5: Commit**

```bash
git add client/src/components/q3/turnoverscatter/ client/src/components/Q3Dashboard.jsx
git commit -m "feat(q3): implement Panel I — turnover vs size scatter plot"
```

---

## Task 8: Final Integration & Polish

**Files:**
- Possibly minor tweaks to any Q3 files

**Step 1: End-to-end test**

Start both servers. Walk through the full Q3 user flow:

1. Click Q3 tab → data loads, all 3 panels render
2. Panel G: heatmap shows 253 × 15 colored matrix, reddest rows at top
3. Panel H: top 10 (red) + bottom 10 (green) bars ranked by turnover
4. Panel I: 253 dots, color = hourly rate, size = departures
5. Hover employer in any panel → all 3 panels highlight that employer
6. Click → selection persists across all panels
7. Change topN slider → bar chart updates, heatmap Y-axis labels update
8. Clear selection → all panels reset
9. Switch to Q1 tab → Q1 works
10. Switch to Q2 tab → Q2 works
11. Switch back to Q3 → data cached, no re-fetch

**Step 2: Verify cross-tab independence**

- Hovering in Q3 does NOT affect Q1 or Q2 state (separate interaction slices)
- Each tab's data loads independently and only on first activation

**Step 3: Fix any visual/interaction issues**

Common things to check:
- Heatmap cells render without gaps (correct padding)
- Bar chart labels don't overflow
- Scatter tooltip doesn't go off-screen
- Color legend readable
- Transitions smooth

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(q3): complete Q3 employment dynamics dashboard

Three coordinated views:
- Panel G: turnover heatmap (employer x month matrix)
- Panel H: turnover ranking bar chart (top/bottom N)
- Panel I: turnover vs employer size scatter plot

Brushing & linking across all three panels.
All three challenge questions (Q1, Q2, Q3) now fully implemented."
```

---

## Summary of all tasks

| Task | What | Key files |
|---|---|---|
| 1 | Preprocessing pipeline | `server/preprocess_q3.py`, 2 JSON outputs |
| 2 | Flask API endpoint | `server/app.py` |
| 3 | Q3 Redux slices + enable tab | `Q3DataSlice.js`, `Q3InteractionSlice.js`, `store.js`, `TabBar.jsx` |
| 4 | Q3Dashboard shell + ControlBar + Tooltip | `Q3Dashboard.jsx`, `Q3ControlBar.jsx`, `Q3Tooltip.jsx`, `App.jsx`, CSS |
| 5 | Panel G — Turnover heatmap | `HeatmapD3.js`, `HeatmapContainer.jsx` |
| 6 | Panel H — Turnover ranking bar chart | `TurnoverBarD3.js`, `TurnoverBarContainer.jsx` |
| 7 | Panel I — Turnover vs size scatter | `TurnoverScatterD3.js`, `TurnoverScatterContainer.jsx` |
| 8 | Final integration & polish | All files, end-to-end testing |
