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
