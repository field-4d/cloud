import sys
import re
import requests
import pandas as pd
from google.cloud import bigquery

# ==========================================
# HELPER FUNCTIONS (SORTING & FORMATTING)
# ==========================================
def natural_sort_key(s):
    """Splits text and numbers to allow human-natural sorting (e.g., Sensor 2 before Sensor 10)."""
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]

def get_problematic_rows(dataframe):
    """Filters the dataframe to ONLY include rows that have an active health alert."""
    problem_indices = []
    for idx, row in dataframe.iterrows():
        is_alert = False
        if row.get('Is Active [1]') == 'X':
            is_alert = True
        elif row.get('Battery Status [2]') in ['REPLACE BATTERY', 'POSSIBLE BATTERY ISSUE']:
            is_alert = True
        else:
            try:
                if float(row.get('Packet Loss (%) [3]', 0)) > 5.0:
                    is_alert = True
            except (ValueError, TypeError):
                pass
        if is_alert:
            problem_indices.append(idx)
    return dataframe.loc[problem_indices].copy()

def generate_inline_html_table(dataframe):
    """Generates the HTML table with domain-specific conditional formatting and natural sorting."""
    if dataframe.empty:
        return ""
        
    df_sorted = dataframe.copy()
    df_sorted['sort_key'] = df_sorted['Location'].apply(natural_sort_key)
    df_sorted = df_sorted.sort_values(by='sort_key').drop(columns=['sort_key'])

    html = '<table style="border-collapse: collapse; width: 100%; margin-bottom: 30px;">'
    html += "<tr>"
    
    display_cols = ['Location', 'Device_Name', 'Last_Seen', 'Is Active [1]', 'Battery Status [2]', 'Packet Loss (%) [3]']
    
    for col in display_cols:
        if col in df_sorted.columns:
            html += f'<th style="border: 1px solid #dddddd; text-align: center; padding: 10px; background-color: #85c1ad; color: #ffffff; font-weight: bold;">{col}</th>'
    html += "</tr>"
    
    for _, row in df_sorted.iterrows():
        html += "<tr>"
        for col in display_cols:
            if col not in df_sorted.columns: continue
            val = row[col]
            cell_style = "border: 1px solid #dddddd; text-align: center; padding: 10px;"
            
            if col == 'Is Active [1]' and val == 'X':
                cell_style += " background-color: #ffe6e6; color: #cc0000; font-weight: bold;"
            elif col == 'Last_Seen' and row.get('Is Active [1]') == 'X':
                cell_style += " background-color: #ffe6e6; color: #cc0000; font-weight: bold;"
            elif col == 'Battery Status [2]':
                if val == 'REPLACE BATTERY':
                    cell_style += " background-color: #ffe6e6; color: #cc0000; font-weight: bold;"
                elif val == 'POSSIBLE BATTERY ISSUE':
                    cell_style += " background-color: #fff3cd; color: #d39e00; font-weight: bold;"
            elif col == 'Packet Loss (%) [3]':
                try:
                    if float(val) > 90.0:
                        cell_style += " background-color: #ffe6e6; color: #cc0000; font-weight: bold;"
                    elif float(val) > 5.0:
                        cell_style += " background-color: #fff3cd; color: #d39e00; font-weight: bold;"
                except (ValueError, TypeError):
                    pass
                
            html += f'<td style="{cell_style}">{val}</td>'
        html += "</tr>"
        
    html += "</table>"
    return html

# ==========================================
# MAIN ENTRY POINT FOR CLOUD FUNCTION
# ==========================================
def send_daily_reports(request):
    """HTTP Cloud Function to generate and dispatch system status reports synchronized with Firestore."""
    print("[INFO] Cloud Function triggered: send_daily_reports (25-Hour Window)")
    
    try:
        client = bigquery.Client()
    except Exception as e:
        print(f"[ERROR] Failed to initialize BigQuery client: {e}")
        return ("Internal Server Error: BQ Init Failed", 500)
    
    # Optimized query restricting the scan to the last 25 hours
    query = """
    WITH Permissions AS (
      SELECT DISTINCT Email, Mac_Address
      FROM `iucc-f4d.Field4D.F4D_permissions`
      WHERE Email IN (
        SELECT DISTINCT Email 
        FROM `iucc-f4d.Field4D.F4D_permissions` 
        WHERE Role = 'system_admin'
      )
    ),
    Base_Data AS (
      SELECT 
        Exp_Name, Owner, Mac_Address, LLA, Location AS NAME, Variable, Value, Timestamp, 
        IFNULL(Time_Zone, 'Asia/Jerusalem') AS Tz,
        MIN(Timestamp) OVER(PARTITION BY Exp_Name) AS Exp_Birth 
      FROM `iucc-f4d.Field4D.F4D_sensors_data` d
      WHERE Exp_Name IS NOT NULL 
        AND Timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 25 HOUR)
        AND EXISTS (SELECT 1 FROM Permissions p WHERE p.Mac_Address = d.Mac_Address)
    ),
    Battery_Raw AS (
      SELECT LLA, Value, Timestamp, Tz,
             ROW_NUMBER() OVER(PARTITION BY LLA ORDER BY Timestamp DESC) as rn
      FROM Base_Data
      WHERE Variable = 'battery'
    ),
    Battery_Logic AS (
      SELECT 
        LLA,
        IF(COUNTIF(rn <= 20 AND Value < 2700) / NULLIF(COUNTIF(rn <= 20), 0) > 0.20, 'REPLACE',
           IF(COUNTIF(Timestamp >= TIMESTAMP_SUB(CAST(CURRENT_DATETIME(Tz) AS TIMESTAMP), INTERVAL 1 HOUR) AND Value < 2700) >= 3
              OR COUNTIF(Timestamp >= TIMESTAMP_SUB(CAST(CURRENT_DATETIME(Tz) AS TIMESTAMP), INTERVAL 3 HOUR) AND Value < 2700) >= 6, 
              'WARNING', 'OK')
        ) AS Battery_Status
      FROM Battery_Raw
      GROUP BY LLA, Tz
    ),
    Sensor_Metrics AS (
      SELECT 
        NAME, Owner, Mac_Address, Exp_Name, LLA, Tz,
        MAX(Timestamp) AS Last_Seen,
        COUNT(DISTINCT CASE WHEN Timestamp >= TIMESTAMP_SUB(CAST(CURRENT_DATETIME(Tz) AS TIMESTAMP), INTERVAL 24 HOUR) THEN Timestamp END) AS Actual,
        IF(MAX(Exp_Birth) >= TIMESTAMP_SUB(CAST(CURRENT_DATETIME(Tz) AS TIMESTAMP), INTERVAL 24 HOUR),
           TIMESTAMP_DIFF(CAST(CURRENT_DATETIME(Tz) AS TIMESTAMP), MAX(Exp_Birth), MINUTE) / 3.0,
           480.0) AS Expected
      FROM Base_Data
      GROUP BY NAME, Owner, Mac_Address, Exp_Name, LLA, Tz
    ),
    Device_Mapping AS (
      SELECT DISTINCT Mac_Address, Device_Name
      FROM `iucc-f4d.Field4D.F4D_mac_to_device` 
      WHERE Device_Name IS NOT NULL
    )
    SELECT 
      P.Email,
      S.Owner,
      IFNULL(D.Device_Name, S.Mac_Address) AS Device_Name, 
      S.Mac_Address,
      S.Exp_Name,
      S.NAME AS Location,
      IF(S.Last_Seen >= TIMESTAMP_SUB(CAST(CURRENT_DATETIME(S.Tz) AS TIMESTAMP), INTERVAL 15 MINUTE), 'YES', 'NO') AS Is_Active,
      IFNULL(B.Battery_Status, 'OK') AS Battery_Status,
      IF(S.Actual = 0, 
         100.0, 
         IFNULL(ROUND(((S.Expected - S.Actual) / NULLIF(S.Expected, 0)) * 100, 2), 0.0)
      ) AS Packet_Loss,
      S.Last_Seen,
      CAST(CURRENT_DATETIME(S.Tz) AS TIMESTAMP) AS Live_Time
    FROM Sensor_Metrics S 
    LEFT JOIN Battery_Logic B ON S.LLA = B.LLA
    LEFT JOIN Device_Mapping D ON S.Mac_Address = D.Mac_Address
    INNER JOIN Permissions P ON S.Mac_Address = P.Mac_Address 
    ORDER BY S.Owner, S.Mac_Address, S.Exp_Name, S.NAME;
    """
    
    try:
        print("[INFO] Executing BigQuery (25-Hour window)...")
        df = client.query(query).to_dataframe()
    except Exception as e:
        print(f"[ERROR] BigQuery execution failed: {e}")
        return ("Database Error", 500)
    
    if df.empty:
        print("[WARNING] No active network topology rows mapped to system admins. Exiting.")
        return ("No data found.", 200)
    
    df['Is_Active'] = df['Is_Active'].replace({'YES': '✓', 'NO': 'X'})
    battery_map = {'OK': 'OK', 'REPLACE': 'REPLACE BATTERY', 'WARNING': 'POSSIBLE BATTERY ISSUE'}
    df['Battery_Status'] = df['Battery_Status'].map(battery_map).fillna('OK')
    df['Last_Seen_dt'] = pd.to_datetime(df['Last_Seen'], utc=True)
    df['Live_Time_dt'] = pd.to_datetime(df['Live_Time'])
    df['Last_Seen'] = df['Last_Seen_dt'].dt.strftime('%Y-%m-%d %H:%M:%S')
    
    df.rename(columns={
        'Is_Active': 'Is Active [1]',
        'Battery_Status': 'Battery Status [2]',
        'Packet_Loss': 'Packet Loss (%) [3]'
    }, inplace=True)
    
    # ---------------------------------------------------------
    # FETCH FIRESTORE APIS (EXPERIMENTS + LAST PACKAGE)
    # ---------------------------------------------------------
    print("[INFO] Fetching metadata from Firestore APIs...")
    fs_exp_api = "https://apisync-1000435921680.us-central1.run.app/GCP-FS/metadata/experiments"
    fs_sensors_api = "https://apisync-1000435921680.us-central1.run.app/GCP-FS/last-package"
    api_data = {}
    unique_devices = df[['Owner', 'Mac_Address']].drop_duplicates()
    
    for _, row in unique_devices.iterrows():
        owner = row['Owner']
        mac = row['Mac_Address']
        try:
            exp_resp = requests.get(fs_exp_api, params={"owner": owner, "mac_address": mac}, timeout=15)
            exps = exp_resp.json().get("experiments", []) if exp_resp.status_code == 200 else []
            
            sens_resp = requests.get(fs_sensors_api, params={"owner": owner, "mac_address": mac}, timeout=15)
            sensors = sens_resp.json().get("data", []) if sens_resp.status_code == 200 else []
            
            api_data[(owner, mac)] = {"experiments": exps, "sensors": sensors}
        except Exception as e:
            print(f"[ERROR] Sync API failure for {owner}/{mac}: {e}")
            api_data[(owner, mac)] = {"experiments": [], "sensors": []}
            
    # ---------------------------------------------------------
    # HIERARCHICAL ANALYSIS & DISPATCH
    # ---------------------------------------------------------
    print("[INFO] Processing hierarchical grouping and dispatching reports...")
    API_URL_EMAIL = "https://f4d-email-sender-1000435921680.europe-west1.run.app"
    success_count = 0
    fail_count = 0
    
    for target_email, user_df in df.groupby('Email'):
        html_body = f"""
        <html>
          <head>
            <style>
              body {{ font-family: Arial, sans-serif; color: #333; direction: ltr; }}
              .owner-header {{ background-color: #2c3e50; color: white; padding: 12px; margin-top: 40px; border-radius: 4px; }}
              .mac-header {{ background-color: #ecf0f1; border-left: 5px solid #2980b9; padding: 8px 12px; margin-top: 20px; color: #2c3e50; }}
              .exp-box {{ background-color: #f9f9f9; border-left: 6px solid #a8ab58; padding: 10px 15px; border-radius: 4px; margin-bottom: 10px; margin-top: 15px; }}
              .stopped-exp-box {{ background-color: #f2f4f4; border-left: 6px solid #7f8c8d; padding: 10px 15px; border-radius: 4px; margin-bottom: 10px; margin-top: 15px; }}
              h2 {{ margin: 0; font-size: 20px; }}
              h3 {{ margin: 0; font-size: 16px; }}
              h4 {{ margin: 0; color: #333; display: flex; justify-content: space-between; align-items: center; font-size: 15px; }}
              .badge {{ font-size: 13px; font-weight: bold; padding: 5px 10px; border-radius: 12px; }}
              .badge-issue {{ background-color: #f1f3f4; color: #5f6368; }} 
              .badge-good {{ background-color: #e8f5e9; color: #2e7d32; }} 
              .badge-neutral {{ background-color: #bdc3c7; color: #2c3e50; }}
              .completion-notice {{ background-color: #e8f5e9; color: #2e7d32; padding: 12px; border-radius: 4px; border: 1px solid #c8e6c9; margin-bottom: 30px; font-weight: bold; text-align: center; }}
              .all-good-box {{ background-color: #e8f5e9; color: #2e7d32; padding: 12px; border-radius: 4px; border: 1px solid #c8e6c9; margin-bottom: 30px; text-align: center; font-weight: bold; }}
            </style>
          </head>
          <body>
            <h1 style="color: #85c1ad;">Field 4D - System Administration Sensor Status Report</h1>
            <p>Ground-Truth Sync with Firestore. Target Administrator: <b>{target_email}</b>.</p>
            <hr>
        """
        
        owners = sorted(user_df['Owner'].unique(), key=natural_sort_key)
        for owner in owners:
            html_body += f"<div class='owner-header'><h2>Owner: {owner}</h2></div>"
            owner_df = user_df[user_df['Owner'] == owner]
            
            macs = sorted(owner_df['Mac_Address'].unique(), key=natural_sort_key)
            for mac in macs:
                mac_df = owner_df[owner_df['Mac_Address'] == mac]
                device_name = str(mac_df['Device_Name'].iloc[0])
                
                # Prevent duplicate MAC address in title
                if mac in device_name:
                    device_display = f"Device: {device_name}"
                else:
                    device_display = f"Device: {device_name} (MAC: {mac})"
                    
                html_body += f"<div class='mac-header'><h3>{device_display}</h3></div>"
                
                fs_experiments = api_data[(owner, mac)]['experiments']
                fs_sensors = api_data[(owner, mac)]['sensors']
                
                fs_exp_names = {exp['exp_name'] for exp in fs_experiments}
                bq_exp_names = mac_df['Exp_Name'].unique()
                
                now_utc = pd.Timestamp.utcnow()
                all_experiments = set(bq_exp_names)
                
                for exp_name in sorted(all_experiments, key=natural_sort_key):
                    exp_df = mac_df[mac_df['Exp_Name'] == exp_name]
                    last_seen_in_bq = exp_df['Last_Seen_dt'].max()
                    
                    is_active_exp = exp_name in fs_exp_names
                    is_recently_stopped = not is_active_exp and (now_utc - last_seen_in_bq) <= pd.Timedelta(hours=24)
                    
                    if not is_active_exp and not is_recently_stopped:
                        continue

                    if is_recently_stopped:
                        html_body += f"""
                        <div class="stopped-exp-box">
                          <h4>
                            Experiment: {exp_name if exp_name else "Unnamed Experiment"}
                            <span class="badge badge-neutral">Stopped</span>
                          </h4>
                        </div>
                        """
                        last_seen_str = last_seen_in_bq.strftime('%Y-%m-%d %H:%M:%S')
                        html_body += f"<div class='completion-notice'>Experiment termination detected. Final system transmission recorded at: {last_seen_str}</div>"
                            
                    else:
                        api_info = next((item for item in fs_experiments if item["exp_name"] == exp_name), None)
                        fs_active_count = api_info['active_count'] if api_info else len(exp_df)
                        
                        expected_sensors = [s for s in fs_sensors if s.get('Exp_Name') == exp_name and s.get('Is_Active') == True]
                        actual_locations = exp_df['Location'].tolist()
                        vanished_rows = []
                        
                        for s in expected_sensors:
                            loc = s.get('Location')
                            if loc not in actual_locations:
                                raw_last_seen = s.get('Last_Seen')
                                if raw_last_seen:
                                    dt = pd.to_datetime(raw_last_seen)
                                    if dt.tzinfo is not None:
                                        dt = dt.tz_convert('Asia/Jerusalem')
                                    rounded_time = dt.ceil('3min').strftime('%Y-%m-%d %H:%M:%S')
                                else:
                                    rounded_time = "Unknown"
                                    
                                vanished_rows.append({
                                    'Location': loc,
                                    'Device_Name': device_name,
                                    'Last_Seen': rounded_time,
                                    'Is Active [1]': 'X',
                                    'Battery Status [2]': '-',
                                    'Packet Loss (%) [3]': '-'
                                })
                                
                        problem_df = get_problematic_rows(exp_df)
                        if vanished_rows:
                            problem_df = pd.concat([problem_df, pd.DataFrame(vanished_rows)], ignore_index=True)
                            
                        bad_sensors = problem_df['Location'].nunique()
                        
                        if bad_sensors > 0:
                            badge_class = "badge badge-issue"
                            badge_text = f"{bad_sensors} / {fs_active_count} sensors require attention"
                        else:
                            badge_class = "badge badge-good"
                            badge_text = f"All {fs_active_count} sensors are healthy"
                            
                        html_body += f"""
                        <div class="exp-box">
                          <h4>
                            Experiment: {exp_name if exp_name else "Unnamed Experiment"}
                            <span class="{badge_class}">{badge_text}</span>
                          </h4>
                        </div>
                        """
                        
                        if problem_df.empty:
                            html_body += "<div class='all-good-box'>All sensors in this experiment are operating normally.</div>"
                        else:
                            table_df = problem_df[['Location', 'Device_Name', 'Last_Seen', 'Is Active [1]', 'Battery Status [2]', 'Packet Loss (%) [3]']]
                            html_body += generate_inline_html_table(table_df)

        html_body += """
        <div style="margin-top: 30px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #85c1ad; font-size: 13px; color: #444; line-height: 1.6;">
          <strong>Metrics Explanation:</strong><br>
          <strong>[1] Is Active:</strong> Evaluates to '✓' if the database has successfully received a data packet from the sensor within the last 15 minutes. Otherwise 'X'.<br>
          <strong>[2] Battery Status:</strong> <br>
          &nbsp;&nbsp;&nbsp;• <b>REPLACE BATTERY:</b> >20% of the last 20 pings dropped below 2700mV.<br>
          &nbsp;&nbsp;&nbsp;• <b>POSSIBLE BATTERY ISSUE:</b> 3 low pings in the last 1H OR 6 in the last 3H.<br>
          <strong>[3] Packet Loss:</strong> Calculates the percentage of missed network pings over a rolling 24-hour window, based on an expected rate of 1 ping every 3 minutes (480 packets per day).
        </div>
      </body>
    </html>
    """

        payload = {
            "to": target_email, 
            "subject": "Field 4D: System Admin Network Status Report",
            "body": html_body,
            "is_html": True
        }

        try:
            response = requests.post(API_URL_EMAIL, json=payload, timeout=30)
            response.raise_for_status()
            print(f"[INFO] Successfully transmitted report to {target_email}")
            success_count += 1
        except Exception as e:
            print(f"[ERROR] Failed email dispatch for {target_email}: {e}")
            fail_count += 1
        
    print(f"[INFO] Execution completed. Success: {success_count}, Failed: {fail_count}")
    if fail_count == 0:
        return ("Reports transmitted successfully.", 200)
    else:
        return (f"Partial failure. Failed: {fail_count}", 207)