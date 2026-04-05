import pandas as pd
import numpy as np
import requests
import json
import time
from datetime import datetime, timedelta
import os
import pickle
import signal
import sys
from pathlib import Path

# Set API URL
API_URL = "https://api.merkle.trade/v1/season/s29/dashboard/recent-draws"

# Create logs directory if it doesn't exist
log_dir = Path("raffle_logs")
log_dir.mkdir(exist_ok=True)

# Status file to track if collection is running
STATUS_FILE = log_dir / "collection_status.txt"
# Path for the data file
DATA_FILE = log_dir / "raffle_data.csv"
# Path for the recent raffles log
RECENT_LOG = log_dir / "recent_raffles.txt"
# Path for the status log
STATUS_LOG = log_dir / "status_log.txt"

# Global variables
running = True

def log_status(message):
    """Log status messages with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(STATUS_LOG, "a") as f:
        f.write(f"[{timestamp}] {message}\n")
    print(f"[{timestamp}] {message}")

def fetch_raffle_data():
    """Fetch raffle data from the API"""
    try:
        response = requests.get(API_URL)
        response.raise_for_status()
        data = response.json()
        return data['items']
    except Exception as e:
        log_status(f"Error fetching data: {e}")
        return None

def process_raffle_item(item):
    """Process a single raffle item into a dictionary"""
    return {
        'user': item['user'],
        'username': item.get('username', 'Unknown'),
        'class': item['class'],
        'ticket': item['ticket'],
        'leverage': item['leverage'],
        'reward_amount': item['reward']['amount'],
        'reward_price': item['reward']['price'],
        'reward_tier': item['reward']['tier'],
        'pairID': item['reward']['pairID'],
        'drawAt': item['drawAt'],
        'timestamp': datetime.fromisoformat(item['drawAt'].replace('Z', '+00:00')),
        'fetch_time': datetime.now()
    }

def initialize_dataframe():
    """Initialize an empty DataFrame with the correct schema"""
    return pd.DataFrame(columns=[
        'user', 'username', 'class', 'ticket', 'leverage', 
        'reward_amount', 'reward_price', 'reward_tier', 'pairID',
        'drawAt', 'timestamp', 'fetch_time', 'time_since_last_raffle',
        'time_since_big_win', 'win_streak', 'consecutive_same_user'
    ])

def save_data(df):
    """Save the DataFrame to a CSV file"""
    df.to_csv(DATA_FILE, index=False)
    log_status(f"Data saved to {DATA_FILE} ({len(df)} records)")
    
    # Also save a text log of recent raffles
    recent = df.sort_values('timestamp', ascending=False).head(20)
    with open(RECENT_LOG, 'w') as f:
        f.write(f"=== Recent Raffles (Updated: {datetime.now()}) ===\n\n")
        for _, row in recent.iterrows():
            f.write(f"Time: {row['timestamp']}\n")
            f.write(f"User: {row['username']} ({row['user'][:8]}...)\n")
            f.write(f"Leverage: {row['leverage']}\n")
            f.write(f"Reward: {row['reward_amount']:.4f} (Tier {row['reward_tier']})\n")
            f.write("-" * 40 + "\n")
    log_status(f"Recent raffles log saved to {RECENT_LOG}")

def load_data():
    """Load data from a CSV file"""
    if os.path.exists(DATA_FILE):
        df = pd.read_csv(DATA_FILE)
        # Convert timestamp column back to datetime
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'])
        return df
    return initialize_dataframe()

def add_features(df):
    """Add time-based and pattern-based features to the DataFrame"""
    if len(df) == 0:
        return df
    
    # Sort by timestamp
    df = df.sort_values('timestamp').reset_index(drop=True)
    
    # Convert timestamp to datetime if it's a string
    if isinstance(df['timestamp'].iloc[0], str):
        df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # Time since last raffle (in seconds)
    df['time_since_last_raffle'] = df['timestamp'].diff().dt.total_seconds()
    
    # Time since last big win (reward_tier <= 2)
    big_win_indices = df[df['reward_tier'] <= 2].index
    df['time_since_big_win'] = 0
    
    for i in range(len(df)):
        if i == 0:
            df.loc[i, 'time_since_big_win'] = 0
        else:
            last_big_win = big_win_indices[big_win_indices < i]
            if len(last_big_win) > 0:
                last_big_win_idx = last_big_win.max()
                df.loc[i, 'time_since_big_win'] = (df.loc[i, 'timestamp'] - df.loc[last_big_win_idx, 'timestamp']).total_seconds()
            else:
                df.loc[i, 'time_since_big_win'] = df.loc[i, 'time_since_last_raffle']
    
    # Win streak pattern
    df['win_streak'] = 0
    for i in range(1, len(df)):
        if df.loc[i, 'user'] == df.loc[i-1, 'user']:
            df.loc[i, 'win_streak'] = df.loc[i-1, 'win_streak'] + 1
    
    # Consecutive same user count
    df['consecutive_same_user'] = 0
    current_user = None
    count = 0
    
    for i, user in enumerate(df['user']):
        if user == current_user:
            count += 1
        else:
            count = 0
            current_user = user
        df.loc[i, 'consecutive_same_user'] = count
    
    return df

def set_running_status(status):
    """Set the running status in the status file"""
    with open(STATUS_FILE, "w") as f:
        f.write("RUNNING" if status else "STOPPED")
    log_status(f"Collection status set to {'RUNNING' if status else 'STOPPED'}")

def get_running_status():
    """Get the running status from the status file"""
    if not os.path.exists(STATUS_FILE):
        set_running_status(True)
        return True
    
    with open(STATUS_FILE, "r") as f:
        status = f.read().strip()
    
    return status == "RUNNING"

def signal_handler(sig, frame):
    """Handle exit signals to gracefully stop the collection"""
    global running
    log_status("Received exit signal. Stopping collection...")
    running = False
    set_running_status(False)

def collect_raffle_data(check_interval_seconds=30, save_interval_minutes=5):
    """
    Function to collect raffle data in background mode
    
    Parameters:
    - check_interval_seconds: How often to check for new raffles (in seconds)
    - save_interval_minutes: How often to save data (in minutes)
    """
    global running
    
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Set initial running status
    set_running_status(True)
    running = True
    
    # Load existing data if available
    df = load_data()
    log_status(f"Loaded {len(df)} existing records")
    
    # Initialize a set to track processed raffle IDs
    processed_raffles = set()
    if not df.empty:
        # Assume the combination of user and drawAt makes a unique identifier
        processed_raffles = set(df['user'] + '_' + df['drawAt'])
    
    start_time = datetime.now()
    last_save_time = start_time
    iteration = 0
    
    log_status(f"Starting data collection at {start_time}")
    log_status(f"Checking every {check_interval_seconds} seconds, saving every {save_interval_minutes} minutes")
    log_status(f"Logs and data stored in {log_dir}")
    
    try:
        while running and get_running_status():
            current_time = datetime.now()
            iteration += 1
            
            # Fetch new raffle data
            items = fetch_raffle_data()
            
            if items:
                # Process new items
                new_records = []
                for item in items:
                    raffle_id = item['user'] + '_' + item['drawAt']
                    if raffle_id not in processed_raffles:
                        new_records.append(process_raffle_item(item))
                        processed_raffles.add(raffle_id)
                
                # If we have new records, add them to our DataFrame
                if new_records:
                    new_df = pd.DataFrame(new_records)
                    df = pd.concat([df, new_df], ignore_index=True)
                    
                    # Add features
                    df = add_features(df)
                    
                    log_status(f"{len(new_records)} new raffles found (Total: {len(df)})")
            
            # Save at specified intervals
            time_since_last_save = (current_time - last_save_time).total_seconds() / 60
            if time_since_last_save >= save_interval_minutes:
                save_data(df)
                last_save_time = current_time
            
            # Check if we should still be running
            running = get_running_status()
            
            # Sleep until next check
            time.sleep(check_interval_seconds)
    
    except Exception as e:
        log_status(f"Error in collection: {e}")
    finally:
        # Save final data
        save_data(df)
        log_status(f"Data collection ended at {datetime.now()}")
        log_status(f"Collected {len(df)} raffle records")
        set_running_status(False)
    
    return df

def toggle_collection():
    """Toggle the collection status"""
    current_status = get_running_status()
    set_running_status(not current_status)
    return not current_status

if __name__ == "__main__":
    # Check for command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1].lower() == "start":
            set_running_status(True)
            print("Raffle collection started")
        elif sys.argv[1].lower() == "stop":
            set_running_status(False)
            print("Raffle collection stopped")
        elif sys.argv[1].lower() == "toggle":
            new_status = toggle_collection()
            print(f"Raffle collection {'started' if new_status else 'stopped'}")
        elif sys.argv[1].lower() == "status":
            status = get_running_status()
            print(f"Raffle collection is currently {'RUNNING' if status else 'STOPPED'}")
        elif sys.argv[1].lower() == "logs":
            if os.path.exists(STATUS_LOG):
                with open(STATUS_LOG, "r") as f:
                    print(f.read())
            else:
                print("No logs found")
    else:
        # Default behavior is to run the collection
        collect_raffle_data(check_interval_seconds=30, save_interval_minutes=5)
