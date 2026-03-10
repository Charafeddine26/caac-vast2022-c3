"""
VAST Challenge 2022 — Flask API server
Serves precomputed JSON data to the D3.js frontend.
Run from project root: python server/app.py
"""

import json
import os
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server", "data")


@app.route("/api/data")
def get_data():
    with open(os.path.join(DATA_DIR, "monthly.json")) as f:
        monthly = json.load(f)
    with open(os.path.join(DATA_DIR, "employers.json")) as f:
        employers = json.load(f)
    return jsonify({"monthly": monthly, "employers": employers})


if __name__ == "__main__":
    app.run(port=5000, debug=True)
