# 🚕 NYC Taxi Fare Prediction

End-to-end machine learning project that predicts NYC taxi fares from raw, messy trip data — built as the Level 02 capstone for the **Certified ML Engineer** badge (Noob Dev).

The dataset arrives with real production-style problems (duplicate rows, mixed units, corrupted timestamps, a poisoned target column) rather than a clean textbook CSV, so most of the engineering effort goes into diagnosing and fixing those issues correctly *before* any model is trained.

📹 [Demo video](#) &nbsp;•&nbsp; 🔗 [Live demo](#) &nbsp;•&nbsp; 🏅 [Credential](#)

---

## 📌 Overview

- **Goal:** predict `fare_amount` for a trip using only information available at quote time (before the ride happens)
- **Approach:** rigorous EDA → data cleaning → feature engineering → leakage audit → model comparison → deployment-ready artifacts
- **Best model:** Random Forest — **Test R² = 0.952**, **MAE = $4.57**

---

## 📂 Repository Structure

```
├── Level2_EDA_Part_A_notebook.ipynb        # Exploratory data analysis & data quality audit
├── Level2_Modelling_Part_B_notebook.ipynb  # Cleaning, feature engineering, modelling
├── taxi_fare_model.pkl                     # Trained Random Forest model
├── scaler.pkl                              # Fitted StandardScaler
├── imputer.pkl                             # Fitted SimpleImputer (median)
├── encoder.pkl                             # Fitted OneHotEncoder
├── app/                                    # Frontend + backend for the live demo
└── README.md
```

---

## 🔍 Part A — EDA & Data Quality Audit

Before touching a model, every column was audited against a ground-truth key. Key findings:

| # | Issue | Rows affected | Fix |
|---|---|---:|---|
| 1 | Duplicate, double-logged trips | 120 | Dropped after attaching answer key |
| 2 | `trip_distance` recorded in two units (km & mi) | ~1,250 | Detected via haversine ratio, converted km → mi |
| 3 | GPS coordinates exactly zero | 134 | Set to NaN, imputed |
| 4 | Latitude / longitude transposed | 47 | Swapped back |
| 5 | Two datetime formats mixed in one column | 640 / 4,480 | Parsed separately with explicit `format=` strings |
| 6 | `trip_duration` stored as text (`"1h 1m"`) | all | Regex-parsed to minutes |
| 7 | `temperature_f` sentinel value (`-999`) | — | Converted to NaN |
| 8 | Impossible `passenger_count` (0 or 9) | — | Treated as missing |
| 9 | Inconsistent categorical text (`VTS`/`vts `, `CRD`/`Credit Card`) | — | Stripped, case-normalised, mapped |
| 10 | Target corrupted: nulls, negatives, zeros, 10x-inflated fares | 32 removed / 14 repaired | Dropped invalid rows, repaired inflated fares |

The most important EDA finding: NYC taxi pricing isn't one relationship — it's **five separate pricing regimes** (standard metered, JFK flat fare, Newark, out-of-city, negotiated) stacked on top of each other. A model that doesn't know which regime a trip belongs to sees a single noisy cloud with almost no learnable structure.

---

## 🛠️ Part B — Feature Engineering & Modelling

### Feature engineering
- **Haversine distance** computed from pickup/dropoff coordinates (available at quote time, unlike the post-trip meter reading)
- **Pricing-regime flag** reconstructed purely from geography (distance to JFK/LGA/EWR, borough crossing) — scored against the ground-truth key to confirm accuracy, since the raw `rate_code` column was 38% missing and partly wrong
- **Cyclical time features** (sine/cosine of hour and month) plus raw hour/day/month for tree models
- Airport proximity flag, cross-borough flag, coordinate deltas

### Leakage audit
Every column was checked against one question: *would this actually be known the moment a customer requests a fare quote?* Anything recorded during or after the trip — `trip_duration`, `tip_amount`, `total_amount`, `trip_rating`, assigned driver/vehicle, etc. — was dropped, regardless of how predictive it looked.

### Model comparison

Six regression models, same train/test split, same preprocessing:

| Model | Train R² | Test R² | MAE | RMSE |
|---|---:|---:|---:|---:|
| **Random Forest** ⭐ | 0.9870 | **0.9518** | **$4.57** | $7.23 |
| Neural Network (MLP) | 0.9704 | 0.9462 | $5.16 | $7.64 |
| Decision Tree | 0.9695 | 0.9348 | $5.36 | $8.41 |
| Support Vector Regression | 0.9859 | 0.9318 | $5.41 | $8.60 |
| Linear Regression | 0.9072 | 0.9267 | $5.53 | $8.91 |
| K-Nearest Neighbors | 0.9209 | 0.9020 | $7.47 | $10.31 |

A benchmark sanity check was run on the winning model: Test R² above 0.98 or MAE below $2.50 would indicate leakage. The Random Forest result (R² 0.952, MAE $4.57) passes comfortably inside the safe band.

### Error analysis
Error isn't uniform across trip types — the out-of-city flat-fare category (smallest sample, largest fares) carries the highest absolute error. Engineered features helped the linear model far more than the tree-based models, since Random Forest can partially reconstruct geographic structure from raw coordinates on its own.

---

## 🧰 Tech Stack

`Python` · `pandas` · `NumPy` · `scikit-learn` · `matplotlib` · `seaborn`

---

## ▶️ How to Run

```bash
# clone the repo
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>

# install dependencies
pip install -r requirements.txt

# run the notebooks in order
jupyter notebook Level2_EDA_Part_A_notebook.ipynb
jupyter notebook Level2_Modelling_Part_B_notebook.ipynb
```

To use the saved model directly:

```python
import pickle

model   = pickle.load(open("taxi_fare_model.pkl", "rb"))
scaler  = pickle.load(open("scaler.pkl", "rb"))
imputer = pickle.load(open("imputer.pkl", "rb"))
encoder = pickle.load(open("encoder.pkl", "rb"))

# preprocess new trip data the same way as training, then:
prediction = model.predict(X_new_scaled)
```

---



## 👤 Author

**Jinitha Nadeepa Ranasingha**
[LinkedIn](https://www.linkedin.com/in/jinitha-n-ranasingha/) · [GitHub](https://github.com/jinitha-RA)
