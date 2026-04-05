import type { AIAnalysis } from '@/types'

export function generateSentimentScript(feedUrl: string, analysis: AIAnalysis | null): string {
  const textField = analysis?.keyFields?.find(f => f.type === 'string')?.field || 'AUTO_DETECT'
  const tsField = analysis?.timestampField || 'AUTO_DETECT'
  const dataType = analysis?.dataType || 'activity feed data'

  return `# ==============================================================
# RaffleML — Sentiment & Pattern Analysis
# Generated for: ${feedUrl}
# Data type: ${dataType}
# ==============================================================
# BEST FOR: X/Twitter contest optimization, social media feeds,
#           review analysis, community sentiment, gig work surveys
# ==============================================================

# ---- STEP 1: Install dependencies (run once) ----
# !pip install -q pandas numpy requests matplotlib seaborn
# !pip install -q transformers torch          # For HuggingFace models
# !pip install -q vaderSentiment             # Lightweight fallback

import pandas as pd
import numpy as np
import requests
import json
import time
import re
import matplotlib
import matplotlib.pyplot as plt
import seaborn as sns
from collections import Counter
from datetime import datetime
import warnings
warnings.filterwarnings("ignore")

# HuggingFace pipeline (optional but recommended)
try:
    from transformers import pipeline
    HF_AVAILABLE = True
    print("✅ HuggingFace transformers loaded")
except ImportError:
    HF_AVAILABLE = False
    print("⚠ transformers not available — using VADER fallback")

# VADER fallback
try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    VADER_AVAILABLE = True
except ImportError:
    VADER_AVAILABLE = False


# ==============================================================
# CONFIGURATION — Edit these values
# ==============================================================
CONFIG = {
    "feed_url": "${feedUrl}",
    "poll_interval": 30,
    "n_polls": 8,
    "max_records": 2000,
    "headers": {},               # e.g. {"Authorization": "Bearer TOKEN"}
    "text_field": ${textField === 'AUTO_DETECT' ? 'None' : `"${textField}"`},     # text field to analyze (None = auto-detect)
    "timestamp_field": ${tsField === 'AUTO_DETECT' ? 'None' : `"${tsField}"`},   # timestamp field (None = auto-detect)
    "hf_model": "cardiffnlp/twitter-roberta-base-sentiment-latest",  # HF model
    "hf_api_key": "",            # optional HuggingFace API key for inference API
    "output_dir": ".",
    # Keywords to track (for X contest / pattern analysis)
    "track_keywords": [],        # e.g. ["giveaway", "winner", "follow", "retweet"]
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
            for key in ["items", "data", "results", "posts", "tweets", "entries", "submissions"]:
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
# TEXT FIELD DETECTION
# ==============================================================
def detect_text_field(df: pd.DataFrame) -> str | None:
    if CONFIG["text_field"]:
        return CONFIG["text_field"]
    text_kw = ["text", "content", "message", "description", "title",
                "body", "comment", "post", "caption", "tweet", "name"]
    str_cols = df.select_dtypes(include=["object"]).columns.tolist()
    for kw in text_kw:
        for col in str_cols:
            if kw in col.lower():
                # Verify it has substantive text
                sample = df[col].dropna().astype(str)
                if sample.str.len().mean() > 10:
                    return col
    # fallback: longest average string column
    if str_cols:
        lens = {c: df[c].dropna().astype(str).str.len().mean() for c in str_cols}
        return max(lens, key=lens.get)
    return None


# ==============================================================
# SENTIMENT ANALYSIS
# ==============================================================
_hf_pipe = None

def _load_hf_model():
    global _hf_pipe
    if _hf_pipe is None and HF_AVAILABLE:
        print(f"\\n🤖 Loading HuggingFace model: {CONFIG['hf_model']}")
        print("   (first load may take ~30s to download)")
        _hf_pipe = pipeline(
            "sentiment-analysis",
            model=CONFIG["hf_model"],
            truncation=True,
            max_length=512,
        )
    return _hf_pipe


def _hf_api_sentiment(texts: list[str]) -> list[dict]:
    """Use HuggingFace Inference API (no local model needed)."""
    api_url = f"https://api-inference.huggingface.co/models/{CONFIG['hf_model']}"
    headers = {}
    if CONFIG["hf_api_key"]:
        headers["Authorization"] = f"Bearer {CONFIG['hf_api_key']}"
    results = []
    batch_size = 10
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i+batch_size]
        try:
            r = requests.post(api_url, headers=headers,
                              json={"inputs": batch}, timeout=30)
            r.raise_for_status()
            data = r.json()
            # Flatten nested list
            for item in data:
                if isinstance(item, list):
                    best = max(item, key=lambda x: x.get("score", 0))
                    results.append(best)
                elif isinstance(item, dict):
                    results.append(item)
        except Exception as e:
            print(f"  ⚠ HF API error: {e}")
            results.extend([{"label": "NEUTRAL", "score": 0.5}] * len(batch))
    return results


def _vader_sentiment(texts: list[str]) -> list[dict]:
    if not VADER_AVAILABLE:
        return [{"label": "NEUTRAL", "score": 0.5}] * len(texts)
    sia = SentimentIntensityAnalyzer()
    results = []
    for t in texts:
        s = sia.polarity_scores(str(t))
        compound = s["compound"]
        label = "POSITIVE" if compound >= 0.05 else "NEGATIVE" if compound <= -0.05 else "NEUTRAL"
        results.append({"label": label, "score": abs(compound)})
    return results


def analyze_sentiment(df: pd.DataFrame, text_field: str) -> pd.DataFrame:
    """Run sentiment analysis on the text field."""
    texts = df[text_field].fillna("").astype(str).tolist()
    texts_clean = [re.sub(r"http\\S+|@\\w+|#\\w+", " ", t).strip() for t in texts]
    texts_clean = [t[:512] if t else "." for t in texts_clean]

    print(f"\\n💬 Analyzing sentiment for {len(texts)} records...")

    if HF_AVAILABLE and not CONFIG["hf_api_key"]:
        pipe = _load_hf_model()
        if pipe:
            try:
                raw = pipe(texts_clean, batch_size=16)
                results = [{"label": r["label"].upper(), "score": r["score"]} for r in raw]
            except Exception as e:
                print(f"  ⚠ Local model error: {e} — trying API")
                results = _hf_api_sentiment(texts_clean)
        else:
            results = _vader_sentiment(texts_clean)
    elif CONFIG["hf_api_key"]:
        results = _hf_api_sentiment(texts_clean)
    else:
        results = _vader_sentiment(texts_clean)

    df = df.copy()
    df["_sentiment"] = [r["label"] for r in results]
    df["_sentiment_score"] = [r["score"] for r in results]

    # Normalize labels
    label_map = {
        "LABEL_0": "NEGATIVE", "LABEL_1": "NEUTRAL", "LABEL_2": "POSITIVE",
        "NEG": "NEGATIVE", "NEU": "NEUTRAL", "POS": "POSITIVE",
    }
    df["_sentiment"] = df["_sentiment"].map(lambda x: label_map.get(x, x))

    counts = df["_sentiment"].value_counts()
    print("  Sentiment breakdown:")
    for label, cnt in counts.items():
        print(f"    {label:10s}: {cnt:4d}  ({cnt/len(df)*100:.1f}%)")
    return df


# ==============================================================
# KEYWORD & PATTERN ANALYSIS
# ==============================================================
def analyze_keywords(df: pd.DataFrame, text_field: str) -> dict:
    """Extract top keywords and patterns."""
    texts = df[text_field].fillna("").astype(str)
    stop = {"the","a","an","and","or","but","in","on","at","to","for","of","with",
             "is","it","this","that","was","are","be","have","has","do","not","i",
             "you","he","she","we","they","my","your","his","her","our"}
    words = []
    for t in texts:
        words.extend([w.lower() for w in re.findall(r"\\b[a-z]{3,}\\b", t) if w not in stop])

    word_freq = Counter(words).most_common(30)
    hashtags = Counter(re.findall(r"#(\\w+)", " ".join(texts).lower())).most_common(20)
    mentions = Counter(re.findall(r"@(\\w+)", " ".join(texts).lower())).most_common(20)

    tracked = {}
    for kw in CONFIG["track_keywords"]:
        tracked[kw] = texts.str.lower().str.contains(kw.lower()).sum()

    return {
        "top_words": word_freq,
        "hashtags": hashtags,
        "mentions": mentions,
        "tracked": tracked,
    }


# ==============================================================
# VISUALIZATION
# ==============================================================
DARK = {
    "fig": "#0d1117", "ax": "#161b22", "grid": "#21262d",
    "text": "#e6edf3", "muted": "#8b949e", "border": "#30363d",
    "pos": "#3fb950", "neg": "#f85149", "neu": "#ffa657",
    "blue": "#58a6ff", "purple": "#bc8cff",
}

SENT_COLORS = {"POSITIVE": DARK["pos"], "NEGATIVE": DARK["neg"], "NEUTRAL": DARK["neu"]}

def _style(ax):
    ax.set_facecolor(DARK["ax"])
    ax.tick_params(colors=DARK["muted"], labelsize=9)
    for s in ax.spines.values(): s.set_edgecolor(DARK["border"])
    ax.grid(color=DARK["grid"], linestyle="--", alpha=0.5)
    ax.set_xlabel(ax.get_xlabel(), color=DARK["muted"], fontsize=9)
    ax.set_ylabel(ax.get_ylabel(), color=DARK["muted"], fontsize=9)
    ax.set_title(ax.get_title(), color=DARK["text"], fontsize=11, pad=10)


def plot_sentiment(df: pd.DataFrame, kw_data: dict, text_field: str):
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.patch.set_facecolor(DARK["fig"])

    # Panel 1: sentiment distribution
    ax = axes[0, 0]
    counts = df["_sentiment"].value_counts()
    colors = [SENT_COLORS.get(l, DARK["blue"]) for l in counts.index]
    bars = ax.bar(counts.index, counts.values, color=colors, edgecolor="none")
    for bar, val in zip(bars, counts.values):
        ax.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.5,
                f"{val}", ha="center", va="bottom", color=DARK["text"], fontsize=9)
    ax.set_title("Sentiment Distribution")
    ax.set_ylabel("Count")
    _style(ax)

    # Panel 2: top keywords
    ax = axes[0, 1]
    top_w = kw_data["top_words"][:15]
    if top_w:
        words, counts_w = zip(*top_w)
        y = np.arange(len(words))
        ax.barh(y, counts_w, color=DARK["purple"], edgecolor="none")
        ax.set_yticks(y)
        ax.set_yticklabels(words, color=DARK["text"], fontsize=9)
        ax.invert_yaxis()
    ax.set_title("Top Keywords")
    ax.set_xlabel("Frequency")
    _style(ax)

    # Panel 3: sentiment score distribution
    ax = axes[1, 0]
    for label, color in SENT_COLORS.items():
        subset = df[df["_sentiment"] == label]["_sentiment_score"]
        if not subset.empty:
            ax.hist(subset, bins=20, color=color, alpha=0.7, label=label, density=True)
    ax.set_title("Confidence Score Distribution")
    ax.set_xlabel("Confidence Score")
    ax.legend(facecolor=DARK["ax"], labelcolor=DARK["text"], fontsize=9)
    _style(ax)

    # Panel 4: text length vs sentiment
    ax = axes[1, 1]
    df_plot = df.copy()
    df_plot["_text_len"] = df_plot[text_field].fillna("").astype(str).str.len()
    for label, color in SENT_COLORS.items():
        subset = df_plot[df_plot["_sentiment"] == label]
        if not subset.empty:
            ax.scatter(subset["_text_len"], subset["_sentiment_score"],
                       c=color, alpha=0.5, s=20, label=label)
    ax.set_title("Text Length vs Confidence")
    ax.set_xlabel("Text length (chars)")
    ax.set_ylabel("Confidence")
    ax.legend(facecolor=DARK["ax"], labelcolor=DARK["text"], fontsize=9)
    _style(ax)

    plt.suptitle("RaffleML · Sentiment Analysis Report", color=DARK["text"], fontsize=13, y=1.01)
    plt.tight_layout()
    out = f"{CONFIG['output_dir']}/sentiment_report.png"
    plt.savefig(out, dpi=150, bbox_inches="tight", facecolor=DARK["fig"])
    plt.show()
    print(f"\\n💾 Plot saved → {out}")


# ==============================================================
# REPORT
# ==============================================================
def print_report(df: pd.DataFrame, kw_data: dict):
    print("\\n" + "="*62)
    print("  💬  SENTIMENT ANALYSIS REPORT — RaffleML")
    print("="*62)
    counts = df["_sentiment"].value_counts()
    print(f"\\n  Total records : {len(df)}")
    for label in ["POSITIVE", "NEUTRAL", "NEGATIVE"]:
        n = counts.get(label, 0)
        bar = "█" * int(n / len(df) * 30)
        print(f"  {label:10s}: {n:4d} ({n/len(df)*100:5.1f}%)  {bar}")

    avg_pos = df[df["_sentiment"]=="POSITIVE"]["_sentiment_score"].mean()
    avg_neg = df[df["_sentiment"]=="NEGATIVE"]["_sentiment_score"].mean()
    print(f"\\n  Avg confidence (POSITIVE): {avg_pos:.3f}" if not np.isnan(avg_pos) else "")
    print(f"  Avg confidence (NEGATIVE): {avg_neg:.3f}" if not np.isnan(avg_neg) else "")

    if kw_data["tracked"]:
        print(f"\\n  📌 Tracked keyword counts:")
        for kw, cnt in kw_data["tracked"].items():
            print(f"     '{kw}': {cnt}")

    if kw_data["hashtags"]:
        print(f"\\n  🔖 Top hashtags: {', '.join(['#'+h for h,_ in kw_data['hashtags'][:8]])}")

    out = f"{CONFIG['output_dir']}/sentiment_results.csv"
    df.to_csv(out, index=False)
    print(f"\\n  💾 Full results → {out}")
    print("="*62 + "\\n")


# ==============================================================
# RUN
# ==============================================================
print("🚀  RaffleML · Sentiment & Pattern Analysis")
print("="*62)

# Uncomment to load from CSV:
# df = pd.read_csv("your_data.csv")

df = collect_data(verbose=True)

if df.empty:
    print("\\n⛔  No data. Check CONFIG['feed_url'] and try again.")
else:
    text_field = detect_text_field(df)
    if text_field is None:
        print("⛔  Could not detect a text field. Set CONFIG['text_field'] manually.")
    else:
        print(f"\\n📝 Using text field: '{text_field}'")
        df = analyze_sentiment(df, text_field)
        kw_data = analyze_keywords(df, text_field)
        print_report(df, kw_data)
        plot_sentiment(df, kw_data, text_field)
        print("✅  Done!")
`
}
