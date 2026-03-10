"""
VAST Challenge 2022 — Preprocessing for D3.js visualization
Produces server/data/monthly.json and server/data/employers.json
Run from project root: python server/preprocess.py
"""

import duckdb
import pandas as pd
import numpy as np
import os
import json
import time

# ── Paths (relative to project root, not to this script) ─────────────────────
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGS_GLOB = os.path.join(BASE, "VAST-Challenge-2022", "Datasets", "Activity Logs", "*.csv").replace("\\", "/")
FIN_CSV = os.path.join(BASE, "VAST-Challenge-2022", "Datasets", "Journals", "FinancialJournal.csv").replace("\\", "/")
JOBS_CSV = os.path.join(BASE, "VAST-Challenge-2022", "Datasets", "Attributes", "Jobs.csv").replace("\\", "/")
DATA_DIR = os.path.join(BASE, "server", "data")
os.makedirs(DATA_DIR, exist_ok=True)

LOGS_READ = f"read_csv_auto('{LOGS_GLOB}', union_by_name=true, nullstr='NA')"

# ── Connect ───────────────────────────────────────────────────────────────────
print("Connecting to DuckDB...")
con = duckdb.connect()

# ── Payroll query ─────────────────────────────────────────────────────────────
print("Querying monthly payroll (this reads ~17 GB, may take a few minutes)...")
t0 = time.time()
df_payroll = con.execute(f"""
    WITH monthly_job AS (
        SELECT
            participantId,
            date_trunc('month', timestamp::TIMESTAMP) AS month,
            LAST(jobId ORDER BY timestamp::TIMESTAMP) AS jobId
        FROM {LOGS_READ}
        WHERE jobId IS NOT NULL
        GROUP BY participantId, date_trunc('month', timestamp::TIMESTAMP)
    ),
    wages AS (
        SELECT
            participantId,
            date_trunc('month', timestamp::TIMESTAMP) AS month,
            SUM(amount) AS wage_amount
        FROM read_csv_auto('{FIN_CSV}')
        WHERE category = 'Wage'
        GROUP BY participantId, date_trunc('month', timestamp::TIMESTAMP)
    )
    SELECT
        j.employerId,
        w.month,
        SUM(w.wage_amount)             AS total_wages,
        COUNT(DISTINCT w.participantId) AS employee_count
    FROM wages w
    JOIN monthly_job mj ON w.participantId = mj.participantId AND w.month = mj.month
    JOIN read_csv_auto('{JOBS_CSV}') j ON mj.jobId = j.jobId
    GROUP BY j.employerId, w.month
    ORDER BY j.employerId, w.month
""").fetchdf()
print(f"  Query done in {time.time()-t0:.1f}s — {len(df_payroll)} rows")

# ── Convert month to datetime ─────────────────────────────────────────────────
df_payroll['month'] = pd.to_datetime(df_payroll['month'])

# ── Slope computation ─────────────────────────────────────────────────────────
print("Computing slopes...")

def compute_slope(group, value_col='total_wages'):
    vals = group[value_col].values.astype(float)
    if len(vals) < 3:
        return 0.0
    x = np.arange(len(vals), dtype=float)
    xm, ym = x.mean(), vals.mean()
    denom = ((x - xm) ** 2).sum()
    if denom == 0:
        return 0.0
    return float(((x - xm) * (vals - ym)).sum() / denom)

# ── Employer summary ──────────────────────────────────────────────────────────
print("Building employer summary...")
employer_summary = df_payroll.groupby('employerId').agg(
    total_wages=('total_wages', 'sum'),
    avg_employees=('employee_count', 'mean'),
    months_active=('month', 'nunique')
).reset_index()

wage_slopes = df_payroll.sort_values('month').groupby('employerId').apply(
    lambda g: compute_slope(g, 'total_wages'), include_groups=False
).reset_index()
wage_slopes.columns = ['employerId', 'wage_slope']

employee_slopes = df_payroll.sort_values('month').groupby('employerId').apply(
    lambda g: compute_slope(g, 'employee_count'), include_groups=False
).reset_index()
employee_slopes.columns = ['employerId', 'employee_slope']

employer_summary = employer_summary.merge(wage_slopes, on='employerId')
employer_summary = employer_summary.merge(employee_slopes, on='employerId')
print(f"  {len(employer_summary)} employers")

# ── Export monthly.json ───────────────────────────────────────────────────────
print("Exporting monthly.json...")
df_monthly_out = df_payroll.copy()
df_monthly_out['month'] = df_monthly_out['month'].dt.strftime('%Y-%m-%d')
df_monthly_out['employerId'] = df_monthly_out['employerId'].astype(int)
df_monthly_out['employee_count'] = df_monthly_out['employee_count'].astype(int)
df_monthly_out['total_wages'] = df_monthly_out['total_wages'].astype(float)

monthly_records = df_monthly_out.to_dict(orient='records')
# Replace any NaN/Infinity with None for JSON safety
for rec in monthly_records:
    for k, v in rec.items():
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
            rec[k] = None

monthly_path = os.path.join(DATA_DIR, "monthly.json")
with open(monthly_path, 'w') as f:
    json.dump(monthly_records, f)
print(f"  {monthly_path} — {len(monthly_records)} records")

# ── Export employers.json ─────────────────────────────────────────────────────
print("Exporting employers.json...")
emp_out = employer_summary.copy()
emp_out['employerId'] = emp_out['employerId'].astype(int)
emp_out['months_active'] = emp_out['months_active'].astype(int)
for col in ['total_wages', 'avg_employees', 'wage_slope', 'employee_slope']:
    emp_out[col] = emp_out[col].astype(float)

emp_records = emp_out.to_dict(orient='records')
for rec in emp_records:
    for k, v in rec.items():
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
            rec[k] = None

emp_path = os.path.join(DATA_DIR, "employers.json")
with open(emp_path, 'w') as f:
    json.dump(emp_records, f)
print(f"  {emp_path} — {len(emp_records)} records")

print("Done.")
con.close()
