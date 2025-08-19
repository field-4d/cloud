import os
import smtplib
import pandas as pd
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from google.cloud import bigquery

# Optional: if running locally and not using Cloud Function's default service account
from google.auth import default
client, _ = default()
bq_client = bigquery.Client()

# --- CONFIG ---
DEFAULT_EMAILS = [
    "nir.averbuch@mail.huji.ac.il",
    "idan.ifrach@mail.huji.ac.il",
    "menachem.moshelion@mail.huji.ac.il",
    "bnaya.hami@mail.huji.ac.il",
    "Field4D_ADMIN@field4d.com"
]



END_HTML_BODY = """
</table>
<p style="font-size: 14px; font-weight: bold; color: #000;">
<strong>Notice:</strong><br>
You are receiving this email because either there is an issue with the experiment or it has been concluded by the user.
</p>
If you notice missing sensors or delayed uploads, please review the sensor status at
<a href="https://field4d.com">https://field4d.com</a> and contact us if you have any questions.

<p style="font-size: 12px; color: #555; margin-top: 10px;">
<strong>About this report:</strong><br>
This table summarizes sensors that have not transmitted data recently.<br>
<ul style="margin-top: 5px; margin-bottom: 5px;">
  <li><strong>Experiment</strong> – The name of the experiment.</li>
  <li><strong>Dataset</strong> – The system name.</li>
  <li><strong>Last Timestamp</strong> – The most recent data received for this experiment.</li>
  <li><strong>Missing Sensors</strong> – Number of sensors in this experiment that have not sent data.</li>
  <li><strong>Hours Since Last Upload</strong> – Time elapsed since the last data sample was received <strong> from any sensor <strong>.</li>
</ul>
</p>
</body>
</html>
"""



# GMAIL_USER = os.getenv("GMAIL_USER")
# GMAIL_PASSWORD = os.getenv("GMAIL_PASSWORD")

GMAIL_USER="f4d_support@field4d.com"
GMAIL_PASSWORD="wcog eelv clcp iaeo" # app password for mail


def Last_Hours_Experiment_Data(client, dataset_id, table_id):
    query = f"""
    SELECT
        ExperimentData_Exp_name,
        ARRAY_AGG(DISTINCT SensorData_Name) AS sensor_names,
        MAX(TimeStamp) AS last_timestamp_BQ,
        CURRENT_DATETIME("Asia/Jerusalem") AS now_israel,
        TIMESTAMP_DIFF(
            TIMESTAMP(CURRENT_DATETIME("Asia/Jerusalem")),
            TIMESTAMP(MAX(TimeStamp)),
            HOUR
        ) AS hours_since_last
    FROM `iucc-f4d.{dataset_id}.{table_id}` AS Table_DATA
    WHERE
        TIMESTAMP(DATETIME(TimeStamp, "Asia/Jerusalem")) >= TIMESTAMP_SUB(TIMESTAMP(CURRENT_DATETIME("Asia/Jerusalem")), INTERVAL 40 HOUR)
    GROUP BY ExperimentData_Exp_name
    ORDER BY last_timestamp_BQ DESC;
    """
    results = client.query(query).result()
    return pd.DataFrame([{
        "dataset_id": dataset_id,
        "table_id": table_id,
        "ExperimentData_Exp_name": row.ExperimentData_Exp_name,
        "Distinct_SensorName_Last_40h": row.sensor_names,
        "Sensor_In_Last_40h": len(row.sensor_names) if row.sensor_names else 0,
        "last_timestamp": row.last_timestamp_BQ,
        "hours_passed_since_last_upload": row.hours_since_last
    } for row in results])


def query_unique_sensors_name(client, dataset_id, table_id, experiment_name):
    query = f"""
    SELECT DISTINCT SensorData_Name
    FROM `iucc-f4d.{dataset_id}.{table_id}`
    WHERE ExperimentData_Exp_name = '{experiment_name}'
    """
    return [row.SensorData_Name for row in client.query(query).result()]


def query_table_name_and_email(client, dataset_id):
    query = f"""
    SELECT
        STRING_AGG(t1.email, ', ') AS admin_emails
    FROM
        `iucc-f4d.user_device_permission.permissions` AS t1
    JOIN
        `iucc-f4d.user_device_permission.mac_to_device` AS t2
    ON
        t1.mac_address = t2.mac_address
    WHERE
        t1.role = 'admin'
        AND t1.mac_address = '{dataset_id}'
    GROUP BY t2.table_name
    """
    return [row.admin_emails for row in client.query(query).result()]


def send_email(to_addrs, subject, body, is_html=True):
    if isinstance(to_addrs, str):
        to_addrs = [to_addrs]
    
    to_addrs = ["nir.averbuch@mail.huji.ac.il"]
    msg = MIMEMultipart("alternative")
    msg["From"] = GMAIL_USER
    msg["To"] = ", ".join(to_addrs)
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "html" if is_html else "plain"))

    with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
        smtp.starttls()
        smtp.login(GMAIL_USER, GMAIL_PASSWORD)
        smtp.sendmail(GMAIL_USER, to_addrs, msg.as_string())


def build_alerts_html(df):
    html = """
    <html><head><style>
    body { font-family: Arial; font-size: 13px; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th, td { border: 1px solid #ddd; padding: 8px; }
    th { background-color: #4CAF50; color: white; }
    .missing { color: red; font-weight: bold; }
    .delayed { color: orange; font-weight: bold; }
    </style></head><body><table>
    <tr><th>Experiment</th><th>Dataset</th><th>Table</th>
        <th>Last Timestamp</th><th>Missing Sensors</th><th>Hours Since Last Upload</th></tr>
    """
    df = df.sort_values(by=['hours_passed_since_last_upload', 'count_unique_sensor'], ascending=[False, False])
    for _, row in df.iterrows():
        missing = int(row["count_unique_sensor"] - row["Sensor_In_Last_40h"])
        html += f"""<tr>
        <td>{row['ExperimentData_Exp_name']}</td>
        <td>{row['dataset_id']}</td>
        <td>{row['table_id']}</td>
        <td>{row['last_timestamp']}</td>
        <td class="{'missing' if missing > 0 else ''}">{missing} / {int(row['count_unique_sensor'])}</td>
        <td class="{'delayed' if row['hours_passed_since_last_upload'] > 2 else ''}">{row['hours_passed_since_last_upload']}</td>
        </tr>"""
    html += "</table></body></html>"
    return html


def send_alerts_by_admin(df):
    problem_df = df[
        (df["hours_passed_since_last_upload"] > 2) |
        (df["count_unique_sensor"] > df["Sensor_In_Last_40h"])
    ]

    for dataset_id, group_df in problem_df.groupby("dataset_id"):
        emails = group_df["admin_emails"].unique()
        to_addrs = set()
        for email_group in emails:
            to_addrs.update(e.strip() for e in email_group.split(','))
        if not to_addrs:
            to_addrs = DEFAULT_EMAILS
            
        print(f"Sending alert to: {to_addrs} for dataset: {dataset_id}")
        html = build_alerts_html(group_df) + END_HTML_BODY
        send_email(
            to_addrs=list(to_addrs),
            subject=f"⚠ Sensor Upload Alert for {dataset_id}",
            body=html
        )


def main(request):
    print("Cloud Run function triggered via test")
    big_df = pd.DataFrame()
    for dataset in bq_client.list_datasets():
        dataset_id = dataset.dataset_id
        print(f"Scanning dataset: {dataset_id}")
        if dataset_id == "user_device_permission":
            continue
        for table in bq_client.list_tables(dataset_id):
            try:
                print(f"Scanning table: {table.table_id}")
                df = Last_Hours_Experiment_Data(bq_client, dataset_id, table.table_id)
                print(f"Retrieved {len(df)} rows from {dataset_id}.{table.table_id}")

                big_df = pd.concat([big_df, df], ignore_index=True)
            except Exception as e:
                print(f"Error processing {dataset_id}.{table.table_id}: {e}")

    for i, row in big_df.iterrows():
        try:
            sensors = query_unique_sensors_name(bq_client, row['dataset_id'], row['table_id'], row['ExperimentData_Exp_name'])
            admins = query_table_name_and_email(bq_client, row['table_id'])
            big_df.at[i, 'count_unique_sensor'] = len(sensors)
            big_df.at[i, 'Unique_SensorData_Name'] = ', '.join(sensors)
            big_df.at[i, 'admin_emails'] = admins[0] if admins else ', '.join(DEFAULT_EMAILS)
        except Exception as e:
            print(f"Error enriching row {i}: {e}")

    send_alerts_by_admin(big_df)
    print("Cloud Run function comple")

    return "Sensor alert check completed.", 200
