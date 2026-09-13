"""
NYC Taxi Fare Prediction API
============================

Flask backend serving the Random Forest model trained in
Level2_Modelling_Part_B.ipynb.

The inference pipeline mirrors the notebook EXACTLY, in this order:
    1. Clean raw coordinates (swap transposed pairs, zeros -> NaN)
    2. Engineer all 31 numeric features
    3. One-hot encode the 4 categorical columns  -> 47 columns
    4. Median-impute (imputer.pkl was fit AFTER encoding)
    5. Standard-scale
    6. Predict

Run:
    python app.py
"""

import os
import pickle
import traceback
from datetime import datetime

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Resolve paths relative to THIS file, not the current working directory.
# This is what caused your earlier FileNotFoundError.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(BASE_DIR, "taxi_fare_model.pkl")
SCALER_PATH = os.path.join(BASE_DIR, "scaler.pkl")
ENCODER_PATH = os.path.join(BASE_DIR, "encoder.pkl")
IMPUTER_PATH = os.path.join(BASE_DIR, "imputer.pkl")

# Airport reference coordinates (notebook cell 2.5)
JFK = (40.6413, -73.7781)
LGA = (40.7769, -73.8740)
EWR = (40.6895, -74.1745)

# The four columns the OneHotEncoder was fitted on, in fit order.
COLS_TO_ENCODE = ["pickup_borough", "dropoff_borough", "weather_condition", "rate_regime"]

# The 31 numeric columns, in the exact order they appear in X_train
# after the categorical columns were dropped. Order is critical: the
# scaler and imputer are positional.
NUMERIC_COLS = [
    "pickup_latitude",
    "pickup_longitude",
    "dropoff_latitude",
    "dropoff_longitude",
    "passenger_count",
    "temperature_f",
    "precipitation_in",
    "wind_speed_mph",
    "traffic_index",
    "is_holiday",
    "hav_miles",
    "month",
    "day",
    "hour",
    "dayofweek",
    "weekofyear",
    "is_weekend",
    "is_rush",
    "is_night",
    "hour_sin",
    "hour_cos",
    "month_sin",
    "month_cos",
    "dist_to_JFK",
    "dist_to_EWR",
    "dist_to_LGA",
    "is_airport",
    "cross_borough",
    "abs_dlat",
    "abs_dlon",
    "manhattan_dist",
]

# Fields the client must supply.
REQUIRED_FIELDS = [
    "pickup_latitude",
    "pickup_longitude",
    "dropoff_latitude",
    "dropoff_longitude",
    "pickup_borough",
    "dropoff_borough",
    "passenger_count",
    "weather_condition",
    "temperature_f",
    "precipitation_in",
    "wind_speed_mph",
    "traffic_index",
    "is_holiday",
    "pickup_datetime",
]

# Human-readable names for the engineered pricing regime.
REGIME_NAMES = {
    1: "Standard metered",
    2: "JFK flat fare",
    3: "Newark",
    4: "Out-of-city flat",
}

# Sentinel used when a categorical value is missing. handle_unknown='ignore'
# encodes it as all-zeros, which is exactly how drop='first' represents the
# dropped baseline category -- so this degrades gracefully instead of crashing.
UNKNOWN_SENTINEL = "__MISSING__"


# ---------------------------------------------------------------------------
# Load artifacts once at startup
# ---------------------------------------------------------------------------

def _load(path, label):
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"{label} not found at {path}\n"
            f"Copy the .pkl files exported by the notebook into: {BASE_DIR}"
        )
    with open(path, "rb") as f:
        return pickle.load(f)


print("Loading artifacts...")
model = _load(MODEL_PATH, "Model")
scaler = _load(SCALER_PATH, "Scaler")
encoder = _load(ENCODER_PATH, "Encoder")
imputer = _load(IMPUTER_PATH, "Imputer")

# Names of the 16 one-hot columns, taken from the fitted encoder so they
# always match whatever it actually learned.
ENCODED_COLS = list(encoder.get_feature_names_out(COLS_TO_ENCODE))

# Full 47-column layout: numerics first, then the one-hot block.
FEATURE_COLS = NUMERIC_COLS + ENCODED_COLS

# If the artifacts recorded their own column names, trust those instead.
# Guards against any drift between this file and the pickles.
if hasattr(scaler, "feature_names_in_"):
    FEATURE_COLS = list(scaler.feature_names_in_)

print(f"  model    : {type(model).__name__}")
print(f"  features : {len(FEATURE_COLS)} columns")
print("Ready.\n")


# ---------------------------------------------------------------------------
# Feature engineering (mirrors notebook sections 2.1 - 2.7)
# ---------------------------------------------------------------------------

def haversine_miles(lat1, lon1, lat2, lon2):
    """Great-circle distance in miles. Same formula as the notebook."""
    R = 3958.8
    p = np.pi / 180
    a = (
        np.sin((lat2 - lat1) * p / 2) ** 2
        + np.cos(lat1 * p) * np.cos(lat2 * p) * np.sin((lon2 - lon1) * p / 2) ** 2
    )
    return 2 * R * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def parse_datetime(value):
    """
    Accept both formats the notebook handled, plus a few common variants.
    Returns a pandas Timestamp.
    """
    if isinstance(value, (datetime, pd.Timestamp)):
        return pd.Timestamp(value)

    text = str(value).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S"):
        try:
            return pd.Timestamp(datetime.strptime(text, fmt))
        except ValueError:
            continue

    # ISO-8601 with a 'T' separator, e.g. from a browser datetime-local input
    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        raise ValueError(
            f"Could not parse pickup_datetime: {value!r}. "
            "Use 'YYYY-MM-DD HH:MM:SS' or 'DD/MM/YYYY HH:MM'."
        )
    return parsed


def to_float(value):
    """Coerce to float, mapping None / '' / 'null' to NaN."""
    if value is None or value == "":
        return np.nan
    try:
        out = float(value)
    except (TypeError, ValueError):
        return np.nan
    return np.nan if np.isnan(out) else out


def clean_coordinates(p_lat, p_lon, d_lat, d_lon):
    """
    Notebook section 1.2.

    NYC is at roughly +40.7 lat / -74.0 lon. A negative latitude paired with a
    positive longitude means the two fields were transposed -> swap them back.
    An exact zero is a GPS unit that never got a fix -> NaN, so the median
    imputer fills it. Leaving zeros in would place the trip in the Atlantic
    and poison every distance feature.
    """
    if not np.isnan(p_lat) and not np.isnan(p_lon) and p_lat < 0 and p_lon > 0:
        p_lat, p_lon = p_lon, p_lat
    if not np.isnan(d_lat) and not np.isnan(d_lon) and d_lat < 0 and d_lon > 0:
        d_lat, d_lon = d_lon, d_lat

    p_lat = np.nan if p_lat == 0 else p_lat
    p_lon = np.nan if p_lon == 0 else p_lon
    d_lat = np.nan if d_lat == 0 else d_lat
    d_lon = np.nan if d_lon == 0 else d_lon

    return p_lat, p_lon, d_lat, d_lon


def derive_rate_regime(p_jfk, d_jfk, p_ewr, d_ewr, p_borough, d_borough):
    """
    Notebook section 2.5. Precedence runs 4 -> 3 -> 2 -> 1, so the checks
    below are ordered lowest-priority first and later ones overwrite.

    Everything here is a plain Python float / str -- never a pandas Series --
    so `and` / `or` behave normally.
    """
    regime = 1  # standard metered

    jfk_flat = (
        (not np.isnan(p_jfk) and p_jfk < 2.0 and d_borough == "Manhattan")
        or (not np.isnan(d_jfk) and d_jfk < 2.0 and p_borough == "Manhattan")
    )
    if jfk_flat:
        regime = 2

    newark = (not np.isnan(p_ewr) and p_ewr < 3.0) or (not np.isnan(d_ewr) and d_ewr < 3.0)
    if newark:
        regime = 3

    if p_borough == "Staten Island" or d_borough == "Staten Island":
        regime = 4

    return regime


def build_features(payload):
    """
    Turn one raw JSON payload into a single-row DataFrame of 47 columns,
    ordered to match what the imputer and scaler were fitted on.
    """
    # --- raw values, as scalars ------------------------------------------
    p_lat = to_float(payload.get("pickup_latitude"))
    p_lon = to_float(payload.get("pickup_longitude"))
    d_lat = to_float(payload.get("dropoff_latitude"))
    d_lon = to_float(payload.get("dropoff_longitude"))

    p_lat, p_lon, d_lat, d_lon = clean_coordinates(p_lat, p_lon, d_lat, d_lon)

    p_borough = str(payload.get("pickup_borough", "")).strip()
    d_borough = str(payload.get("dropoff_borough", "")).strip()

    # Notebook 1.6 normalised weather with .str.strip().str.title()
    weather = str(payload.get("weather_condition", "")).strip().title()
    if not weather:
        weather = UNKNOWN_SENTINEL

    passenger_count = to_float(payload.get("passenger_count"))
    # Notebook 1.7: values outside 1-6 are impossible -> NaN, not clipped
    if not np.isnan(passenger_count) and (passenger_count < 1 or passenger_count > 6):
        passenger_count = np.nan

    temperature_f = to_float(payload.get("temperature_f"))
    # Notebook 1.7: -999 is the missing-reading sentinel
    if not np.isnan(temperature_f) and temperature_f <= -100:
        temperature_f = np.nan

    precipitation_in = to_float(payload.get("precipitation_in"))
    wind_speed_mph = to_float(payload.get("wind_speed_mph"))
    traffic_index = to_float(payload.get("traffic_index"))
    is_holiday = int(to_float(payload.get("is_holiday")) or 0)

    # --- distances (2.1, 2.5, 2.7) ---------------------------------------
    hav_miles = float(haversine_miles(p_lat, p_lon, d_lat, d_lon))

    p_jfk = float(haversine_miles(p_lat, p_lon, *JFK))
    d_jfk = float(haversine_miles(d_lat, d_lon, *JFK))
    p_ewr = float(haversine_miles(p_lat, p_lon, *EWR))
    d_ewr = float(haversine_miles(d_lat, d_lon, *EWR))
    p_lga = float(haversine_miles(p_lat, p_lon, *LGA))
    d_lga = float(haversine_miles(d_lat, d_lon, *LGA))

    dist_to_JFK = float(np.minimum(p_jfk, d_jfk))
    dist_to_EWR = float(np.minimum(p_ewr, d_ewr))
    dist_to_LGA = float(np.minimum(p_lga, d_lga))

    rate_regime = derive_rate_regime(p_jfk, d_jfk, p_ewr, d_ewr, p_borough, d_borough)

    is_airport = int(
        (dist_to_JFK < 2) or (dist_to_LGA < 2) or (dist_to_EWR < 3)
    ) if not np.isnan(dist_to_JFK) else 0

    cross_borough = int(p_borough != d_borough)
    abs_dlat = abs(d_lat - p_lat)
    abs_dlon = abs(d_lon - p_lon)
    manhattan_dist = float(
        haversine_miles(p_lat, p_lon, d_lat, p_lon)
        + haversine_miles(d_lat, p_lon, d_lat, d_lon)
    )

    # --- datetime components (2.4) ---------------------------------------
    dt = parse_datetime(payload.get("pickup_datetime"))
    month = int(dt.month)
    day = int(dt.day)
    hour = int(dt.hour)
    dayofweek = int(dt.dayofweek)
    weekofyear = int(dt.isocalendar()[1])

    is_weekend = int(dayofweek >= 5)
    is_rush = int(hour in (7, 8, 9, 16, 17, 18, 19))
    is_night = int(hour >= 22 or hour <= 5)

    hour_sin = float(np.sin(2 * np.pi * hour / 24))
    hour_cos = float(np.cos(2 * np.pi * hour / 24))
    month_sin = float(np.sin(2 * np.pi * month / 12))
    month_cos = float(np.cos(2 * np.pi * month / 12))

    # --- assemble the numeric block --------------------------------------
    numeric = {
        "pickup_latitude": p_lat,
        "pickup_longitude": p_lon,
        "dropoff_latitude": d_lat,
        "dropoff_longitude": d_lon,
        "passenger_count": passenger_count,
        "temperature_f": temperature_f,
        "precipitation_in": precipitation_in,
        "wind_speed_mph": wind_speed_mph,
        "traffic_index": traffic_index,
        "is_holiday": is_holiday,
        "hav_miles": hav_miles,
        "month": month,
        "day": day,
        "hour": hour,
        "dayofweek": dayofweek,
        "weekofyear": weekofyear,
        "is_weekend": is_weekend,
        "is_rush": is_rush,
        "is_night": is_night,
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "month_sin": month_sin,
        "month_cos": month_cos,
        "dist_to_JFK": dist_to_JFK,
        "dist_to_EWR": dist_to_EWR,
        "dist_to_LGA": dist_to_LGA,
        "is_airport": is_airport,
        "cross_borough": cross_borough,
        "abs_dlat": abs_dlat,
        "abs_dlon": abs_dlon,
        "manhattan_dist": manhattan_dist,
    }

    numeric_df = pd.DataFrame([numeric], columns=NUMERIC_COLS)

    # --- one-hot encode (5.2) --------------------------------------------
    cat_values = {
        "pickup_borough": p_borough or UNKNOWN_SENTINEL,
        "dropoff_borough": d_borough or UNKNOWN_SENTINEL,
        "weather_condition": weather,
        "rate_regime": rate_regime,
    }

    # The encoder learned rate_regime as numpy ints (it saw an object array
    # from SimpleImputer). Match the stored category object exactly so the
    # lookup can't silently miss and encode a valid regime as "unknown".
    for i, col in enumerate(COLS_TO_ENCODE):
        for known in encoder.categories_[i]:
            if known == cat_values[col]:
                cat_values[col] = known
                break

    cat_df = pd.DataFrame([cat_values], columns=COLS_TO_ENCODE).astype(object)
    encoded = encoder.transform(cat_df)
    encoded_df = pd.DataFrame(encoded, columns=ENCODED_COLS)

    # --- final 47-column frame -------------------------------------------
    features = pd.concat([numeric_df, encoded_df], axis=1)
    features = features.reindex(columns=FEATURE_COLS)

    meta = {
        "rate_regime": int(rate_regime),
        "rate_regime_name": REGIME_NAMES.get(int(rate_regime), "Unknown"),
        "haversine_miles": round(hav_miles, 3) if not np.isnan(hav_miles) else None,
        "is_airport": bool(is_airport),
        "cross_borough": bool(cross_borough),
    }
    return features, meta


def run_pipeline(features):
    """Median-impute -> scale -> predict. Order matches notebook 5.3 -> 6."""
    imputed = imputer.transform(features)
    imputed = pd.DataFrame(imputed, columns=FEATURE_COLS)

    scaled = scaler.transform(imputed)
    scaled = pd.DataFrame(scaled, columns=FEATURE_COLS)

    return model.predict(scaled)


# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------

app = Flask(__name__)
CORS(app)


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "NYC Taxi Fare Prediction API",
        "model": type(model).__name__,
        "endpoints": {
            "GET  /health": "Service and artifact status",
            "GET  /schema": "Required input fields and accepted categories",
            "POST /predict": "Predict a fare for one trip",
            "POST /predict/batch": "Predict fares for a list of trips",
        },
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model": type(model).__name__,
        "n_features": len(FEATURE_COLS),
        "artifacts_loaded": ["model", "scaler", "encoder", "imputer"],
    })


@app.route("/schema", methods=["GET"])
def schema():
    return jsonify({
        "required_fields": REQUIRED_FIELDS,
        "categories": {
            col: [str(c) for c in encoder.categories_[i]]
            for i, col in enumerate(COLS_TO_ENCODE)
        },
        "notes": {
            "pickup_datetime": "'YYYY-MM-DD HH:MM:SS' or 'DD/MM/YYYY HH:MM'",
            "is_holiday": "0 or 1",
            "passenger_count": "1 to 6; anything else is treated as missing",
            "rate_regime": "Engineered from coordinates -- do not send it",
        },
    })


def _validate(payload):
    """Return a list of human-readable problems, empty if the payload is fine."""
    if not isinstance(payload, dict):
        return ["Request body must be a JSON object."]

    missing = [f for f in REQUIRED_FIELDS if f not in payload]
    if missing:
        return [f"Missing required field(s): {', '.join(missing)}"]

    problems = []
    for f in ("pickup_latitude", "pickup_longitude", "dropoff_latitude", "dropoff_longitude"):
        if np.isnan(to_float(payload.get(f))):
            problems.append(f"{f} must be a number.")
    return problems


@app.route("/predict", methods=["POST"])
def predict():
    # force=True so a missing/incorrect Content-Type gives a clear JSON error
    # instead of Flask's 415 HTML page.
    payload = request.get_json(force=True, silent=True)
    if payload is None:
        return jsonify({
            "error": "Invalid or missing JSON body.",
            "hint": "Send Content-Type: application/json with a raw JSON object.",
        }), 400

    problems = _validate(payload)
    if problems:
        return jsonify({"error": "Validation failed", "details": problems}), 400

    try:
        features, meta = build_features(payload)
        prediction = float(run_pipeline(features)[0])
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        app.logger.error("Prediction failed:\n%s", traceback.format_exc())
        return jsonify({"error": "Prediction failed", "details": str(exc)}), 500

    prediction = max(prediction, 0.0)

    return jsonify({
        "predicted_fare": round(prediction, 2),
        "currency": "USD",
        "trip_details": meta,
        "model": type(model).__name__,
    })


@app.route("/predict/batch", methods=["POST"])
def predict_batch():
    payload = request.get_json(force=True, silent=True)
    if payload is None:
        return jsonify({"error": "Invalid or missing JSON body."}), 400

    trips = payload.get("trips") if isinstance(payload, dict) else payload
    if not isinstance(trips, list) or not trips:
        return jsonify({
            "error": "Send a JSON array of trips, or an object with a 'trips' array.",
        }), 400

    results = []
    for i, trip in enumerate(trips):
        problems = _validate(trip)
        if problems:
            results.append({"index": i, "error": "Validation failed", "details": problems})
            continue
        try:
            features, meta = build_features(trip)
            value = max(float(run_pipeline(features)[0]), 0.0)
            results.append({
                "index": i,
                "predicted_fare": round(value, 2),
                "trip_details": meta,
            })
        except Exception as exc:
            results.append({"index": i, "error": str(exc)})

    return jsonify({"count": len(results), "results": results})


@app.errorhandler(404)
def not_found(_):
    return jsonify({"error": "Not found", "hint": "POST to /predict"}), 404


@app.errorhandler(405)
def method_not_allowed(_):
    return jsonify({"error": "Method not allowed", "hint": "/predict expects POST"}), 405


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
