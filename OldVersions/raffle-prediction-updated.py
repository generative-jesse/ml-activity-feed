# Cell 1: Install required dependencies
# @title Install Dependencies
!pip install pandas numpy scikit-learn matplotlib seaborn requests tqdm

# Cell 2: Import libraries and setup
# @title Import Libraries
import pandas as pd
import numpy as np
import requests
import json
import time
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import pickle
import os
from tqdm.notebook import tqdm
import warnings
warnings.filterwarnings('ignore')

# Set API URL
API_URL = "https://api.merkle.trade/v1/season/s29/dashboard/recent-draws"

# Cell 3: Data Collection Functions
# @title Data Collection Functions
def fetch_raffle_data():
    """Fetch raffle data from the API"""
    try:
        response = requests.get(API_URL)
        response.raise_for_status()
        data = response.json()
        return data['items']
    except Exception as e:
        print(f"Error fetching data: {e}")
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

# Cell 4: Data Storage Functions
# @title Data Storage Functions
def save_data(df, filename='raffle_data.csv'):
    """Save the DataFrame to a CSV file"""
    df.to_csv(filename, index=False)
    print(f"Data saved to {filename}")
    
    # Also save a text log of recent raffles
    recent = df.sort_values('timestamp', ascending=False).head(20)
    with open('recent_raffles.txt', 'w') as f:
        f.write(f"=== Recent Raffles (Updated: {datetime.now()}) ===\n\n")
        for _, row in recent.iterrows():
            f.write(f"Time: {row['timestamp']}\n")
            f.write(f"User: {row['username']} ({row['user'][:8]}...)\n")
            f.write(f"Leverage: {row['leverage']}\n")
            f.write(f"Reward: {row['reward_amount']:.4f} (Tier {row['reward_tier']})\n")
            f.write("-" * 40 + "\n")
    print(f"Recent raffles log saved to recent_raffles.txt")

def load_data(filename='raffle_data.csv'):
    """Load data from a CSV file"""
    if os.path.exists(filename):
        df = pd.read_csv(filename)
        # Convert timestamp column back to datetime
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'])
        return df
    return initialize_dataframe()

# Cell 5: Feature Engineering
# @title Feature Engineering Functions
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

# Cell 6: Raffle Data Collection Main (Run this cell to collect data)
# @title Data Collection Loop (Separate from ML)
def collect_raffle_data(duration_days=13, check_interval_minutes=1, save_interval_minutes=10):
    """
    Function to collect raffle data without ML predictions
    
    Parameters:
    - duration_days: How long to run the data collection (in days)
    - check_interval_minutes: How often to check for new raffles (in minutes)
    - save_interval_minutes: How often to save data (in minutes)
    """
    # Convert days to minutes for internal calculation
    duration_minutes = duration_days * 24 * 60
    # Convert minutes to seconds for sleep function
    check_interval_seconds = check_interval_minutes * 60
    
    # Load existing data if available
    df = load_data()
    
    # Initialize a set to track processed raffle IDs
    processed_raffles = set()
    if not df.empty:
        # Assume the combination of user and drawAt makes a unique identifier
        processed_raffles = set(df['user'] + '_' + df['drawAt'])
    
    # Calculate iterations
    total_iterations = (duration_minutes * 60) // check_interval_seconds
    
    start_time = datetime.now()
    end_time = start_time + timedelta(days=duration_days)
    last_save_time = start_time
    
    print(f"Starting data collection at {start_time}")
    print(f"Will run until {end_time} (approximately {duration_days} days)")
    print(f"Checking every {check_interval_minutes} minute(s), saving every {save_interval_minutes} minute(s)")
    
    try:
        for iteration in range(total_iterations):
            current_time = datetime.now()
            
            # Calculate and display progress
            elapsed = (current_time - start_time).total_seconds()
            total_duration = (end_time - start_time).total_seconds()
            progress = (elapsed / total_duration) * 100
            
            time_left = end_time - current_time
            days_left = time_left.days
            hours_left = time_left.seconds // 3600
            minutes_left = (time_left.seconds % 3600) // 60
            
            print(f"\r[{progress:.1f}%] Iteration {iteration}/{total_iterations} | " + 
                  f"Time left: ~{days_left}d {hours_left}h {minutes_left}m | " +
                  f"Records: {len(df)}", end="")
            
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
                    
                    print(f"\n{len(new_records)} new raffles found at {current_time}")
            
            # Save at specified intervals
            time_since_last_save = (current_time - last_save_time).total_seconds() / 60
            if time_since_last_save >= save_interval_minutes:
                save_data(df)
                last_save_time = current_time
            
            # Sleep until next check
            time.sleep(check_interval_seconds)
    
    except KeyboardInterrupt:
        print("\n\nData collection interrupted by user")
    finally:
        # Save final data
        save_data(df)
        print(f"\nData collection ended at {datetime.now()}")
        print(f"Collected {len(df)} raffle records")
    
    return df

# Cell 7: ML Functions
# @title Machine Learning Functions
def prepare_model_data(df):
    """Prepare data for model training"""
    # Create target variable - we'll predict reward_amount
    X = df[['leverage', 'time_since_last_raffle', 'time_since_big_win', 
            'win_streak', 'consecutive_same_user']]
    y = df['reward_amount']
    
    return X, y

def train_model(X, y):
    """Train a machine learning model to predict raffle outcomes"""
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Create and train model
    model = GradientBoostingRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    # Evaluate model
    y_pred = model.predict(X_test)
    mse = mean_squared_error(y_test, y_pred)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    
    print(f"Model Performance:")
    print(f"Mean Squared Error: {mse:.4f}")
    print(f"Mean Absolute Error: {mae:.4f}")
    print(f"R² Score: {r2:.4f}")
    
    return model

def predict_best_time(model, df, current_time=None):
    """Predict the best time to play the raffle"""
    if current_time is None:
        current_time = datetime.now()
    
    # Create a range of potential future times to check
    future_times = [current_time + timedelta(minutes=i) for i in range(60)]
    predictions = []
    
    # Latest raffle data
    if len(df) > 0:
        latest_raffle = df.iloc[-1]
        last_big_win_time = df[df['reward_tier'] <= 2].iloc[-1]['timestamp'] if len(df[df['reward_tier'] <= 2]) > 0 else latest_raffle['timestamp']
        
        for future_time in future_times:
            # Create features for this potential time
            time_since_last = (future_time - latest_raffle['timestamp'].to_pydatetime()).total_seconds()
            time_since_big_win = (future_time - last_big_win_time.to_pydatetime()).total_seconds()
            
            # Create a prediction for different leverage values
            for leverage in range(1, 16):
                features = {
                    'leverage': leverage,
                    'time_since_last_raffle': time_since_last,
                    'time_since_big_win': time_since_big_win,
                    'win_streak': latest_raffle['win_streak'],
                    'consecutive_same_user': latest_raffle['consecutive_same_user']
                }
                
                X_pred = pd.DataFrame([features])
                predicted_reward = model.predict(X_pred)[0]
                
                predictions.append({
                    'time': future_time,
                    'leverage': leverage,
                    'predicted_reward': predicted_reward,
                    'minutes_from_now': (future_time - current_time).total_seconds() / 60
                })
    
    # Convert to DataFrame and find best prediction
    if predictions:
        predictions_df = pd.DataFrame(predictions)
        best_prediction = predictions_df.loc[predictions_df['predicted_reward'].idxmax()]
        
        return best_prediction, predictions_df
    
    return None, None

# Cell 8: Visualization Functions
# @title Visualization Functions
def plot_raffle_history(df):
    """Plot raffle history and patterns"""
    plt.figure(figsize=(14, 10))
    
    # Time series of rewards
    plt.subplot(2, 2, 1)
    plt.scatter(df['timestamp'], df['reward_amount'], alpha=0.7, c=df['leverage'], cmap='viridis')
    plt.colorbar(label='Leverage')
    plt.title('Reward Amount Over Time')
    plt.xlabel('Time')
    plt.ylabel('Reward Amount')
    plt.xticks(rotation=45)
    
    # Distribution of rewards by leverage
    plt.subplot(2, 2, 2)
    sns.boxplot(x='leverage', y='reward_amount', data=df)
    plt.title('Reward Distribution by Leverage')
    plt.xlabel('Leverage')
    plt.ylabel('Reward Amount')
    
    # Time since last raffle vs reward
    plt.subplot(2, 2, 3)
    plt.scatter(df['time_since_last_raffle'], df['reward_amount'], alpha=0.7, c=df['leverage'], cmap='viridis')
    plt.colorbar(label='Leverage')
    plt.title('Reward vs Time Since Last Raffle')
    plt.xlabel('Time Since Last Raffle (seconds)')
    plt.ylabel('Reward Amount')
    
    # Time since big win vs reward
    plt.subplot(2, 2, 4)
    plt.scatter(df['time_since_big_win'], df['reward_amount'], alpha=0.7, c=df['leverage'], cmap='viridis')
    plt.colorbar(label='Leverage')
    plt.title('Reward vs Time Since Big Win')
    plt.xlabel('Time Since Big Win (seconds)')
    plt.ylabel('Reward Amount')
    
    plt.tight_layout()
    plt.show()

def plot_predictions(predictions_df):
    """Plot predictions for different times and leverage values"""
    if predictions_df is None:
        print("No predictions available")
        return
    
    plt.figure(figsize=(14, 6))
    
    # Create a pivot table for the heatmap
    pivot = predictions_df.pivot(index='leverage', columns='minutes_from_now', values='predicted_reward')
    
    # Plot heatmap
    sns.heatmap(pivot, cmap='viridis', annot=False)
    plt.title('Predicted Reward by Time and Leverage')
    plt.xlabel('Minutes from Now')
    plt.ylabel('Leverage')
    
    plt.tight_layout()
    plt.show()

def analyze_patterns(df):
    """Analyze patterns in the raffle data"""
    if len(df) < 10:
        print("Not enough data for meaningful analysis")
        return
    
    # Overall statistics
    print("=== Raffle Statistics ===")
    print(f"Total raffles: {len(df)}")
    print(f"Unique users: {df['user'].nunique()}")
    print(f"Average reward: {df['reward_amount'].mean():.4f}")
    print(f"Max reward: {df['reward_amount'].max():.4f}")
    
    # Best leverage values
    leverage_performance = df.groupby('leverage')['reward_amount'].agg(['mean', 'max', 'count']).reset_index()
    print("\n=== Leverage Performance ===")
    print(leverage_performance.sort_values('mean', ascending=False).head())
    
    # Time patterns
    df['hour'] = df['timestamp'].dt.hour
    hourly_performance = df.groupby('hour')['reward_amount'].mean().reset_index()
    
    print("\n=== Hourly Performance ===")
    print(hourly_performance.sort_values('reward_amount', ascending=False).head())
    
    # Plot hourly performance
    plt.figure(figsize=(12, 6))
    sns.barplot(x='hour', y='reward_amount', data=hourly_performance)
    plt.title('Average Reward by Hour of Day')
    plt.xlabel('Hour')
    plt.ylabel('Average Reward')
    plt.show()
    
    # Save analysis results to file
    with open('raffle_analysis.txt', 'w') as f:
        f.write(f"=== Raffle Analysis (Generated: {datetime.now()}) ===\n\n")
        f.write(f"Total raffles: {len(df)}\n")
        f.write(f"Unique users: {df['user'].nunique()}\n")
        f.write(f"Average reward: {df['reward_amount'].mean():.4f}\n")
        f.write(f"Max reward: {df['reward_amount'].max():.4f}\n\n")
        
        f.write("=== Leverage Performance ===\n")
        f.write(leverage_performance.sort_values('mean', ascending=False).head().to_string())
        f.write("\n\n")
        
        f.write("=== Hourly Performance ===\n")
        f.write(hourly_performance.sort_values('reward_amount', ascending=False).head().to_string())
    
    print("Analysis saved to raffle_analysis.txt")

# Cell 9: Run Machine Learning Analysis (Run this cell for ML predictions)
# @title Run ML Analysis on Collected Data
def run_ml_analysis():
    """Run machine learning analysis on collected data"""
    # Load data
    print("Loading data...")
    df = load_data()
    
    if len(df) < 20:
        print(f"Not enough data for ML analysis. Only {len(df)} records found.")
        return
    
    # Prepare data for model
    print("Preparing data...")
    X, y = prepare_model_data(df)
    
    # Train model
    print("Training model...")
    model = train_model(X, y)
    
    # Make predictions
    print("Making predictions...")
    current_time = datetime.now()
    best_prediction, predictions_df = predict_best_time(model, df, current_time)
    
    if best_prediction is not None:
        print("\nBest time to play:")
        print(f"Time: {best_prediction['time']}")
        print(f"Minutes from now: {best_prediction['minutes_from_now']:.1f}")
        print(f"Recommended leverage: {best_prediction['leverage']}")
        print(f"Predicted reward: {best_prediction['predicted_reward']:.4f}")
        
        # Save prediction to file
        with open('raffle_prediction.txt', 'w') as f:
            f.write(f"=== Raffle Prediction (Generated: {current_time}) ===\n\n")
            f.write(f"Best time to play: {best_prediction['time']}\n")
            f.write(f"Minutes from now: {best_prediction['minutes_from_now']:.1f}\n")
            f.write(f"Recommended leverage: {best_prediction['leverage']}\n")
            f.write(f"Predicted reward: {best_prediction['predicted_reward']:.4f}\n")
        
        print("Prediction saved to raffle_prediction.txt")
    
    # Visualize data and predictions
    print("Generating visualizations...")
    plot_raffle_history(df)
    plot_predictions(predictions_df)
    analyze_patterns(df)
    
    # Save model
    with open('raffle_prediction_model.pkl', 'wb') as f:
        pickle.dump(model, f)
    print("Model saved to raffle_prediction_model.pkl")
    
    return model

# To run data collection:
# df = collect_raffle_data(duration_days=13, check_interval_minutes=1, save_interval_minutes=10)

# To run ML analysis:
# model = run_ml_analysis()
