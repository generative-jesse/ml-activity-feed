import type { AIAnalysis } from '@/types'

export function generateAnomalyScript(feedUrl: string, analysis: AIAnalysis | null): string {
  const target = analysis?.targetField || 'AUTO_DETECT'
  const tsField = analysis?.timestampField || 'AUTO_DETECT'
  const dataType = analysis?.dataType || 'activity feed data'

  return `# ==============================================================
# RaffleML — Anomaly Detection
# Generated for: ${feedUrl}
# Data type: ${dataType}
# ==============================================================
# BEST FOR: Crypto deposits/withdrawals, trading activity,
#           polymarket event spikes, unusual platform behavior
# ==============================================================

# ---- STEP 1: Install dependencies (run once) ----
# !pip install -q pandas numpy scikit-learn matplotlib seaborn requests

import pandas as pd
import numpy as np
import requests
import json
import time
import matplotlib
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# ==============================================================
# CONFIGURATION — Edit these values
# ==============================================================
CONFIG = {
    "feed_url": "${feedUrl}",
    "poll_interval": 30,         # seconds between fetches
    "n_polls": 10,               # number of times to poll (total time = n_polls * poll_interval)
    "max_records": 2000,         # cap on records to keep
    "headers": {},               # e.g. {"Authorization": "Bearer YOUR_TOKEN"}
    "contamination": 0.05,       # expected % of anomalies (0.01 to 0.2)
    "target_field": ${target === 'AUTO_DETECT' ? 'None' : `"${target}"`},       # numeric field to analyze (None = auto-detect)
    "timestamp_field": ${tsField === 'AUTO_DETECT' ? 'None' : `"${tsField}"`},  # timestamp field (None = auto-detect)
    "output_dir": ".",           # where to save results
}


# ==============================================================
# DATA COLLECTION
# ==============================================================
collected_records: list = []

def fetch_feed(url: str, headers: dict = {}) -> list:
    """Fetch records from the activity feed URL."""
    try:
        r = requests.get(url, headers=headers, timeout=15)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ["items", "data", "results", "records", "entries", "events", "list"]:
                if key in data and isinstance(data[key], list):
                    return data[key]
            lists = [v for v in data.values() if isinstance(v, list) and len(v) > 0]
            return lists[0] if lists else []
        return []
    except Exception as e:
        print(f"  ⚠ Fetch error: {e}")
        return []


def collect_data(verbose: bool = True) -> pd.DataFrame:
    """Poll the feed and collect records."""
    n = CONFIG["n_polls"]
    print(f"\\n📡 Collecting from: {CONFIG['feed_url']}")
    print(f"   {n} polls × {CONFIG['poll_interval']}s = ~{n * CONFIG['poll_interval']}s total\\n")

    seen_ids: set = set()
    for i in range(n):
        records = fetch_feed(CONFIG["feed_url"], CONFIG["headers"])
        new_records = []
        for r in records:
            if not isinstance(r, dict):
                continue
            # De-duplicate using a fingerprint
            fp = json.dumps(r, sort_keys=True)
            if fp not in seen_ids:
                seen_ids.add(fp)
                r["_collected_at"] = datetime.utcnow().isoformat()
                new_records.append(r)

        collected_records.extend(new_records)
        if len(collected_records) > CONFIG["max_records"]:
            collected_records[:] = collected_records[-CONFIG["max_records"]:]

        if verbose:
            print(f"  [{i+1:02d}/{n}] +{len(new_records)} new  (total: {len(collected_records)})")

        if i < n - 1:
            time.sleep(CONFIG["poll_interval"])

    df = pd.DataFrame(collected_records)
    print(f"\\n✅ Collection complete. {len(df)} unique records.")
    return df


# ==============================================================
# FEATURE ENGINEERING
# ==============================================================
def _auto_detect(df: pd.DataFrame):
    """Auto-detect target and timestamp fields."""
    numeric = df.select_dtypes(include=[np.number]).columns.tolist()
    ts_kw = ["time", "date", "at", "created", "updated", "ts", "stamp"]
    val_kw = ["amount", "value", "price", "qty", "size", "volume", "reward", "balance"]

    ts_cols = [c for c in df.columns if any(k in c.lower() for k in ts_kw)]
    val_cols = [c for c in numeric if any(k in c.lower() for k in val_kw)]

    target = CONFIG["target_field"] or (val_cols[0] if val_cols else numeric[0] if numeric else None)
    timestamp = CONFIG["timestamp_field"] or (ts_cols[0] if ts_cols else None)

    print(f"\\n🔎 Auto-detected fields:")
    print(f"   Target    : {target}")
    print(f"   Timestamp : {timestamp}")
    print(f"   Numerics  : {numeric[:8]}")
    return target, timestamp


def build_features(df: pd.DataFrame):
    """Build feature matrix for Isolation Forest."""
    target, timestamp = _auto_detect(df)

    if target is None:
        print("⚠ No numeric field found — using record index as value.")
        df = df.copy()
        df["_value"] = range(len(df))
        target = "_value"

    feats = pd.DataFrame(index=df.index)
    feats["value"] = pd.to_numeric(df[target], errors="coerce").fillna(0)

    # Time-based features
    if timestamp and timestamp in df.columns:
        try:
            df = df.copy()
            df["_ts"] = pd.to_datetime(df[timestamp], errors="coerce", utc=True)
            df = df.sort_values("_ts").reset_index(drop=True)
            feats = feats.reindex(df.index)
            feats["value"] = pd.to_numeric(df[target], errors="coerce").fillna(0)
            feats["time_delta_s"] = df["_ts"].diff().dt.total_seconds().fillna(0)
            feats["hour_of_day"] = df["_ts"].dt.hour
            feats["day_of_week"] = df["_ts"].dt.dayofweek
        except Exception as e:
            print(f"  ⚠ Time parsing failed: {e}")

    # Rolling statistics
    w = max(3, min(20, len(feats) // 10 or 1))
    feats["roll_mean"] = feats["value"].rolling(w, min_periods=1).mean()
    feats["roll_std"] = feats["value"].rolling(w, min_periods=1).std().fillna(0)
    feats["z_score"] = (feats["value"] - feats["roll_mean"]) / (feats["roll_std"] + 1e-9)
    feats["pct_change"] = feats["value"].pct_change().fillna(0).clip(-10, 10)

    return feats.fillna(0), df, target, timestamp


# ==============================================================
# ANOMALY DETECTION
# ==============================================================
def detect_anomalies(df: pd.DataFrame):
    """Run Isolation Forest + statistical z-score detection."""
    features, df_proc, target, timestamp = build_features(df)

    print(f"\\n🤖 Training Isolation Forest  ({len(features)} records)...")
    scaler = StandardScaler()
    X = scaler.fit_transform(features)

    model = IsolationForest(
        contamination=CONFIG["contamination"],
        n_estimators=200,
        random_state=42,
        n_jobs=-1,
    )
    preds = model.fit_predict(X)
    scores = model.score_samples(X)

    df_proc = df_proc.copy()
    df_proc["_anomaly"] = (preds == -1).astype(int)
    df_proc["_anomaly_score"] = scores
    df_proc["_z_score"] = features["z_score"].values
    df_proc["_if_label"] = np.where(preds == -1, "ANOMALY", "normal")

    n_total = len(df_proc)
    n_anom = df_proc["_anomaly"].sum()
    print(f"   Anomalies: {n_anom}/{n_total}  ({n_anom/n_total*100:.1f}%)")
    print(f"   Score range: [{scores.min():.4f}, {scores.max():.4f}]")

    return df_proc, features, target, timestamp


# ==============================================================
# VISUALIZATION
# ==============================================================
DARK = {
    "fig": "#0d1117", "ax": "#161b22", "grid": "#21262d",
    "text": "#e6edf3", "muted": "#8b949e", "border": "#30363d",
    "blue": "#58a6ff", "red": "#f85149", "orange": "#ffa657",
    "purple": "#bc8cff", "green": "#3fb950",
}

def _style_ax(ax):
    ax.set_facecolor(DARK["ax"])
    ax.tick_params(colors=DARK["muted"], labelsize=9)
    for spine in ax.spines.values():
        spine.set_edgecolor(DARK["border"])
    ax.grid(color=DARK["grid"], linestyle="--", alpha=0.5)
    ax.set_xlabel(ax.get_xlabel(), color=DARK["muted"], fontsize=9)
    ax.set_ylabel(ax.get_ylabel(), color=DARK["muted"], fontsize=9)
    ax.set_title(ax.get_title(), color=DARK["text"], fontsize=11, pad=10)


def plot_anomalies(df: pd.DataFrame, features: pd.DataFrame, target: str, ts_field):
    """4-panel anomaly report."""
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.patch.set_facecolor(DARK["fig"])

    norm = df[df["_anomaly"] == 0]
    anom = df[df["_anomaly"] == 1]
    idx_n = norm.index
    idx_a = anom.index

    # Panel 1: scatter
    ax = axes[0, 0]
    ax.scatter(idx_n, norm[target], c=DARK["blue"], s=15, alpha=0.6, label="Normal")
    ax.scatter(idx_a, anom[target], c=DARK["red"], s=50, marker="^", zorder=5, label=f"Anomaly ({len(anom)})")
    ax.set_xlabel("Record index")
    ax.set_ylabel(target)
    ax.set_title(f"Anomaly Detection — {target}")
    ax.legend(facecolor=DARK["ax"], labelcolor=DARK["text"], fontsize=9)
    _style_ax(ax)

    # Panel 2: Z-score
    ax = axes[0, 1]
    ax.hist(df.loc[df["_anomaly"]==0, "_z_score"], bins=30, color=DARK["blue"], alpha=0.7, density=True, label="Normal")
    ax.hist(df.loc[df["_anomaly"]==1, "_z_score"], bins=15, color=DARK["red"], alpha=0.8, density=True, label="Anomaly")
    mean, std = features["z_score"].mean(), features["z_score"].std()
    for s in [-2, 2]:
        ax.axvline(mean + s*std, color=DARK["orange"], lw=1.5, linestyle="--", alpha=0.8)
    ax.set_xlabel("Z-Score")
    ax.set_title("Z-Score Distribution (±2σ marked)")
    ax.legend(facecolor=DARK["ax"], labelcolor=DARK["text"], fontsize=9)
    _style_ax(ax)

    # Panel 3: rolling mean + anomaly overlay
    ax = axes[1, 0]
    ax.plot(features.index, features["roll_mean"], color=DARK["purple"], lw=1.5, label="Rolling mean", alpha=0.9)
    ax.fill_between(features.index,
                    features["roll_mean"] - features["roll_std"],
                    features["roll_mean"] + features["roll_std"],
                    alpha=0.15, color=DARK["purple"], label="±1σ band")
    ax.scatter(idx_a, anom[target], c=DARK["red"], s=50, marker="^", zorder=5, label="Anomaly")
    ax.set_xlabel("Record index")
    ax.set_ylabel(target)
    ax.set_title("Rolling Mean ± Std with Anomalies")
    ax.legend(facecolor=DARK["ax"], labelcolor=DARK["text"], fontsize=9)
    _style_ax(ax)

    # Panel 4: top anomalies table
    ax = axes[1, 1]
    ax.axis("off")
    ax.set_title("Top 8 Anomalies by Score", color=DARK["text"], fontsize=11, pad=10)
    top = df.nsmallest(8, "_anomaly_score")
    if not top.empty:
        show = [c for c in [target, "_z_score", "_anomaly_score"] if c in top.columns]
        tbl = ax.table(
            cellText=top[show].round(4).astype(str).values,
            colLabels=show,
            loc="center", cellLoc="center",
        )
        tbl.auto_set_font_size(False)
        tbl.set_fontsize(8)
        for (r, c), cell in tbl.get_celld().items():
            cell.set_facecolor("#1c2128" if r > 0 else DARK["border"])
            cell.set_text_props(color=DARK["text"])
            cell.set_edgecolor(DARK["border"])
    ax.set_facecolor(DARK["ax"])
    fig.patch.set_facecolor(DARK["fig"])

    plt.suptitle("RaffleML · Anomaly Detection Report", color=DARK["text"], fontsize=13, y=1.01)
    plt.tight_layout()
    out = f"{CONFIG['output_dir']}/anomaly_report.png"
    plt.savefig(out, dpi=150, bbox_inches="tight", facecolor=DARK["fig"])
    plt.show()
    print(f"\\n💾 Plot saved → {out}")


# ==============================================================
# REPORT
# ==============================================================
def print_report(df: pd.DataFrame, target: str):
    print("\\n" + "="*62)
    print("  📊  ANOMALY DETECTION REPORT — RaffleML")
    print("="*62)
    anom = df[df["_anomaly"] == 1]
    norm = df[df["_anomaly"] == 0]
    print(f"\\n  Records total : {len(df)}")
    print(f"  Normal        : {len(norm)}  ({len(norm)/len(df)*100:.1f}%)")
    print(f"  Anomalies     : {len(anom)}  ({len(anom)/len(df)*100:.1f}%)")
    if target in df.columns:
        diff = anom[target].mean() - norm[target].mean()
        pct = diff / (norm[target].mean() + 1e-9) * 100
        print(f"\\n  {target} (normal avg) : {norm[target].mean():.4f}")
        print(f"  {target} (anomaly avg): {anom[target].mean():.4f}  ({'+' if pct>0 else ''}{pct:.1f}%)")
    print(f"\\n  Top 5 anomalies (lowest IF score):")
    cols = [c for c in [target, "_z_score", "_anomaly_score"] if c in df.columns]
    print(df.nsmallest(5, "_anomaly_score")[cols].to_string(index=False))
    out = f"{CONFIG['output_dir']}/anomaly_results.csv"
    df.to_csv(out, index=False)
    print(f"\\n  💾 Full results → {out}")
    print("="*62 + "\\n")


# ==============================================================
# RUN
# ==============================================================
print("🚀  RaffleML · Anomaly Detection")
print("="*62)

# Uncomment to load from CSV instead of live polling:
# df = pd.read_csv("your_data.csv")

df = collect_data(verbose=True)

if df.empty:
    print("\\n⛔  No data collected. Check CONFIG['feed_url'] and try again.")
else:
    df_out, features, target, ts_field = detect_anomalies(df)
    print_report(df_out, target)
    plot_anomalies(df_out, features, target, ts_field)
    print("✅  Done!")
`
}
