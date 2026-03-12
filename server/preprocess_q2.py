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
