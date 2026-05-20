# f4d-email-sender

## How to use

### 1) Send with curl (single recipient, HTML body)

```bash
curl -X POST "https://f4d-email-sender-1000435921680.europe-west1.run.app" \
  -H "Content-Type: application/json" \
  -d "{\"to\":\"user@example.com\",\"subject\":\"Field4D Alert\",\"body\":\"<h3>Status</h3><p>Your report is ready.</p>\",\"is_html\":true}"
```

### 2) Send with curl (multiple recipients, plain text)

```bash
curl -X POST "https://f4d-email-sender-1000435921680.europe-west1.run.app" \
  -H "Content-Type: application/json" \
  -d "{\"to\":[\"a@example.com\",\"b@example.com\"],\"subject\":\"Field4D Update\",\"body\":\"System check completed.\",\"is_html\":false}"
```

### 3) Send from Python (`requests`)

```python
import requests

url = "https://f4d-email-sender-1000435921680.europe-west1.run.app"
payload = {
    "to": ["a@example.com", "b@example.com"],  # or "single@example.com"
    "subject": "Field4D Notification",
    "body": "<p>Job finished successfully.</p>",
    "is_html": True,
}

response = requests.post(url, json=payload, timeout=30)
print(response.status_code, response.text)
```

### 4) Send a pandas table with coloring and sizing

```python
import pandas as pd
import requests

df = pd.DataFrame(
    [
        {"Sensor": "A1", "Value": 12.5, "Status": "OK"},
        {"Sensor": "A2", "Value": 28.2, "Status": "WARN"},
        {"Sensor": "A3", "Value": 35.7, "Status": "ALERT"},
    ]
)

def status_color(val: str) -> str:
    if val == "ALERT":
        return "background-color:#ffdddd; color:#b30000; font-weight:bold;"
    if val == "WARN":
        return "background-color:#fff4cc; color:#8a6d00; font-weight:bold;"
    return "background-color:#ddffdd; color:#1f6b1f;"

styled_html_table = (
    df.style
    .applymap(status_color, subset=["Status"])
    .format({"Value": "{:.2f}"})
    .set_properties(**{
        "font-size": "14px",
        "padding": "8px 12px",
        "border": "1px solid #d9d9d9",
        "text-align": "left",
    })
    .set_table_styles([
        {
            "selector": "table",
            "props": [
                ("border-collapse", "collapse"),
                ("width", "680px"),
                ("font-family", "Arial, sans-serif"),
            ],
        },
        {
            "selector": "th",
            "props": [
                ("background-color", "#1f2937"),
                ("color", "white"),
                ("font-size", "15px"),
            ],
        },
    ])
    .to_html()
)

html_body = f"""
<h2>Daily Sensor Summary</h2>
<p>Auto-generated report:</p>
{styled_html_table}
"""

url = "https://f4d-email-sender-1000435921680.europe-west1.run.app"
payload = {
    "to": "user@example.com",
    "subject": "Field4D - Sensor Table Report",
    "body": html_body,
    "is_html": True,
}

response = requests.post(url, json=payload, timeout=30)
print(response.status_code, response.text)
```

## Response

- `200` -> `Email sent successfully`
- `400` -> `Missing JSON body` or `Missing required fields: to / subject / body`
- `500` -> `Error: <details>`
