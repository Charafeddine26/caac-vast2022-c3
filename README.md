# CAAC - VAST 2022 Challenge 3

Employer Prosperity Dashboard for the VAST Challenge 2022 (Mini-Challenge 3).
Interactive visualization of employer payroll trends across a simulated city of 1,011 participants tracked over 15 months.

## Prerequisites

- Python 3.10+
- Node.js 18+
- The VAST Challenge 2022 dataset (required only for preprocessing)

## Project Structure

```
client/          React + Vite frontend (D3.js visualizations)
server/          Flask API + data preprocessing
server/data/     Precomputed JSON (included, ready to use)
```

## Quick Start

The preprocessed data is already included in `server/data/`. You only need to run the backend and frontend.

**1. Install dependencies**

```bash
# Backend
cd server
pip install -r requirements.txt

# Frontend
cd ../client
npm install
```

**2. Start the backend** (from project root)

```bash
python server/app.py
```

Runs on http://localhost:5000

**3. Start the frontend** (from client/)

```bash
cd client
npm run dev
```

Runs on http://localhost:5173

## Regenerating Data (optional)

If you have the VAST 2022 dataset placed at `VAST-Challenge-2022/Datasets/`, you can regenerate the JSON files:

```bash
python server/preprocess.py
```

This reads ~17 GB of CSVs via DuckDB and outputs `server/data/monthly.json` and `server/data/employers.json`.

## Tech Stack

| Layer      | Stack                              |
|------------|------------------------------------|
| Frontend   | React 19, Vite 6, D3.js 7, Redux Toolkit 2 |
| Backend    | Flask, Flask-CORS                  |
| Processing | DuckDB, Pandas, NumPy             |

## Team

Charafeddine, Ardian, Aurelien, Carla
