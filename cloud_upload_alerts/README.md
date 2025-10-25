        ┌────────────────────────────┐
        │   Google Cloud Scheduler   │
        │ (optional - triggers job)  │
        └──────────────┬─────────────┘
                       │ (HTTP trigger)
                       ▼
        ┌────────────────────────────┐
        │   Cloud Run / Cloud Function │
        │   (main(request))           │
        └──────────────┬─────────────┘
                       │
                       ▼
        ┌────────────────────────────┐
        │     BigQuery Client        │
        │  (google.cloud.bigquery)   │
        └──────────────┬─────────────┘
                       │
        │──────────────────────────────────────────────│
        ▼                                              ▼
  ┌────────────────────┐                       ┌────────────────────┐
  │  Experiment Datasets│                      │ user_device_permission │
  │  (sensor data)      │                      │ (admin email mapping)  │
  └────────────────────┘                       └────────────────────┘
        │                                              │
        │----------------------------------------------│
                       │
                       ▼
         ┌────────────────────────────┐
         │   Last_Hours_Experiment_Data() │
         │   + query_unique_sensors_name() │
         │   + query_table_name_and_email()│
         └────────────────────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  big_df (DataFrame)  │
            │ (aggregated results) │
            └──────────────────────┘
                       │
                       ▼
       ┌──────────────────────────────┐
       │   send_alerts_by_admin()     │
       │   build_alerts_html()        │
       └──────────────────────────────┘
                       │
                       ▼
          ┌────────────────────────────┐
          │ Gmail SMTP (smtp.gmail.com)│
          │  using f4d_support@...     │
          └────────────────────────────┘
                       │
                       ▼
             📧 Admins Receive Alert Email
