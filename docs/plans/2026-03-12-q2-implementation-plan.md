# Q2 Resident Financial Health — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Q2 dashboard tab answering "How does the financial health of residents change? Wages vs cost of living? Similar pattern groups?" with three coordinated views: stacked area chart, box plots, and clustered resident scatter.

**Architecture:** Tab-based navigation switching between Q1/Q2/Q3 dashboards. Each question has its own Redux slices (data + interaction) and D3+React components following the existing MVC pattern. Data is precomputed via DuckDB/Pandas/sklearn and served by Flask.

**Tech Stack:** Python (DuckDB, Pandas, NumPy, sklearn) for preprocessing. React 19 + Redux Toolkit + D3.js 7.9 + Vite for frontend. Flask + CORS for API.

**Design doc:** `docs/plans/2026-03-12-q2-resident-financial-health-design.md`

---

## Task 1: Preprocessing Pipeline (`preprocess_q2.py`)

**Files:**
- Create: `server/preprocess_q2.py`
- Create: `server/data/residents_monthly.json` (output)
- Create: `server/data/residents_summary.json` (output)
- Create: `server/data/cluster_meta.json` (output)
- Modify: `server/requirements.txt` (add scikit-learn)

**Step 1: Add sklearn to requirements**

In `server/requirements.txt`, add `scikit-learn` at the end:

```
duckdb
pandas
numpy
flask
flask-cors
scikit-learn
```

**Step 2: Create `server/preprocess_q2.py`**

```python
"""
VAST Challenge 2022 — Q2 Preprocessing: Resident Financial Health
Produces server/data/residents_monthly.json, residents_summary.json, cluster_meta.json
Run from project root: python server/preprocess_q2.py
"""

import duckdb
import pandas as pd
import numpy as np
import os
import json
import time
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

# ── Paths ────────────────────────────────────────────────────────────────────
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIN_CSV = os.path.join(BASE, "VAST-Challenge-2022", "Datasets", "Journals", "FinancialJournal.csv").replace("\\", "/")
PARTICIPANTS_CSV = os.path.join(BASE, "VAST-Challenge-2022", "Datasets", "Attributes", "Participants.csv").replace("\\", "/")
DATA_DIR = os.path.join(BASE, "server", "data")
os.makedirs(DATA_DIR, exist_ok=True)

# ── Connect ──────────────────────────────────────────────────────────────────
print("Connecting to DuckDB...")
con = duckdb.connect()

# ── Query 1: Monthly financial summary per resident ──────────────────────────
print("Querying monthly financial summary per resident...")
t0 = time.time()
df_monthly = con.execute(f"""
    SELECT
        participantId,
        date_trunc('month', timestamp::TIMESTAMP) AS month,
        SUM(CASE WHEN category = 'Wage' THEN amount ELSE 0 END) AS income,
        SUM(CASE WHEN category = 'Food' THEN ABS(amount) ELSE 0 END) AS food,
        SUM(CASE WHEN category = 'Shelter' THEN ABS(amount) ELSE 0 END) AS shelter,
        SUM(CASE WHEN category = 'RentAdjustment' THEN amount ELSE 0 END) AS rent_adjustment,
        SUM(CASE WHEN category = 'Recreation' THEN ABS(amount) ELSE 0 END) AS recreation,
        SUM(CASE WHEN category = 'Education' THEN ABS(amount) ELSE 0 END) AS education
    FROM read_csv_auto('{FIN_CSV}')
    GROUP BY participantId, date_trunc('month', timestamp::TIMESTAMP)
    ORDER BY participantId, month
""").fetchdf()
print(f"  Query done in {time.time()-t0:.1f}s — {len(df_monthly)} rows")

# ── Derive: fold RentAdjustment into shelter, compute totals ─────────────────
df_monthly['shelter'] = (df_monthly['shelter'] - df_monthly['rent_adjustment']).clip(lower=0)
df_monthly.drop(columns=['rent_adjustment'], inplace=True)
df_monthly['total_expenses'] = df_monthly['food'] + df_monthly['shelter'] + df_monthly['recreation'] + df_monthly['education']
df_monthly['net_balance'] = df_monthly['income'] - df_monthly['total_expenses']
df_monthly['month'] = pd.to_datetime(df_monthly['month'])

print(f"  {df_monthly['participantId'].nunique()} unique participants, {df_monthly['month'].nunique()} months")

# ── Query 2: Participant demographics ────────────────────────────────────────
print("Loading participant demographics...")
df_participants = con.execute(f"""
    SELECT participantId, householdSize, haveKids, age, educationLevel, interestGroup, joviality
    FROM read_csv_auto('{PARTICIPANTS_CSV}')
""").fetchdf()
print(f"  {len(df_participants)} participants loaded")

# ── Slope computation (reuse Q1 pattern) ─────────────────────────────────────
print("Computing per-participant slopes...")

def compute_slope(group, value_col):
    vals = group[value_col].values.astype(float)
    if len(vals) < 3:
        return 0.0
    x = np.arange(len(vals), dtype=float)
    xm, ym = x.mean(), vals.mean()
    denom = ((x - xm) ** 2).sum()
    if denom == 0:
        return 0.0
    return float(((x - xm) * (vals - ym)).sum() / denom)

sorted_monthly = df_monthly.sort_values('month')

income_slopes = sorted_monthly.groupby('participantId').apply(
    lambda g: compute_slope(g, 'income'), include_groups=False
).reset_index()
income_slopes.columns = ['participantId', 'income_slope']

expense_slopes = sorted_monthly.groupby('participantId').apply(
    lambda g: compute_slope(g, 'total_expenses'), include_groups=False
).reset_index()
expense_slopes.columns = ['participantId', 'expense_slope']

balance_slopes = sorted_monthly.groupby('participantId').apply(
    lambda g: compute_slope(g, 'net_balance'), include_groups=False
).reset_index()
balance_slopes.columns = ['participantId', 'net_balance_slope']

# ── Build participant summary ────────────────────────────────────────────────
print("Building participant summary...")
summary = df_monthly.groupby('participantId').agg(
    avg_income=('income', 'mean'),
    avg_expenses=('total_expenses', 'mean'),
    avg_net_balance=('net_balance', 'mean'),
).reset_index()

summary = summary.merge(income_slopes, on='participantId')
summary = summary.merge(expense_slopes, on='participantId')
summary = summary.merge(balance_slopes, on='participantId')
summary = summary.merge(df_participants, on='participantId')

print(f"  {len(summary)} participants in summary")

# ── Clustering (elbow method) ────────────────────────────────────────────────
print("Clustering residents (elbow method)...")

features = summary[['avg_income', 'income_slope', 'avg_net_balance', 'net_balance_slope']].values
scaler = StandardScaler()
features_scaled = scaler.fit_transform(features)

# Elbow: compute inertia for k=2..8
inertias = {}
for k in range(2, 9):
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    km.fit(features_scaled)
    inertias[k] = km.inertia_
    print(f"  k={k}: inertia={km.inertia_:.1f}")

# Simple elbow detection: largest drop in inertia
drops = {k: inertias[k-1] - inertias[k] for k in range(3, 9)}
# Pick k where the marginal improvement drops below 50% of the previous drop
best_k = 3  # default
for k in range(4, 9):
    if drops[k] < 0.5 * drops[k-1]:
        best_k = k - 1
        break
else:
    best_k = 4  # fallback

print(f"  Selected k={best_k} (elbow method)")

# Final clustering
km_final = KMeans(n_clusters=best_k, random_state=42, n_init=10)
summary['cluster'] = km_final.fit_predict(features_scaled)

# ── Assign cluster labels based on avg_net_balance_slope ─────────────────────
cluster_stats = summary.groupby('cluster').agg(
    avg_income=('avg_income', 'mean'),
    avg_net_balance=('avg_net_balance', 'mean'),
    avg_net_balance_slope=('net_balance_slope', 'mean'),
    count=('participantId', 'count'),
).reset_index()

# Sort clusters by net_balance_slope to assign meaningful labels
cluster_stats = cluster_stats.sort_values('avg_net_balance_slope', ascending=False).reset_index(drop=True)

# Label assignment: best slope → "Improving", worst → "Declining", middle → "Stable" (or more if k>3)
label_pool = ["Improving", "Stable-High", "Stable", "Stable-Low", "Declining", "At-Risk"]
colors_pool = ["#2e7d32", "#1565c0", "#6a1b9a", "#e65100", "#c62828", "#4e342e"]

cluster_label_map = {}
cluster_color_map = {}
for i, row in cluster_stats.iterrows():
    if i == 0:
        label = "Improving"
        color = colors_pool[0]
    elif i == len(cluster_stats) - 1:
        label = "Declining"
        color = colors_pool[4]
    else:
        label = label_pool[min(i, len(label_pool)-1)]
        color = colors_pool[min(i, len(colors_pool)-1)]
    cluster_label_map[row['cluster']] = label
    cluster_color_map[row['cluster']] = color

# ── Build cluster_meta.json ──────────────────────────────────────────────────
cluster_meta = []
for _, row in cluster_stats.iterrows():
    cid = int(row['cluster'])
    cluster_meta.append({
        "cluster": cid,
        "label": cluster_label_map[cid],
        "count": int(row['count']),
        "avg_income": round(float(row['avg_income']), 2),
        "avg_net_balance": round(float(row['avg_net_balance']), 2),
        "color": cluster_color_map[cid],
    })

# ── Export residents_monthly.json ────────────────────────────────────────────
print("Exporting residents_monthly.json...")
df_out = df_monthly.copy()
df_out['month'] = df_out['month'].dt.strftime('%Y-%m-%d')
df_out['participantId'] = df_out['participantId'].astype(int)
for col in ['income', 'food', 'shelter', 'recreation', 'education', 'total_expenses', 'net_balance']:
    df_out[col] = df_out[col].astype(float).round(2)

monthly_records = df_out.to_dict(orient='records')
for rec in monthly_records:
    for k, v in rec.items():
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
            rec[k] = None

monthly_path = os.path.join(DATA_DIR, "residents_monthly.json")
with open(monthly_path, 'w') as f:
    json.dump(monthly_records, f)
print(f"  {monthly_path} — {len(monthly_records)} records")

# ── Export residents_summary.json ────────────────────────────────────────────
print("Exporting residents_summary.json...")
sum_out = summary.copy()
sum_out['participantId'] = sum_out['participantId'].astype(int)
sum_out['cluster'] = sum_out['cluster'].astype(int)
sum_out['householdSize'] = sum_out['householdSize'].astype(int)
sum_out['age'] = sum_out['age'].astype(int)
for col in ['avg_income', 'avg_expenses', 'avg_net_balance', 'income_slope', 'expense_slope', 'net_balance_slope', 'joviality']:
    sum_out[col] = sum_out[col].astype(float).round(4)
# Convert haveKids to bool
sum_out['haveKids'] = sum_out['haveKids'].map({'TRUE': True, 'FALSE': False, True: True, False: False})

sum_records = sum_out.to_dict(orient='records')
for rec in sum_records:
    for k, v in rec.items():
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
            rec[k] = None

sum_path = os.path.join(DATA_DIR, "residents_summary.json")
with open(sum_path, 'w') as f:
    json.dump(sum_records, f)
print(f"  {sum_path} — {len(sum_records)} records")

# ── Export cluster_meta.json ─────────────────────────────────────────────────
print("Exporting cluster_meta.json...")
meta_path = os.path.join(DATA_DIR, "cluster_meta.json")
with open(meta_path, 'w') as f:
    json.dump(cluster_meta, f, indent=2)
print(f"  {meta_path} — {len(cluster_meta)} clusters")

print("Done.")
con.close()
```

**Step 3: Run the preprocessing**

```bash
cd C:/Users/swae2/Documents/DataViz
python server/preprocess_q2.py
```

Expected output:
- `server/data/residents_monthly.json` — ~15,000 records
- `server/data/residents_summary.json` — 1,011 records
- `server/data/cluster_meta.json` — 3-4 cluster entries
- Console prints the selected k and inertia values

**Step 4: Validate output**

```bash
python -c "
import json
with open('server/data/residents_monthly.json') as f: m = json.load(f)
with open('server/data/residents_summary.json') as f: s = json.load(f)
with open('server/data/cluster_meta.json') as f: c = json.load(f)
print(f'Monthly: {len(m)} records, first: {list(m[0].keys())}')
print(f'Summary: {len(s)} records, first: {list(s[0].keys())}')
print(f'Clusters: {len(c)} clusters')
for cl in c: print(f'  Cluster {cl[\"cluster\"]}: {cl[\"label\"]} ({cl[\"count\"]} residents)')
# Sanity: check all participantIds in summary have a cluster
clusters = set(r['cluster'] for r in s)
print(f'Unique clusters in summary: {clusters}')
# Check no NaN
nans = sum(1 for r in m for v in r.values() if v is None)
print(f'Null values in monthly: {nans}')
"
```

Expected: 1,011 participants, 3-4 clusters, zero or near-zero null values.

**Step 5: Commit**

```bash
git add server/preprocess_q2.py server/requirements.txt server/data/residents_monthly.json server/data/residents_summary.json server/data/cluster_meta.json
git commit -m "feat(q2): add preprocessing pipeline for resident financial health

Computes monthly income/expenses per resident from FinancialJournal,
derives slopes, clusters residents via k-means (elbow method),
exports three JSON files for the Q2 dashboard."
```

---

## Task 2: Flask API Endpoint

**Files:**
- Modify: `server/app.py`

**Step 1: Add Q2 endpoint**

Add after the existing `/api/data` route in `server/app.py`:

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

**Step 2: Test the endpoint**

```bash
cd C:/Users/swae2/Documents/DataViz
python server/app.py &
sleep 2
curl -s http://localhost:5000/api/q2/data | python -c "import sys,json; d=json.load(sys.stdin); print(f'monthly: {len(d[\"monthly\"])}, residents: {len(d[\"residents\"])}, clusters: {len(d[\"clusters\"])}')"
kill %1
```

Expected: `monthly: ~15000, residents: 1011, clusters: 3-4`

**Step 3: Commit**

```bash
git add server/app.py
git commit -m "feat(q2): add /api/q2/data Flask endpoint"
```

---

## Task 3: Navigation Slice + Tab Bar

**Files:**
- Create: `client/src/store/NavigationSlice.js`
- Modify: `client/src/store/store.js`
- Create: `client/src/components/TabBar.jsx`

**Step 1: Create NavigationSlice.js**

```js
// client/src/store/NavigationSlice.js
import { createSlice } from "@reduxjs/toolkit";

const navigationSlice = createSlice({
  name: "navigation",
  initialState: {
    activeTab: "q1",
  },
  reducers: {
    setActiveTab(state, action) {
      state.activeTab = action.payload;
    },
  },
});

export const { setActiveTab } = navigationSlice.actions;
export const selectActiveTab = (state) => state.navigation.activeTab;
export default navigationSlice.reducer;
```

**Step 2: Register in store.js**

Replace `client/src/store/store.js` with:

```js
import { configureStore } from "@reduxjs/toolkit";
import datasetReducer from "./DataSetSlice.js";
import interactionReducer from "./InteractionSlice.js";
import navigationReducer from "./NavigationSlice.js";

export const store = configureStore({
  reducer: {
    dataset: datasetReducer,
    interaction: interactionReducer,
    navigation: navigationReducer,
  },
});
```

(Q2 slices will be added in Task 4.)

**Step 3: Create TabBar.jsx**

```jsx
// client/src/components/TabBar.jsx
import { useSelector, useDispatch } from "react-redux";
import { selectActiveTab, setActiveTab } from "../store/NavigationSlice.js";

const TABS = [
  { id: "q1", label: "Q1 \u2014 Prosp\u00e9rit\u00e9 des employeurs" },
  { id: "q2", label: "Q2 \u2014 Sant\u00e9 financi\u00e8re des r\u00e9sidents" },
  { id: "q3", label: "Q3 \u2014 Dynamique de l\u2019emploi", disabled: true },
];

export default function TabBar() {
  const dispatch = useDispatch();
  const activeTab = useSelector(selectActiveTab);

  return (
    <div className="tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn${activeTab === tab.id ? " active" : ""}`}
          disabled={tab.disabled}
          onClick={() => dispatch(setActiveTab(tab.id))}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

**Step 4: Add tab CSS to App.css**

Append to `client/src/styles/App.css`:

```css
/* Tab bar */
.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  border-bottom: 2px solid #e0e0e0;
}

.tab-btn {
  padding: 10px 20px;
  border: none;
  background: none;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  color: #666;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.2s, border-color 0.2s;
}

.tab-btn:hover {
  color: #333;
}

.tab-btn.active {
  color: #1565c0;
  border-bottom-color: #1565c0;
  font-weight: 500;
}

.tab-btn:disabled {
  color: #bbb;
  cursor: not-allowed;
}
```

**Step 5: Commit**

```bash
git add client/src/store/NavigationSlice.js client/src/store/store.js client/src/components/TabBar.jsx client/src/styles/App.css
git commit -m "feat(nav): add NavigationSlice, TabBar, and tab CSS"
```

---

## Task 4: Q2 Redux Slices

**Files:**
- Create: `client/src/store/Q2DataSlice.js`
- Create: `client/src/store/Q2InteractionSlice.js`
- Modify: `client/src/store/store.js`

**Step 1: Create Q2DataSlice.js**

```js
// client/src/store/Q2DataSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export const fetchQ2Data = createAsyncThunk("q2Dataset/fetchQ2Data", async () => {
  const response = await fetch("http://localhost:5000/api/q2/data");
  const data = await response.json();
  return { monthly: data.monthly, residents: data.residents, clusters: data.clusters };
});

const q2DataSlice = createSlice({
  name: "q2Dataset",
  initialState: {
    status: "idle",
    error: null,
    monthly: [],
    residents: [],
    clusters: [],
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchQ2Data.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchQ2Data.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.monthly = action.payload.monthly;
        state.residents = action.payload.residents;
        state.clusters = action.payload.clusters;
      })
      .addCase(fetchQ2Data.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message;
      });
  },
});

export const selectQ2Monthly = (state) => state.q2Dataset.monthly;
export const selectQ2Residents = (state) => state.q2Dataset.residents;
export const selectQ2Clusters = (state) => state.q2Dataset.clusters;
export const selectQ2DataStatus = (state) => state.q2Dataset.status;

export default q2DataSlice.reducer;
```

**Step 2: Create Q2InteractionSlice.js**

```js
// client/src/store/Q2InteractionSlice.js
import { createSlice } from "@reduxjs/toolkit";

const q2InteractionSlice = createSlice({
  name: "q2Interaction",
  initialState: {
    hoveredResidentId: null,
    hoveredMonth: null,
    selectedResidentIds: [],
    selectedCluster: null,
  },
  reducers: {
    setHoveredResident(state, action) {
      state.hoveredResidentId = action.payload;
    },
    setHoveredMonth(state, action) {
      state.hoveredMonth = action.payload;
    },
    toggleSelectedResident(state, action) {
      const id = action.payload;
      const index = state.selectedResidentIds.indexOf(id);
      if (index >= 0) {
        state.selectedResidentIds.splice(index, 1);
      } else {
        state.selectedResidentIds.push(id);
      }
    },
    setSelectedCluster(state, action) {
      // Toggle: if same cluster clicked again, clear it
      if (state.selectedCluster === action.payload) {
        state.selectedCluster = null;
      } else {
        state.selectedCluster = action.payload;
      }
    },
    clearQ2Selection(state) {
      state.selectedResidentIds = [];
      state.selectedCluster = null;
    },
  },
});

export const {
  setHoveredResident,
  setHoveredMonth,
  toggleSelectedResident,
  setSelectedCluster,
  clearQ2Selection,
} = q2InteractionSlice.actions;

export const selectHoveredResident = (state) => state.q2Interaction.hoveredResidentId;
export const selectHoveredMonth = (state) => state.q2Interaction.hoveredMonth;
export const selectSelectedResidents = (state) => state.q2Interaction.selectedResidentIds;
export const selectSelectedCluster = (state) => state.q2Interaction.selectedCluster;

export default q2InteractionSlice.reducer;
```

**Step 3: Update store.js to include Q2 slices**

```js
// client/src/store/store.js
import { configureStore } from "@reduxjs/toolkit";
import datasetReducer from "./DataSetSlice.js";
import interactionReducer from "./InteractionSlice.js";
import navigationReducer from "./NavigationSlice.js";
import q2DatasetReducer from "./Q2DataSlice.js";
import q2InteractionReducer from "./Q2InteractionSlice.js";

export const store = configureStore({
  reducer: {
    dataset: datasetReducer,
    interaction: interactionReducer,
    navigation: navigationReducer,
    q2Dataset: q2DatasetReducer,
    q2Interaction: q2InteractionReducer,
  },
});
```

**Step 4: Commit**

```bash
git add client/src/store/Q2DataSlice.js client/src/store/Q2InteractionSlice.js client/src/store/store.js
git commit -m "feat(q2): add Q2DataSlice and Q2InteractionSlice Redux stores"
```

---

## Task 5: Extract Q1Dashboard + Restructure App.jsx

**Files:**
- Create: `client/src/components/Q1Dashboard.jsx`
- Modify: `client/src/App.jsx`

**Step 1: Create Q1Dashboard.jsx**

Extract the existing Q1 content from `App.jsx` into its own component. **No logic changes** — just a move:

```jsx
// client/src/components/Q1Dashboard.jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchData, selectDataStatus } from "../store/DataSetSlice.js";
import ControlBar from "./controlbar/ControlBar.jsx";
import TimeSeriesContainer from "./timeseries/TimeSeriesContainer.jsx";
import BarChartContainer from "./barchart/BarChartContainer.jsx";
import ScatterplotContainer from "./scatterplot/ScatterplotContainer.jsx";
import Tooltip from "./tooltip/Tooltip.jsx";

export default function Q1Dashboard() {
  const dispatch = useDispatch();
  const status = useSelector(selectDataStatus);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchData());
    }
  }, [dispatch, status]);

  if (status === "loading") return <p>Loading Q1 data...</p>;
  if (status === "failed") return <p>Failed to load Q1 data.</p>;
  if (status !== "succeeded") return null;

  return (
    <>
      <ControlBar />
      <div className="panels-row">
        <TimeSeriesContainer />
        <BarChartContainer />
      </div>
      <div className="panels-row">
        <ScatterplotContainer />
      </div>
      <Tooltip />
    </>
  );
}
```

Note: Added `if (status === "idle")` guard so Q1 data only fetches once (same lazy pattern as Q2). The existing `DataSetSlice` starts with `status: "idle"` so this works.

**Step 2: Rewrite App.jsx**

```jsx
// client/src/App.jsx
import { useSelector } from "react-redux";
import { selectActiveTab } from "./store/NavigationSlice.js";
import TabBar from "./components/TabBar.jsx";
import Q1Dashboard from "./components/Q1Dashboard.jsx";
import "./styles/App.css";

function App() {
  const activeTab = useSelector(selectActiveTab);

  return (
    <div className="dashboard">
      <TabBar />
      {activeTab === "q1" && <Q1Dashboard />}
      {activeTab === "q2" && <p>Q2 dashboard coming next...</p>}
      {activeTab === "q3" && <p>Q3 coming soon...</p>}
    </div>
  );
}

export default App;
```

**Step 3: Verify Q1 still works**

```bash
cd C:/Users/swae2/Documents/DataViz/client
npm run dev
```

Open browser at http://localhost:5173. Verify:
- Tab bar appears with Q1 active
- Q1 dashboard renders identically to before
- Clicking Q2 tab shows placeholder text
- Clicking back to Q1 restores the dashboard
- All Q1 interactions (hover, click, topN slider) still work

**Step 4: Commit**

```bash
git add client/src/components/Q1Dashboard.jsx client/src/App.jsx
git commit -m "refactor: extract Q1Dashboard, restructure App.jsx with tab routing"
```

---

## Task 6: Q2Dashboard Shell + Q2ControlBar + Q2Tooltip

**Files:**
- Create: `client/src/components/Q2Dashboard.jsx`
- Create: `client/src/components/q2/controlbar/Q2ControlBar.jsx`
- Create: `client/src/components/q2/tooltip/Q2Tooltip.jsx`
- Modify: `client/src/App.jsx`

**Step 1: Create Q2ControlBar**

```jsx
// client/src/components/q2/controlbar/Q2ControlBar.jsx
import { useSelector, useDispatch } from "react-redux";
import { selectQ2Clusters } from "../../../store/Q2DataSlice.js";
import {
  selectSelectedResidents,
  selectSelectedCluster,
  setSelectedCluster,
  clearQ2Selection,
} from "../../../store/Q2InteractionSlice.js";

export default function Q2ControlBar() {
  const dispatch = useDispatch();
  const clusters = useSelector(selectQ2Clusters);
  const selectedIds = useSelector(selectSelectedResidents);
  const selectedCluster = useSelector(selectSelectedCluster);

  return (
    <div className="controlbar">
      <h1 style={{ fontSize: "16px", margin: 0 }}>
        VAST 2022 -- Resident Financial Health
      </h1>
      <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
        {clusters.map((cl) => {
          const isActive = selectedCluster === cl.cluster;
          return (
            <button
              key={cl.cluster}
              className={`cluster-btn${isActive ? " active" : ""}`}
              style={isActive ? {
                borderColor: cl.color,
                borderWidth: "2px",
                background: cl.color + "18",
              } : {}}
              onClick={() => dispatch(setSelectedCluster(cl.cluster))}
            >
              <span
                className="cluster-swatch"
                style={{ backgroundColor: cl.color }}
              />
              {cl.label} ({cl.count})
            </button>
          );
        })}
      </div>
      {selectedIds.length > 0 && (
        <button onClick={() => dispatch(clearQ2Selection())}>
          Clear selection ({selectedIds.length})
        </button>
      )}
    </div>
  );
}
```

**Step 2: Create Q2Tooltip**

```jsx
// client/src/components/q2/tooltip/Q2Tooltip.jsx
import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { selectQ2Residents, selectQ2Clusters, selectQ2Monthly } from "../../../store/Q2DataSlice.js";
import { selectHoveredResident, selectHoveredMonth, selectSelectedCluster } from "../../../store/Q2InteractionSlice.js";
import * as d3 from "d3";

export default function Q2Tooltip() {
  const hoveredResidentId = useSelector(selectHoveredResident);
  const hoveredMonth = useSelector(selectHoveredMonth);
  const residents = useSelector(selectQ2Residents);
  const clusters = useSelector(selectQ2Clusters);
  const monthly = useSelector(selectQ2Monthly);
  const selectedCluster = useSelector(selectSelectedCluster);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  const style = {
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
  };

  // Mode 1: Resident hover (from Panel F)
  if (hoveredResidentId !== null) {
    const res = residents.find((r) => r.participantId === hoveredResidentId);
    if (!res) return null;
    const cl = clusters.find((c) => c.cluster === res.cluster);

    return (
      <div style={style}>
        <div style={{ fontWeight: "bold" }}>Resident {res.participantId}</div>
        <div style={{ color: cl?.color }}>Cluster: {cl?.label}</div>
        <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #eee" }} />
        <div>Avg income: ${res.avg_income.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</div>
        <div>Avg expenses: ${res.avg_expenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</div>
        <div>Net balance trend: {res.net_balance_slope >= 0 ? "+" : ""}{res.net_balance_slope.toFixed(1)}/mo</div>
        <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #eee" }} />
        <div>Age: {res.age}</div>
        <div>Education: {res.educationLevel}</div>
        <div>Household size: {res.householdSize}</div>
      </div>
    );
  }

  // Mode 2: Month hover (from Panel E box plots)
  if (hoveredMonth !== null) {
    // Compute stats for this month
    const activeIds = selectedCluster !== null
      ? new Set(residents.filter((r) => r.cluster === selectedCluster).map((r) => r.participantId))
      : null;
    const monthRecords = monthly.filter((r) => r.month === hoveredMonth);
    const filtered = activeIds ? monthRecords.filter((r) => activeIds.has(r.participantId)) : monthRecords;
    const values = filtered.map((r) => r.net_balance).sort(d3.ascending);
    const median = d3.quantile(values, 0.5);
    const q1 = d3.quantile(values, 0.25);
    const q3 = d3.quantile(values, 0.75);
    const belowZero = values.filter((v) => v < 0).length;
    const label = d3.timeFormat("%B %Y")(new Date(hoveredMonth));

    return (
      <div style={style}>
        <div style={{ fontWeight: "bold" }}>{label}</div>
        <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #eee" }} />
        <div>Median net balance: ${median?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        <div>Q1: ${q1?.toLocaleString(undefined, { maximumFractionDigits: 0 })} &middot; Q3: ${q3?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        <div>Residents below $0: {belowZero}</div>
      </div>
    );
  }

  return null;
}
```

**Step 3: Create Q2Dashboard**

```jsx
// client/src/components/Q2Dashboard.jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchQ2Data, selectQ2DataStatus } from "../store/Q2DataSlice.js";
import Q2ControlBar from "./q2/controlbar/Q2ControlBar.jsx";
import Q2Tooltip from "./q2/tooltip/Q2Tooltip.jsx";

export default function Q2Dashboard() {
  const dispatch = useDispatch();
  const status = useSelector(selectQ2DataStatus);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchQ2Data());
    }
  }, [dispatch, status]);

  if (status === "loading")
    return <p>Loading Q2 data...</p>;
  if (status === "failed")
    return <p>Failed to load Q2 data.</p>;
  if (status !== "succeeded") return null;

  return (
    <>
      <Q2ControlBar />
      <div className="panels-row">
        <div className="areachart-panel">
          <h3 className="panel-title">Median Income vs Cost of Living</h3>
          <p style={{ color: "#999" }}>Panel D — coming next</p>
        </div>
      </div>
      <div className="panels-row">
        <div className="boxplot-panel">
          <h3 className="panel-title">Net Balance Distribution (per resident)</h3>
          <p style={{ color: "#999" }}>Panel E — coming next</p>
        </div>
      </div>
      <div className="panels-row">
        <div className="resident-scatter-panel">
          <h3 className="panel-title">Resident Financial Trajectories</h3>
          <p style={{ color: "#999" }}>Panel F — coming next</p>
        </div>
      </div>
      <Q2Tooltip />
    </>
  );
}
```

**Step 4: Add Q2 panel CSS to App.css**

Append to `client/src/styles/App.css`:

```css
/* Q2 panels */
.areachart-panel {
  width: 100%;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px;
  min-height: 400px;
}

.boxplot-panel {
  width: 100%;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px;
  min-height: 350px;
}

.resident-scatter-panel {
  width: 100%;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px;
  min-height: 400px;
}

.panel-title {
  font-size: 13px;
  font-weight: 500;
  color: #666;
  margin: 0 0 8px 0;
}

/* Cluster buttons */
.cluster-btn {
  padding: 6px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.cluster-btn:hover {
  background: #e8e8e8;
}

.cluster-btn.active {
  font-weight: 500;
}

.cluster-swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
}
```

**Step 5: Wire Q2Dashboard into App.jsx**

Update `client/src/App.jsx`:

```jsx
import { useSelector } from "react-redux";
import { selectActiveTab } from "./store/NavigationSlice.js";
import TabBar from "./components/TabBar.jsx";
import Q1Dashboard from "./components/Q1Dashboard.jsx";
import Q2Dashboard from "./components/Q2Dashboard.jsx";
import "./styles/App.css";

function App() {
  const activeTab = useSelector(selectActiveTab);

  return (
    <div className="dashboard">
      <TabBar />
      {activeTab === "q1" && <Q1Dashboard />}
      {activeTab === "q2" && <Q2Dashboard />}
      {activeTab === "q3" && <p>Q3 coming soon...</p>}
    </div>
  );
}

export default App;
```

**Step 6: Verify**

Start both servers:
```bash
cd C:/Users/swae2/Documents/DataViz && python server/app.py &
cd C:/Users/swae2/Documents/DataViz/client && npm run dev
```

Verify:
- Q1 tab: dashboard works as before
- Q2 tab: shows ControlBar with cluster buttons, three placeholder panels, data loads successfully
- Cluster buttons render with correct labels and colors
- Clicking a cluster button toggles its active state

**Step 7: Commit**

```bash
git add client/src/components/Q2Dashboard.jsx client/src/components/q2/ client/src/App.jsx client/src/styles/App.css
git commit -m "feat(q2): add Q2Dashboard shell with ControlBar, Tooltip, and panel placeholders"
```

---

## Task 7: Panel F — Resident Scatter Plot

**Why Panel F first:** It's the most similar to existing Q1 code (ScatterplotD3.js) and drives the interaction for the other two panels. Building it first lets us validate the Redux data flow and interaction before tackling the more novel area chart and box plots.

**Files:**
- Create: `client/src/components/q2/residentscatter/ResidentScatterD3.js`
- Create: `client/src/components/q2/residentscatter/ResidentScatterContainer.jsx`
- Modify: `client/src/components/Q2Dashboard.jsx`

**Step 1: Create ResidentScatterD3.js**

```js
// client/src/components/q2/residentscatter/ResidentScatterD3.js
import * as d3 from "d3";

export default class ResidentScatterD3 {
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

    this.quadrantG = this.mainG.append("g").attr("class", "quadrants");
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
      .text("Income trend (slope/month)");

    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", -this.innerHeight / 2)
      .attr("y", -45)
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("font-size", "12px")
      .text("Net balance trend (slope/month)");
  }

  update(residents, clusters) {
    const { innerWidth, innerHeight } = this;
    const controllerMethods = this.controllerMethods;

    // Symmetric domains centered on 0
    const xExtent = d3.extent(residents, (d) => d.income_slope);
    const xMax = Math.max(Math.abs(xExtent[0]), Math.abs(xExtent[1]));
    const yExtent = d3.extent(residents, (d) => d.net_balance_slope);
    const yMax = Math.max(Math.abs(yExtent[0]), Math.abs(yExtent[1]));

    this.xScale = d3.scaleLinear().domain([-xMax, xMax]).range([0, innerWidth]).nice();
    this.yScale = d3.scaleLinear().domain([-yMax, yMax]).range([innerHeight, 0]).nice();
    this.sizeScale = d3.scaleSqrt()
      .domain(d3.extent(residents, (d) => d.avg_income))
      .range([3, 14]);
    this.colorScale = d3.scaleOrdinal()
      .domain(clusters.map((c) => c.cluster))
      .range(clusters.map((c) => c.color));

    // Quadrant reference lines
    this.quadrantG.selectAll("*").remove();

    this.quadrantG.append("line")
      .attr("x1", this.xScale(0)).attr("x2", this.xScale(0))
      .attr("y1", 0).attr("y2", innerHeight)
      .attr("stroke", "#999").attr("stroke-dasharray", "4,4");

    this.quadrantG.append("line")
      .attr("x1", 0).attr("x2", innerWidth)
      .attr("y1", this.yScale(0)).attr("y2", this.yScale(0))
      .attr("stroke", "#999").attr("stroke-dasharray", "4,4");

    // Quadrant labels
    const labels = [
      { x: innerWidth - 5, y: 15, anchor: "end", text: "Improving" },
      { x: 5, y: innerHeight - 5, anchor: "start", text: "Declining" },
      { x: 5, y: 15, anchor: "start", text: "Cutting costs" },
      { x: innerWidth - 5, y: innerHeight - 5, anchor: "end", text: "Cost of living rising" },
    ];
    labels.forEach((l) => {
      this.quadrantG.append("text")
        .attr("x", l.x).attr("y", l.y)
        .attr("text-anchor", l.anchor)
        .attr("font-size", "11px").attr("fill", "#999")
        .text(l.text);
    });

    // Axes
    this.xAxisG.transition().duration(500).call(d3.axisBottom(this.xScale));
    this.yAxisG.transition().duration(500).call(d3.axisLeft(this.yScale));

    // Dots
    const xScale = this.xScale;
    const yScale = this.yScale;
    const sizeScale = this.sizeScale;
    const colorScale = this.colorScale;

    this.dotsG.selectAll("circle")
      .data(residents, (d) => d.participantId)
      .join(
        (enter) =>
          enter.append("circle")
            .attr("cx", (d) => xScale(d.income_slope))
            .attr("cy", (d) => yScale(d.net_balance_slope))
            .attr("r", 0)
            .attr("fill", (d) => colorScale(d.cluster))
            .attr("stroke", "#333")
            .attr("stroke-width", 0.5)
            .attr("opacity", 0.7)
            .call((sel) =>
              sel.transition().duration(500).attr("r", (d) => sizeScale(d.avg_income))
            ),
        (update) =>
          update.call((sel) =>
            sel.transition().duration(500)
              .attr("cx", (d) => xScale(d.income_slope))
              .attr("cy", (d) => yScale(d.net_balance_slope))
              .attr("r", (d) => sizeScale(d.avg_income))
          ),
        (exit) =>
          exit.call((sel) =>
            sel.transition().duration(300).attr("r", 0).remove()
          )
      )
      .on("mouseenter", (event, d) => {
        controllerMethods.handleHover(d.participantId);
      })
      .on("mouseleave", () => {
        controllerMethods.handleUnhover();
      })
      .on("click", (event, d) => {
        controllerMethods.handleClick(d.participantId);
      });
  }

  updateHighlighting(hoveredId, selectedIds, selectedCluster) {
    const circles = this.dotsG.selectAll("circle");
    const hasHover = hoveredId !== null;
    const hasSelection = selectedIds.length > 0;
    const hasCluster = selectedCluster !== null;

    if (!hasHover && !hasSelection && !hasCluster) {
      circles
        .attr("opacity", 0.7)
        .attr("stroke-width", 0.5)
        .attr("stroke", "#333");
      return;
    }

    circles.each(function (d) {
      const el = d3.select(this);
      const isHovered = d.participantId === hoveredId;
      const isSelected = selectedIds.includes(d.participantId);
      const inCluster = hasCluster ? d.cluster === selectedCluster : true;

      if (isHovered) {
        el.attr("opacity", 1)
          .attr("stroke-width", 2.5)
          .attr("stroke", "#000");
        this.parentNode.appendChild(this);
      } else if (isSelected) {
        el.attr("opacity", 0.9)
          .attr("stroke-width", 2)
          .attr("stroke", "#000");
      } else if (hasCluster && !inCluster) {
        el.attr("opacity", 0.1)
          .attr("stroke-width", 0.3)
          .attr("stroke", "#333");
      } else if (hasHover) {
        el.attr("opacity", inCluster ? 0.3 : 0.1)
          .attr("stroke-width", 0.5)
          .attr("stroke", "#333");
      } else {
        el.attr("opacity", inCluster ? 0.7 : 0.1)
          .attr("stroke-width", 0.5)
          .attr("stroke", "#333");
      }
    });
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
```

**Step 2: Create ResidentScatterContainer.jsx**

```jsx
// client/src/components/q2/residentscatter/ResidentScatterContainer.jsx
import { useRef, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectQ2Residents, selectQ2Clusters } from "../../../store/Q2DataSlice.js";
import {
  selectHoveredResident,
  selectSelectedResidents,
  selectSelectedCluster,
  setHoveredResident,
  toggleSelectedResident,
} from "../../../store/Q2InteractionSlice.js";
import ResidentScatterD3 from "./ResidentScatterD3.js";

export default function ResidentScatterContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);
  const dispatch = useDispatch();

  const residents = useSelector(selectQ2Residents);
  const clusters = useSelector(selectQ2Clusters);
  const hoveredId = useSelector(selectHoveredResident);
  const selectedIds = useSelector(selectSelectedResidents);
  const selectedCluster = useSelector(selectSelectedCluster);

  const controllerMethods = useMemo(
    () => ({
      handleHover: (id) => dispatch(setHoveredResident(id)),
      handleUnhover: () => dispatch(setHoveredResident(null)),
      handleClick: (id) => dispatch(toggleSelectedResident(id)),
    }),
    [dispatch]
  );

  useEffect(() => {
    const instance = new ResidentScatterD3(ref.current, controllerMethods);
    instance.create({ width: 1080, height: 400 });
    d3Ref.current = instance;
    return () => instance.clear();
  }, [controllerMethods]);

  useEffect(() => {
    if (d3Ref.current && residents.length > 0) {
      d3Ref.current.update(residents, clusters);
    }
  }, [residents, clusters]);

  useEffect(() => {
    if (d3Ref.current) {
      d3Ref.current.updateHighlighting(hoveredId, selectedIds, selectedCluster);
    }
  }, [hoveredId, selectedIds, selectedCluster]);

  return <div ref={ref} className="resident-scatter-panel"><h3 className="panel-title">Resident Financial Trajectories</h3></div>;
}
```

**Step 3: Wire into Q2Dashboard**

Update `Q2Dashboard.jsx` — replace the Panel F placeholder with `<ResidentScatterContainer />`:

```jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchQ2Data, selectQ2DataStatus } from "../store/Q2DataSlice.js";
import Q2ControlBar from "./q2/controlbar/Q2ControlBar.jsx";
import ResidentScatterContainer from "./q2/residentscatter/ResidentScatterContainer.jsx";
import Q2Tooltip from "./q2/tooltip/Q2Tooltip.jsx";

export default function Q2Dashboard() {
  const dispatch = useDispatch();
  const status = useSelector(selectQ2DataStatus);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchQ2Data());
    }
  }, [dispatch, status]);

  if (status === "loading") return <p>Loading Q2 data...</p>;
  if (status === "failed") return <p>Failed to load Q2 data.</p>;
  if (status !== "succeeded") return null;

  return (
    <>
      <Q2ControlBar />
      <div className="panels-row">
        <div className="areachart-panel">
          <h3 className="panel-title">Median Income vs Cost of Living</h3>
          <p style={{ color: "#999" }}>Panel D — coming next</p>
        </div>
      </div>
      <div className="panels-row">
        <div className="boxplot-panel">
          <h3 className="panel-title">Net Balance Distribution (per resident)</h3>
          <p style={{ color: "#999" }}>Panel E — coming next</p>
        </div>
      </div>
      <div className="panels-row">
        <ResidentScatterContainer />
      </div>
      <Q2Tooltip />
    </>
  );
}
```

**Step 4: Verify**

- Q2 tab: scatter plot renders with 1,011 colored dots
- Quadrant labels and reference lines visible
- Hover: dot highlights, tooltip shows resident info
- Click: dot stays selected
- Cluster button: dots outside cluster fade to 0.1

**Step 5: Commit**

```bash
git add client/src/components/q2/residentscatter/ client/src/components/Q2Dashboard.jsx
git commit -m "feat(q2): implement Panel F — resident scatter plot with cluster coloring"
```

---

## Task 8: Panel D — Stacked Area Chart

**Files:**
- Create: `client/src/components/q2/areachart/AreaChartD3.js`
- Create: `client/src/components/q2/areachart/AreaChartContainer.jsx`
- Modify: `client/src/components/Q2Dashboard.jsx`

**Step 1: Create AreaChartD3.js**

```js
// client/src/components/q2/areachart/AreaChartD3.js
import * as d3 from "d3";

const EXPENSE_KEYS = ["shelter", "food", "recreation", "education"];
const EXPENSE_COLORS = {
  shelter: "#bf360c",
  food: "#e65100",
  recreation: "#ff8f00",
  education: "#ffb74d",
};
const INCOME_COLOR = "#1565c0";

export default class AreaChartD3 {
  constructor(container, controllerMethods) {
    this.container = container;
    this.controllerMethods = controllerMethods;
  }

  create({ width, height }) {
    this.width = width;
    this.height = height;
    this.margins = { top: 30, right: 30, bottom: 40, left: 80 };
    this.innerWidth = width - this.margins.left - this.margins.right;
    this.innerHeight = height - this.margins.top - this.margins.bottom;

    this.svg = d3.select(this.container)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height);

    this.mainG = this.svg.append("g")
      .attr("transform", `translate(${this.margins.left},${this.margins.top})`);

    this.areasG = this.mainG.append("g").attr("class", "areas");
    this.referenceG = this.mainG.append("g").attr("class", "reference-lines");
    this.incomeLineG = this.mainG.append("g").attr("class", "income-line");
    this.xAxisG = this.mainG.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${this.innerHeight})`);
    this.yAxisG = this.mainG.append("g")
      .attr("class", "y-axis");

    // Y axis label
    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", -this.innerHeight / 2)
      .attr("y", -60)
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("font-size", "12px")
      .text("Monthly amount ($)");

    // Legend
    const legendG = this.mainG.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${this.innerWidth - 150}, 0)`);

    const legendItems = [
      { label: "Income", color: INCOME_COLOR, type: "line" },
      ...EXPENSE_KEYS.map((k) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), color: EXPENSE_COLORS[k], type: "rect" })),
    ];

    legendItems.forEach((item, i) => {
      const g = legendG.append("g").attr("transform", `translate(0, ${i * 16})`);
      if (item.type === "line") {
        g.append("line").attr("x1", 0).attr("x2", 14).attr("y1", 5).attr("y2", 5)
          .attr("stroke", item.color).attr("stroke-width", 2.5);
      } else {
        g.append("rect").attr("width", 12).attr("height", 10)
          .attr("fill", item.color).attr("opacity", 0.8);
      }
      g.append("text").attr("x", 18).attr("y", 10).attr("font-size", "10px").text(item.label);
    });
  }

  update(monthlyMedians, referenceMedians, selectedCluster) {
    const { innerWidth, innerHeight } = this;

    // Scales
    const xDomain = d3.extent(monthlyMedians, (d) => new Date(d.month));
    this.xScale = d3.scaleTime().domain(xDomain).range([0, innerWidth]);

    const maxExpense = d3.max(monthlyMedians, (d) => d.shelter + d.food + d.recreation + d.education);
    const maxIncome = d3.max(monthlyMedians, (d) => d.income);
    const yMax = Math.max(maxExpense || 0, maxIncome || 0);
    this.yScale = d3.scaleLinear().domain([0, yMax]).range([innerHeight, 0]).nice();

    // Stacked data
    const stack = d3.stack().keys(EXPENSE_KEYS).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
    const stackedData = stack(monthlyMedians);

    // Area generator
    const xScale = this.xScale;
    const yScale = this.yScale;
    const area = d3.area()
      .x((d) => xScale(new Date(d.data.month)))
      .y0((d) => yScale(d[0]))
      .y1((d) => yScale(d[1]))
      .curve(d3.curveMonotoneX);

    // Draw stacked areas
    this.areasG.selectAll("path")
      .data(stackedData, (d) => d.key)
      .join(
        (enter) => enter.append("path")
          .attr("d", area)
          .attr("fill", (d) => EXPENSE_COLORS[d.key])
          .attr("opacity", 0.8),
        (update) => update.transition().duration(500).attr("d", area),
        (exit) => exit.remove()
      );

    // Income line
    const incomeLine = d3.line()
      .x((d) => xScale(new Date(d.month)))
      .y((d) => yScale(d.income))
      .curve(d3.curveMonotoneX);

    this.incomeLineG.selectAll("path")
      .data([monthlyMedians])
      .join(
        (enter) => enter.append("path")
          .attr("d", incomeLine)
          .attr("fill", "none")
          .attr("stroke", INCOME_COLOR)
          .attr("stroke-width", 2.5),
        (update) => update.transition().duration(500).attr("d", incomeLine),
        (exit) => exit.remove()
      );

    // Reference lines (focus+context)
    this.referenceG.selectAll("*").remove();

    if (selectedCluster !== null && referenceMedians) {
      // Dashed income reference
      const refIncomeLine = d3.line()
        .x((d) => xScale(new Date(d.month)))
        .y((d) => yScale(d.income))
        .curve(d3.curveMonotoneX);

      this.referenceG.append("path")
        .attr("d", refIncomeLine(referenceMedians))
        .attr("fill", "none")
        .attr("stroke", INCOME_COLOR)
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "6,4")
        .attr("opacity", 0.5);

      // Dashed total expense reference
      const refExpenseLine = d3.line()
        .x((d) => xScale(new Date(d.month)))
        .y((d) => yScale(d.shelter + d.food + d.recreation + d.education))
        .curve(d3.curveMonotoneX);

      this.referenceG.append("path")
        .attr("d", refExpenseLine(referenceMedians))
        .attr("fill", "none")
        .attr("stroke", "#999")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "6,4")
        .attr("opacity", 0.5);

      // Label
      const lastRef = referenceMedians[referenceMedians.length - 1];
      this.referenceG.append("text")
        .attr("x", xScale(new Date(lastRef.month)) + 5)
        .attr("y", yScale(lastRef.income) - 5)
        .attr("font-size", "10px")
        .attr("fill", "#999")
        .text("All residents");
    }

    // Axes
    this.xAxisG.transition().duration(500)
      .call(d3.axisBottom(this.xScale).ticks(d3.timeMonth.every(2)).tickFormat(d3.timeFormat("%b %y")));
    this.yAxisG.transition().duration(500)
      .call(d3.axisLeft(this.yScale).tickFormat(d3.format("~s")));
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
```

**Step 2: Create AreaChartContainer.jsx**

```jsx
// client/src/components/q2/areachart/AreaChartContainer.jsx
import { useRef, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { selectQ2Monthly, selectQ2Residents, selectQ2Clusters } from "../../../store/Q2DataSlice.js";
import { selectSelectedCluster } from "../../../store/Q2InteractionSlice.js";
import AreaChartD3 from "./AreaChartD3.js";
import * as d3 from "d3";

function computeMonthlyMedians(monthly, residents, selectedCluster) {
  const activeIds = selectedCluster !== null
    ? new Set(residents.filter((r) => r.cluster === selectedCluster).map((r) => r.participantId))
    : null;

  const byMonth = d3.groups(monthly, (d) => d.month);
  return byMonth.map(([month, records]) => {
    const filtered = activeIds ? records.filter((r) => activeIds.has(r.participantId)) : records;
    return {
      month,
      income: d3.median(filtered, (d) => d.income) || 0,
      shelter: d3.median(filtered, (d) => d.shelter) || 0,
      food: d3.median(filtered, (d) => d.food) || 0,
      recreation: d3.median(filtered, (d) => d.recreation) || 0,
      education: d3.median(filtered, (d) => d.education) || 0,
    };
  }).sort((a, b) => new Date(a.month) - new Date(b.month));
}

export default function AreaChartContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);

  const monthly = useSelector(selectQ2Monthly);
  const residents = useSelector(selectQ2Residents);
  const selectedCluster = useSelector(selectSelectedCluster);

  const fullPopMedians = useMemo(
    () => computeMonthlyMedians(monthly, residents, null),
    [monthly, residents]
  );

  const currentMedians = useMemo(
    () => selectedCluster !== null
      ? computeMonthlyMedians(monthly, residents, selectedCluster)
      : fullPopMedians,
    [monthly, residents, selectedCluster, fullPopMedians]
  );

  useEffect(() => {
    const instance = new AreaChartD3(ref.current, {});
    instance.create({ width: 700, height: 400 });
    d3Ref.current = instance;
    return () => instance.clear();
  }, []);

  useEffect(() => {
    if (d3Ref.current && currentMedians.length > 0) {
      const refMedians = selectedCluster !== null ? fullPopMedians : null;
      d3Ref.current.update(currentMedians, refMedians, selectedCluster);
    }
  }, [currentMedians, fullPopMedians, selectedCluster]);

  return <div ref={ref} className="areachart-panel"><h3 className="panel-title">Median Income vs Cost of Living</h3></div>;
}
```

**Step 3: Wire into Q2Dashboard**

Update `Q2Dashboard.jsx` — replace Panel D placeholder with `<AreaChartContainer />`:

```jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchQ2Data, selectQ2DataStatus } from "../store/Q2DataSlice.js";
import Q2ControlBar from "./q2/controlbar/Q2ControlBar.jsx";
import AreaChartContainer from "./q2/areachart/AreaChartContainer.jsx";
import ResidentScatterContainer from "./q2/residentscatter/ResidentScatterContainer.jsx";
import Q2Tooltip from "./q2/tooltip/Q2Tooltip.jsx";

export default function Q2Dashboard() {
  const dispatch = useDispatch();
  const status = useSelector(selectQ2DataStatus);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchQ2Data());
    }
  }, [dispatch, status]);

  if (status === "loading") return <p>Loading Q2 data...</p>;
  if (status === "failed") return <p>Failed to load Q2 data.</p>;
  if (status !== "succeeded") return null;

  return (
    <>
      <Q2ControlBar />
      <div className="panels-row">
        <AreaChartContainer />
      </div>
      <div className="panels-row">
        <div className="boxplot-panel">
          <h3 className="panel-title">Net Balance Distribution (per resident)</h3>
          <p style={{ color: "#999" }}>Panel E — coming next</p>
        </div>
      </div>
      <div className="panels-row">
        <ResidentScatterContainer />
      </div>
      <Q2Tooltip />
    </>
  );
}
```

**Step 4: Verify**

- Stacked area chart renders with 4 warm-colored expense layers and blue income line
- Legend in top-right
- Click a cluster button: areas transition to cluster medians, dashed reference lines appear
- Click again: transitions back to full population

**Step 5: Commit**

```bash
git add client/src/components/q2/areachart/ client/src/components/Q2Dashboard.jsx
git commit -m "feat(q2): implement Panel D — stacked area chart (income vs cost of living)"
```

---

## Task 9: Panel E — Box Plots

**Files:**
- Create: `client/src/components/q2/boxplot/BoxPlotD3.js`
- Create: `client/src/components/q2/boxplot/BoxPlotContainer.jsx`
- Modify: `client/src/components/Q2Dashboard.jsx`

**Step 1: Create BoxPlotD3.js**

```js
// client/src/components/q2/boxplot/BoxPlotD3.js
import * as d3 from "d3";

export default class BoxPlotD3 {
  constructor(container, controllerMethods) {
    this.container = container;
    this.controllerMethods = controllerMethods;
  }

  create({ width, height }) {
    this.width = width;
    this.height = height;
    this.margins = { top: 20, right: 30, bottom: 40, left: 80 };
    this.innerWidth = width - this.margins.left - this.margins.right;
    this.innerHeight = height - this.margins.top - this.margins.bottom;

    this.svg = d3.select(this.container)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height);

    this.mainG = this.svg.append("g")
      .attr("transform", `translate(${this.margins.left},${this.margins.top})`);

    this.zeroLineG = this.mainG.append("g").attr("class", "zero-line");
    this.boxesG = this.mainG.append("g").attr("class", "boxes");
    this.referenceG = this.mainG.append("g").attr("class", "reference");
    this.highlightG = this.mainG.append("g").attr("class", "highlight-dots");
    this.xAxisG = this.mainG.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${this.innerHeight})`);
    this.yAxisG = this.mainG.append("g")
      .attr("class", "y-axis");

    // Y axis label
    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", -this.innerHeight / 2)
      .attr("y", -60)
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("font-size", "12px")
      .text("Net balance ($)");
  }

  update(boxStats, referenceStats, selectedCluster) {
    const { innerWidth, innerHeight } = this;
    const controllerMethods = this.controllerMethods;

    const months = boxStats.map((d) => d.month);
    this.xScale = d3.scaleBand().domain(months).range([0, innerWidth]).padding(0.3);
    this.months = months;

    const allValues = boxStats.flatMap((d) => [d.whiskerLow, d.whiskerHigh]);
    const yMin = Math.min(d3.min(allValues), 0);
    const yMax = d3.max(allValues);
    this.yScale = d3.scaleLinear().domain([yMin, yMax]).range([innerHeight, 0]).nice();

    const xScale = this.xScale;
    const yScale = this.yScale;
    const bw = xScale.bandwidth();

    // Zero reference line
    this.zeroLineG.selectAll("*").remove();
    this.zeroLineG.append("line")
      .attr("x1", 0).attr("x2", innerWidth)
      .attr("y1", yScale(0)).attr("y2", yScale(0))
      .attr("stroke", "#d32f2f").attr("stroke-dasharray", "6,3").attr("stroke-width", 1);

    // Box groups
    const boxG = this.boxesG.selectAll("g.box-group")
      .data(boxStats, (d) => d.month)
      .join(
        (enter) => {
          const g = enter.append("g").attr("class", "box-group")
            .attr("transform", (d) => `translate(${xScale(d.month)}, 0)`);

          // Whisker top line
          g.append("line").attr("class", "whisker-top")
            .attr("x1", bw / 2).attr("x2", bw / 2)
            .attr("y1", (d) => yScale(d.whiskerHigh)).attr("y2", (d) => yScale(d.q3))
            .attr("stroke", "#555").attr("stroke-width", 1);

          // Whisker top cap
          g.append("line").attr("class", "cap-top")
            .attr("x1", bw * 0.25).attr("x2", bw * 0.75)
            .attr("y1", (d) => yScale(d.whiskerHigh)).attr("y2", (d) => yScale(d.whiskerHigh))
            .attr("stroke", "#555").attr("stroke-width", 1);

          // Box
          g.append("rect").attr("class", "box")
            .attr("x", 0).attr("width", bw)
            .attr("y", (d) => yScale(d.q3))
            .attr("height", (d) => Math.max(0, yScale(d.q1) - yScale(d.q3)))
            .attr("fill", "#78909c").attr("opacity", 0.7)
            .attr("stroke", "#455a64").attr("stroke-width", 1);

          // Median line
          g.append("line").attr("class", "median")
            .attr("x1", 0).attr("x2", bw)
            .attr("y1", (d) => yScale(d.median)).attr("y2", (d) => yScale(d.median))
            .attr("stroke", "#263238").attr("stroke-width", 2);

          // Whisker bottom line
          g.append("line").attr("class", "whisker-bottom")
            .attr("x1", bw / 2).attr("x2", bw / 2)
            .attr("y1", (d) => yScale(d.q1)).attr("y2", (d) => yScale(d.whiskerLow))
            .attr("stroke", "#555").attr("stroke-width", 1);

          // Whisker bottom cap
          g.append("line").attr("class", "cap-bottom")
            .attr("x1", bw * 0.25).attr("x2", bw * 0.75)
            .attr("y1", (d) => yScale(d.whiskerLow)).attr("y2", (d) => yScale(d.whiskerLow))
            .attr("stroke", "#555").attr("stroke-width", 1);

          // Outlier dots
          g.each(function (d) {
            d3.select(this).selectAll("circle.outlier")
              .data(d.outliers)
              .join("circle")
              .attr("class", "outlier")
              .attr("cx", bw / 2)
              .attr("cy", (v) => yScale(v))
              .attr("r", 2)
              .attr("fill", "#78909c")
              .attr("opacity", 0.5);
          });

          // Invisible hover rect for interaction
          g.append("rect").attr("class", "hover-rect")
            .attr("x", 0).attr("width", bw)
            .attr("y", 0).attr("height", innerHeight)
            .attr("fill", "transparent")
            .on("mouseenter", (event, d) => controllerMethods.handleMonthHover(d.month))
            .on("mouseleave", () => controllerMethods.handleMonthUnhover());

          return g;
        },
        (update) => {
          update.transition().duration(500)
            .attr("transform", (d) => `translate(${xScale(d.month)}, 0)`);

          update.select(".whisker-top").transition().duration(500)
            .attr("y1", (d) => yScale(d.whiskerHigh)).attr("y2", (d) => yScale(d.q3));
          update.select(".cap-top").transition().duration(500)
            .attr("y1", (d) => yScale(d.whiskerHigh)).attr("y2", (d) => yScale(d.whiskerHigh));
          update.select(".box").transition().duration(500)
            .attr("y", (d) => yScale(d.q3))
            .attr("height", (d) => Math.max(0, yScale(d.q1) - yScale(d.q3)));
          update.select(".median").transition().duration(500)
            .attr("y1", (d) => yScale(d.median)).attr("y2", (d) => yScale(d.median));
          update.select(".whisker-bottom").transition().duration(500)
            .attr("y1", (d) => yScale(d.q1)).attr("y2", (d) => yScale(d.whiskerLow));
          update.select(".cap-bottom").transition().duration(500)
            .attr("y1", (d) => yScale(d.whiskerLow)).attr("y2", (d) => yScale(d.whiskerLow));

          update.each(function (d) {
            d3.select(this).selectAll("circle.outlier")
              .data(d.outliers)
              .join("circle")
              .attr("class", "outlier")
              .attr("cx", bw / 2)
              .transition().duration(500)
              .attr("cy", (v) => yScale(v))
              .attr("r", 2)
              .attr("fill", "#78909c")
              .attr("opacity", 0.5);
          });

          return update;
        },
        (exit) => exit.remove()
      );

    // Reference trend line (full-pop medians when cluster focused)
    this.referenceG.selectAll("*").remove();
    if (selectedCluster !== null && referenceStats) {
      const refLine = d3.line()
        .x((d) => xScale(d.month) + bw / 2)
        .y((d) => yScale(d.median))
        .curve(d3.curveMonotoneX);

      this.referenceG.append("path")
        .attr("d", refLine(referenceStats))
        .attr("fill", "none")
        .attr("stroke", "#999")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "6,4")
        .attr("opacity", 0.5);

      this.referenceG.append("text")
        .attr("x", xScale(referenceStats[referenceStats.length - 1].month) + bw + 5)
        .attr("y", yScale(referenceStats[referenceStats.length - 1].median))
        .attr("font-size", "10px").attr("fill", "#999")
        .text("All residents median");
    }

    // Axes
    this.xAxisG.transition().duration(500).call(
      d3.axisBottom(xScale).tickFormat((m) => d3.timeFormat("%b %y")(new Date(m)))
    );
    this.yAxisG.transition().duration(500).call(
      d3.axisLeft(yScale).tickFormat(d3.format("~s"))
    );
  }

  updateHighlighting(hoveredResidentId, selectedResidentIds, monthly, colorScale) {
    this.highlightG.selectAll("*").remove();

    if (!this.xScale || !this.yScale) return;

    const xScale = this.xScale;
    const yScale = this.yScale;
    const bw = xScale.bandwidth();
    const idsToShow = [];

    if (hoveredResidentId !== null) {
      idsToShow.push({ id: hoveredResidentId, r: 4, opacity: 1 });
    }
    selectedResidentIds.forEach((id) => {
      if (id !== hoveredResidentId) {
        idsToShow.push({ id, r: 3, opacity: 0.8 });
      }
    });

    if (idsToShow.length === 0 || !monthly || monthly.length === 0) return;

    idsToShow.forEach(({ id, r, opacity }) => {
      const records = monthly.filter((m) => m.participantId === id);
      const color = colorScale ? colorScale(id) : "#1565c0";

      this.highlightG.selectAll(`circle.hl-${id}`)
        .data(records, (d) => d.month)
        .join("circle")
        .attr("class", `hl-${id}`)
        .attr("cx", (d) => xScale(d.month) + bw / 2)
        .attr("cy", (d) => yScale(d.net_balance))
        .attr("r", r)
        .attr("fill", color)
        .attr("stroke", "#000")
        .attr("stroke-width", 0.5)
        .attr("opacity", opacity);
    });
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
```

**Step 2: Create BoxPlotContainer.jsx**

```jsx
// client/src/components/q2/boxplot/BoxPlotContainer.jsx
import { useRef, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectQ2Monthly, selectQ2Residents, selectQ2Clusters } from "../../../store/Q2DataSlice.js";
import {
  selectHoveredResident,
  selectSelectedResidents,
  selectSelectedCluster,
  setHoveredMonth,
} from "../../../store/Q2InteractionSlice.js";
import BoxPlotD3 from "./BoxPlotD3.js";
import * as d3 from "d3";

function computeBoxStats(monthly, residents, selectedCluster) {
  const activeIds = selectedCluster !== null
    ? new Set(residents.filter((r) => r.cluster === selectedCluster).map((r) => r.participantId))
    : null;

  const byMonth = d3.groups(monthly, (d) => d.month);
  return byMonth.map(([month, records]) => {
    const filtered = activeIds ? records.filter((r) => activeIds.has(r.participantId)) : records;
    const values = filtered.map((r) => r.net_balance).sort(d3.ascending);
    const q1 = d3.quantile(values, 0.25);
    const median = d3.quantile(values, 0.5);
    const q3 = d3.quantile(values, 0.75);
    const iqr = q3 - q1;
    const whiskerLow = Math.max(d3.min(values), q1 - 1.5 * iqr);
    const whiskerHigh = Math.min(d3.max(values), q3 + 1.5 * iqr);
    const outliers = values.filter((v) => v < whiskerLow || v > whiskerHigh);
    return { month, q1, median, q3, whiskerLow, whiskerHigh, outliers };
  }).sort((a, b) => new Date(a.month) - new Date(b.month));
}

export default function BoxPlotContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);
  const dispatch = useDispatch();

  const monthly = useSelector(selectQ2Monthly);
  const residents = useSelector(selectQ2Residents);
  const clusters = useSelector(selectQ2Clusters);
  const hoveredId = useSelector(selectHoveredResident);
  const selectedIds = useSelector(selectSelectedResidents);
  const selectedCluster = useSelector(selectSelectedCluster);

  const fullPopStats = useMemo(
    () => computeBoxStats(monthly, residents, null),
    [monthly, residents]
  );

  const currentStats = useMemo(
    () => selectedCluster !== null
      ? computeBoxStats(monthly, residents, selectedCluster)
      : fullPopStats,
    [monthly, residents, selectedCluster, fullPopStats]
  );

  const controllerMethods = useMemo(
    () => ({
      handleMonthHover: (month) => dispatch(setHoveredMonth(month)),
      handleMonthUnhover: () => dispatch(setHoveredMonth(null)),
    }),
    [dispatch]
  );

  // Build a color scale for highlight dots: participantId → cluster color
  const residentColorScale = useMemo(() => {
    const clusterColorMap = {};
    clusters.forEach((c) => { clusterColorMap[c.cluster] = c.color; });
    const map = {};
    residents.forEach((r) => { map[r.participantId] = clusterColorMap[r.cluster] || "#1565c0"; });
    return (id) => map[id] || "#1565c0";
  }, [residents, clusters]);

  useEffect(() => {
    const instance = new BoxPlotD3(ref.current, controllerMethods);
    instance.create({ width: 700, height: 350 });
    d3Ref.current = instance;
    return () => instance.clear();
  }, [controllerMethods]);

  useEffect(() => {
    if (d3Ref.current && currentStats.length > 0) {
      const refStats = selectedCluster !== null ? fullPopStats : null;
      d3Ref.current.update(currentStats, refStats, selectedCluster);
    }
  }, [currentStats, fullPopStats, selectedCluster]);

  useEffect(() => {
    if (d3Ref.current) {
      d3Ref.current.updateHighlighting(hoveredId, selectedIds, monthly, residentColorScale);
    }
  }, [hoveredId, selectedIds, monthly, residentColorScale]);

  return <div ref={ref} className="boxplot-panel"><h3 className="panel-title">Net Balance Distribution (per resident)</h3></div>;
}
```

**Step 3: Final Q2Dashboard.jsx**

```jsx
// client/src/components/Q2Dashboard.jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchQ2Data, selectQ2DataStatus } from "../store/Q2DataSlice.js";
import Q2ControlBar from "./q2/controlbar/Q2ControlBar.jsx";
import AreaChartContainer from "./q2/areachart/AreaChartContainer.jsx";
import BoxPlotContainer from "./q2/boxplot/BoxPlotContainer.jsx";
import ResidentScatterContainer from "./q2/residentscatter/ResidentScatterContainer.jsx";
import Q2Tooltip from "./q2/tooltip/Q2Tooltip.jsx";

export default function Q2Dashboard() {
  const dispatch = useDispatch();
  const status = useSelector(selectQ2DataStatus);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchQ2Data());
    }
  }, [dispatch, status]);

  if (status === "loading") return <p>Loading Q2 data...</p>;
  if (status === "failed") return <p>Failed to load Q2 data.</p>;
  if (status !== "succeeded") return null;

  return (
    <>
      <Q2ControlBar />
      <div className="panels-row">
        <AreaChartContainer />
      </div>
      <div className="panels-row">
        <BoxPlotContainer />
      </div>
      <div className="panels-row">
        <ResidentScatterContainer />
      </div>
      <Q2Tooltip />
    </>
  );
}
```

**Step 4: Verify**

- Box plots render for 15 months with boxes, whiskers, outliers
- Red dashed zero reference line visible
- Hover a box: tooltip shows month stats
- Click a cluster: boxes transition, dashed reference trend appears
- Hover a dot in Panel F: highlight dots appear on box plots showing that resident's net_balance per month
- Select a dot: persistent highlight dots

**Step 5: Commit**

```bash
git add client/src/components/q2/boxplot/ client/src/components/Q2Dashboard.jsx
git commit -m "feat(q2): implement Panel E — box plots with highlight dots and focus+context"
```

---

## Task 10: Final Integration & Polish

**Files:**
- Possibly minor tweaks to any of the above files

**Step 1: End-to-end test**

Start both servers. Walk through the full Q2 user flow:

1. Click Q2 tab → data loads, all 3 panels render
2. Panel D: stacked area shows income line above expense areas
3. Panel E: box plots show distribution per month, zero line visible
4. Panel F: 1,011 colored dots in quadrants
5. Click a cluster button → all 3 panels transition to focus+context
6. Click same button → back to full population
7. Hover a dot in Panel F → tooltip shows resident info, highlight dots appear in Panel E
8. Click a dot → selection persists
9. Click "Clear selection" → clears
10. Switch to Q1 tab → Q1 works as before
11. Switch back to Q2 → data still loaded, no re-fetch

**Step 2: Fix any visual/interaction issues found during testing**

Common things to check:
- SVG dimensions fit within panel borders
- Axis labels not clipped
- Tooltips position correctly near viewport edges
- Transitions smooth (no flickering)
- Colors consistent between legend, dots, and buttons

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(q2): complete Q2 resident financial health dashboard

Three coordinated views:
- Panel D: stacked area chart (median income vs cost of living)
- Panel E: box plots (net balance distribution per month)
- Panel F: clustered resident scatter (income slope vs net balance slope)

Focus+context interaction via cluster toggle buttons.
Brushing & linking across all three panels."
```

---

## Summary of all tasks

| Task | What | Key files |
|---|---|---|
| 1 | Preprocessing pipeline | `server/preprocess_q2.py`, 3 JSON outputs |
| 2 | Flask API endpoint | `server/app.py` |
| 3 | Navigation slice + TabBar | `NavigationSlice.js`, `TabBar.jsx`, CSS |
| 4 | Q2 Redux slices | `Q2DataSlice.js`, `Q2InteractionSlice.js`, `store.js` |
| 5 | Extract Q1Dashboard + restructure App | `Q1Dashboard.jsx`, `App.jsx` |
| 6 | Q2Dashboard shell + ControlBar + Tooltip | `Q2Dashboard.jsx`, `Q2ControlBar.jsx`, `Q2Tooltip.jsx` |
| 7 | Panel F — Resident scatter | `ResidentScatterD3.js`, `ResidentScatterContainer.jsx` |
| 8 | Panel D — Stacked area chart | `AreaChartD3.js`, `AreaChartContainer.jsx` |
| 9 | Panel E — Box plots | `BoxPlotD3.js`, `BoxPlotContainer.jsx` |
| 10 | Final integration & polish | All files, end-to-end testing |
