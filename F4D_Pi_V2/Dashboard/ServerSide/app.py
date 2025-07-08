import streamlit as st
import pandas as pd
from datetime import datetime, timedelta, date
from pandas import json_normalize
import plotly.express as px
import os
import logging
import csv

# just added a comment

from data import get_dbs_and_collections, fetch_data, reload_dbs_and_collections
from dashboard import dash_board
# check updates
# Define the log directory path
log_dir = 'home/pi/6to4/Dashboard/ServerSide/logs'

# Create logs directory if it does not exist
if not os.path.exists(log_dir):
    os.makedirs(log_dir)

# Configure logging
logging.basicConfig(
    filename=os.path.join(log_dir, 'app.log'),
    level=logging.INFO,
    format='%(asctime)s,%(levelname)s,%(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

def main():
    st.session_state['logged_in'] = True
    # Display login or dashboard based on login status
    if st.session_state['logged_in']:
        dash_board()

if __name__ == '__main__':
    main()
