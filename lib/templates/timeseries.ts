import type { AIAnalysis } from '@/types'

export function generateTimeseriesScript(feedUrl: string, analysis: AIAnalysis | null): string {
  const target = analysis?.targetField || 'AUTO_DETECT'
  const tsField = analysis?.timestampField || 'AUTO_DETECT'
  const dataType = analysis?.dataType || 'activity feed data'

  return `# ==============================================================
# RaffleML — Time Series Forecasting
# Generated for: ${feedUrl}
# Data type: ${dataType}
# ==============================================================
# BEST FOR: Polymarket event odds, price prediction, gig work
#           survey volume, crypto platform activity trends
# ==============================================================

# ---- STEP 1: Install dependencies (run once) ----
# !pip install -q pandas numpy requests matplotlib seaborn
# !pip install -q prophet                    # Facebook Prophet (recommended)
# !pip install -q statsmodels                # ARIMA fallback

import pandas as pd
import numpy as np
import requests
import json
import time
import matplotlib
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings("ignore")

# Prophet (recommended)
try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
    print("✅ Prophet loaded")
except ImportError:
    try:
        from fbprophet import Prophet
        PROPHET_AVAILABLE = True
        print("✅ fbprophet loaded")
    except ImportError:
        PROPHET_AVAILABLE = False
        print("⚠ Prophet not available — using statsmodels ARIMA")

# ARIMA fallback
try:
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.stattools import adfuller
    STATSMODELS_AVAILABLE = True
except ImportError:
    STATSMODELS_AVAILABLE = False


# ==============================================================
# CONFIGURATION — Edit these values
# ==============================================================
CONFIG = {
    "feed_url": "${feedUrl}",
    "poll_interval": 30,
    "n_polls": 12,                # More polls = better time series
    "max_records": 5000,
    "headers": {},
    "value_field": ${target === 'AUTO_DETECT' ? 'None' : `"${target}"`},        # numeric field to forecast (None = auto)
    "timestamp_field": ${tsField === 'AUTO_DETECT' ? 'None' : `"${tsField}"`},  # timestamp field (None = auto)
    "resample_freq": "5min",     # '1min','5min','1H','1D' — bin data into this interval
    "forecast_periods": 24,      # how many future periods to forecast
    "agg_func": "mean",          # how to aggregate: "mean", "sum", "last", "count"
    "output_dir": ".",
}


# ==============================================================
# DATA COLLECTION
# ==============================================================
collected: list = []

def fetch_feed(url: str, headers: dict = {}) -> list:
    try:
        r = requests.get(url, headers=headers, timeout=15)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ["items", "data", "results", "records", "entries", "candles", "ohlcv"]:
                if key in data and isinstance(data[key], list):
                    return data[key]
            lists = [v for v in data.values() if isinstance(v, list) and len(v) > 0]
            return lists[0] if lists else []
        return []
    except Exception as e:
        print(f"  ⚠ Fetch error: {e}")
        return []


def collect_data(verbose=True) -> pd.DataFrame:
    n = CONFIG["n_polls"]
    print(f"\\n📡 Collecting from: {CONFIG['feed_url']}")
    print(f"   {n} polls × {CONFIG['poll_interval']}s\\n")
    seen: set = set()
    for i in range(n):
        records = fetch_feed(CONFIG["feed_url"], CONFIG["headers"])
        new = []
        for r in records:
            if not isinstance(r, dict): continue
            fp = json.dumps(r, sort_keys=True)
            if fp not in seen:
                seen.add(fp)
                r["_collected_at"] = datetime.utcnow().isoformat()
                new.append(r)
        collected.extend(new)
        if verbose:
            print(f"  [{i+1:02d}/{n}] +{len(new)} new  (total: {len(collected)})")
        if i < n - 1:
            time.sleep(CONFIG["poll_interval"])
    df = pd.DataFrame(collected)
    print(f"\\n✅ {len(df)} records collected.")
    return df


# ==============================================================
# PREPROCESSING: build time series
# ==============================================================
def _auto_detect(df: pd.DataFrame):
    numeric = df.select_dtypes(include=[np.number]).columns.tolist()
    ts_kw = ["time", "date", "at", "created", "updated", "ts", "stamp"]
    val_kw = ["price", "value", "amount", "qty", "volume", "rate", "score", "count",
              "open", "close", "high", "low", "prob", "probability"]
    ts_cols = [c for c in df.columns if any(k in c.lower() for k in ts_kw)]
    val_cols = [c for c in numeric if any(k in c.lower() for k in val_kw)]
    val = CONFIG["value_field"] or (val_cols[0] if val_cols else numeric[0] if numeric else None)
    ts = CONFIG["timestamp_field"] or (ts_cols[0] if ts_cols else None)
    print(f"\\n🔎 Auto-detected:")
    print(f"   Value field     : {val}")
    print(f"   Timestamp field : {ts}")
    return val, ts


def build_timeseries(df: pd.DataFrame):
    """Resample raw records into a regular time series."""
    val_field, ts_field = _auto_detect(df)

    if ts_field is None:
        print("⚠ No timestamp found — using collection order + synthetic timestamps")
        df = df.copy()
        df["_ts"] = pd.date_range(
            end=datetime.utcnow(),
            periods=len(df),
            freq=CONFIG["resample_freq"]
        )
        ts_field = "_ts"

    df = df.copy()
    df["_ts"] = pd.to_datetime(df[ts_field], errors="coerce", utc=True)
    df = df.dropna(subset=["_ts"]).sort_values("_ts")

    if val_field is None:
        print("⚠ No numeric value field — using record count per interval")
        ts = df.set_index("_ts").resample(CONFIG["resample_freq"]).size().rename("count")
        val_field = "count"
    else:
        df[val_field] = pd.to_numeric(df[val_field], errors="coerce")
        ts = (
            df.set_index("_ts")[val_field]
            .resample(CONFIG["resample_freq"])
            .agg(CONFIG["agg_func"])
        )

    ts = ts.interpolate(method="time").dropna()
    print(f"\\n⏱ Time series: {len(ts)} periods at '{CONFIG['resample_freq']}' frequency")
    print(f"   Range: {ts.index.min()} → {ts.index.max()}")
    print(f"   Value mean: {ts.mean():.4f}  std: {ts.std():.4f}")
    return ts, val_field


# ==============================================================
# FORECASTING
# ==============================================================
def forecast_prophet(ts: pd.Series, periods: int):
    """Forecast using Facebook Prophet."""
    df_p = pd.DataFrame({"ds": ts.index.tz_localize(None), "y": ts.values})

    model = Prophet(
        changepoint_prior_scale=0.1,
        seasonality_mode="additive",
        daily_seasonality=True,
        weekly_seasonality=True,
        yearly_seasonality=False,
        interval_width=0.95,
    )
    print(f"\\n🤖 Fitting Prophet model on {len(df_p)} data points...")
    model.fit(df_p, algorithm="LBFGS")

    # Infer frequency
    freq = pd.infer_freq(ts.index) or CONFIG["resample_freq"]
    future = model.make_future_dataframe(periods=periods, freq=freq)
    forecast = model.predict(future)

    return model, forecast


def forecast_arima(ts: pd.Series, periods: int):
    """Simple ARIMA forecast as fallback."""
    print(f"\\n🤖 Fitting ARIMA model on {len(ts)} data points...")

    # Auto-check stationarity
    result = adfuller(ts.dropna())
    d = 0 if result[1] < 0.05 else 1
    print(f"   ADF p-value: {result[1]:.4f}  →  d={d}")

    model = ARIMA(ts.values, order=(5, d, 2))
    fitted = model.fit()

    forecast_vals = fitted.forecast(steps=periods)
    conf_int = fitted.get_forecast(steps=periods).conf_int(alpha=0.05)

    # Build future index
    freq = pd.infer_freq(ts.index) or CONFIG["resample_freq"]
    last_ts = ts.index[-1]
    fut_idx = pd.date_range(start=last_ts, periods=periods+1, freq=freq)[1:]

    forecast_df = pd.DataFrame({
        "ds": fut_idx.tz_localize(None) if fut_idx.tz is not None else fut_idx,
        "yhat": forecast_vals,
        "yhat_lower": conf_int.iloc[:, 0].values,
        "yhat_upper": conf_int.iloc[:, 1].values,
    })
    return fitted, forecast_df


def run_forecast(ts: pd.Series):
    n = CONFIG["forecast_periods"]
    if PROPHET_AVAILABLE:
        model, forecast = forecast_prophet(ts, n)
        method = "Prophet"
    elif STATSMODELS_AVAILABLE:
        model, forecast = forecast_arima(ts, n)
        method = "ARIMA"
    else:
        print("⛔ No forecasting library available.")
        print("   Run: !pip install prophet  or  !pip install statsmodels")
        return None, None, None
    print(f"\\n✅ {method} forecast: {n} periods ahead")
    return model, forecast, method


# ==============================================================
# VISUALIZATION
# ==============================================================
DARK = {
    "fig": "#0d1117", "ax": "#161b22", "grid": "#21262d",
    "text": "#e6edf3", "muted": "#8b949e", "border": "#30363d",
    "blue": "#58a6ff", "cyan": "#22d3ee", "orange": "#ffa657",
    "purple": "#bc8cff", "green": "#3fb950", "red": "#f85149",
}

def _style(ax):
    ax.set_facecolor(DARK["ax"])
    ax.tick_params(colors=DARK["muted"], labelsize=9)
    for s in ax.spines.values(): s.set_edgecolor(DARK["border"])
    ax.grid(color=DARK["grid"], linestyle="--", alpha=0.5)
    ax.set_xlabel(ax.get_xlabel(), color=DARK["muted"], fontsize=9)
    ax.set_ylabel(ax.get_ylabel(), color=DARK["muted"], fontsize=9)
    ax.set_title(ax.get_title(), color=DARK["text"], fontsize=11, pad=10)


def plot_forecast(ts: pd.Series, forecast: pd.DataFrame, val_field: str, method: str):
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.patch.set_facecolor(DARK["fig"])

    ds_hist = ts.index.tz_localize(None) if ts.index.tz is not None else ts.index
    y_hist = ts.values
    fut = forecast[forecast["ds"] > ds_hist[-1]] if "ds" in forecast.columns else forecast
    hist_fc = forecast[forecast["ds"] <= ds_hist[-1]] if "ds" in forecast.columns else pd.DataFrame()

    # Panel 1: history + forecast
    ax = axes[0, 0]
    ax.plot(ds_hist, y_hist, color=DARK["blue"], lw=1.5, label="Observed", zorder=3)
    if not fut.empty:
        ax.plot(fut["ds"], fut["yhat"], color=DARK["cyan"], lw=2, linestyle="--", label=f"Forecast ({method})")
        ax.fill_between(fut["ds"], fut["yhat_lower"], fut["yhat_upper"],
                        alpha=0.15, color=DARK["cyan"], label="95% CI")
    ax.set_title(f"{val_field} — Forecast")
    ax.set_xlabel("Time")
    ax.set_ylabel(val_field)
    ax.legend(facecolor=DARK["ax"], labelcolor=DARK["text"], fontsize=9)
    _style(ax)

    # Panel 2: residuals
    ax = axes[0, 1]
    if not hist_fc.empty:
        fc_hist_vals = np.interp(
            range(len(y_hist)),
            range(len(hist_fc)),
            hist_fc["yhat"].values[:len(y_hist)]
        )
        residuals = y_hist - fc_hist_vals[:len(y_hist)]
        ax.plot(ds_hist, residuals, color=DARK["orange"], lw=1, alpha=0.8)
        ax.axhline(0, color=DARK["muted"], lw=1, linestyle="--")
        ax.fill_between(ds_hist, residuals, 0,
                        where=(residuals > 0), color=DARK["green"], alpha=0.3, label=">0")
        ax.fill_between(ds_hist, residuals, 0,
                        where=(residuals < 0), color=DARK["red"], alpha=0.3, label="<0")
    ax.set_title("Residuals (Observed − Fitted)")
    ax.set_xlabel("Time")
    ax.legend(facecolor=DARK["ax"], labelcolor=DARK["text"], fontsize=9)
    _style(ax)

    # Panel 3: rolling stats
    ax = axes[1, 0]
    roll = pd.Series(y_hist, index=ds_hist)
    w = max(3, len(roll)//10)
    roll_mean = roll.rolling(w).mean()
    roll_std = roll.rolling(w).std()
    ax.plot(ds_hist, y_hist, color=DARK["blue"], lw=1, alpha=0.5, label="Raw")
    ax.plot(ds_hist, roll_mean, color=DARK["purple"], lw=2, label=f"Roll. mean ({w})")
    ax.fill_between(ds_hist, roll_mean - roll_std, roll_mean + roll_std,
                    alpha=0.15, color=DARK["purple"], label="±1σ")
    ax.set_title("Rolling Mean ± Std")
    ax.set_xlabel("Time")
    ax.set_ylabel(val_field)
    ax.legend(facecolor=DARK["ax"], labelcolor=DARK["text"], fontsize=9)
    _style(ax)

    # Panel 4: forecast summary table
    ax = axes[1, 1]
    ax.axis("off")
    ax.set_facecolor(DARK["ax"])
    if not fut.empty:
        show = fut[["ds", "yhat", "yhat_lower", "yhat_upper"]].head(10).round(4)
        show.columns = ["Timestamp", "Forecast", "Lower CI", "Upper CI"]
        tbl = ax.table(
            cellText=show.astype(str).values,
            colLabels=show.columns.tolist(),
            loc="center", cellLoc="center",
        )
        tbl.auto_set_font_size(False)
        tbl.set_fontsize(7)
        for (r, c), cell in tbl.get_celld().items():
            cell.set_facecolor("#1c2128" if r > 0 else DARK["border"])
            cell.set_text_props(color=DARK["text"])
            cell.set_edgecolor(DARK["border"])
    ax.set_title("Forecast Values (Next 10 Periods)", color=DARK["text"], fontsize=11, pad=10)

    plt.suptitle(f"RaffleML · Time Series Forecast ({method})", color=DARK["text"], fontsize=13, y=1.01)
    plt.tight_layout()
    out = f"{CONFIG['output_dir']}/forecast_report.png"
    plt.savefig(out, dpi=150, bbox_inches="tight", facecolor=DARK["fig"])
    plt.show()
    print(f"\\n💾 Plot saved → {out}")


# ==============================================================
# REPORT
# ==============================================================
def print_report(ts: pd.Series, forecast: pd.DataFrame, val_field: str, method: str):
    print("\\n" + "="*62)
    print(f"  📈  TIME SERIES FORECAST REPORT — RaffleML ({method})")
    print("="*62)
    print(f"\\n  Historical periods : {len(ts)}")
    print(f"  Forecast periods   : {CONFIG['forecast_periods']}")
    print(f"\\n  Historical stats:")
    print(f"    Mean  : {ts.mean():.4f}")
    print(f"    Std   : {ts.std():.4f}")
    print(f"    Min   : {ts.min():.4f}")
    print(f"    Max   : {ts.max():.4f}")
    fut = forecast[forecast["ds"] > ts.index.tz_localize(None)[-1]] if hasattr(ts.index, 'tz') else forecast.tail(CONFIG["forecast_periods"])
    if not fut.empty:
        print(f"\\n  Forecast stats ({CONFIG['forecast_periods']} periods):")
        print(f"    Mean  : {fut['yhat'].mean():.4f}")
        print(f"    Min   : {fut['yhat_lower'].min():.4f}")
        print(f"    Max   : {fut['yhat_upper'].max():.4f}")
        trend = "↑ Upward" if fut["yhat"].iloc[-1] > fut["yhat"].iloc[0] else "↓ Downward"
        print(f"    Trend : {trend}")
    out_ts = f"{CONFIG['output_dir']}/timeseries_data.csv"
    out_fc = f"{CONFIG['output_dir']}/forecast_results.csv"
    pd.DataFrame({"ds": ts.index, "y": ts.values}).to_csv(out_ts, index=False)
    forecast.to_csv(out_fc, index=False)
    print(f"\\n  💾 Historical data → {out_ts}")
    print(f"  💾 Forecast results → {out_fc}")
    print("="*62 + "\\n")


# ==============================================================
# RUN
# ==============================================================
print("🚀  RaffleML · Time Series Forecasting")
print("="*62)

# Uncomment to load from CSV:
# df = pd.read_csv("your_data.csv")

df = collect_data(verbose=True)

if df.empty:
    print("\\n⛔  No data. Check CONFIG['feed_url'] and try again.")
else:
    ts, val_field = build_timeseries(df)
    if len(ts) < 5:
        print(f"\\n⚠  Only {len(ts)} time periods. Need at least 5.")
        print("   Try increasing n_polls, reducing resample_freq, or loading from CSV.")
    else:
        model, forecast, method = run_forecast(ts)
        if forecast is not None:
            print_report(ts, forecast, val_field, method)
            plot_forecast(ts, forecast, val_field, method)
            print("✅  Done!")
`
}
