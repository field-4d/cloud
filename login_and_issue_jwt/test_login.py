import requests
import hashlib
import base64

def hash_password(password: str) -> str:
    """Mimic the BigQuery hashing: SHA256 + Base64"""
    password = password.strip()
    sha256_hash = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(sha256_hash).decode("utf-8")

# Input values (match what you inserted into BigQuery)
email = "nir.averbuch@mail.huji.ac.il"
raw_password = "Aa123456"  # not hashed

# Hash it using same logic as BigQuery
hashed = hash_password(raw_password)

# Prepare request
url = "https://us-central1-iucc-f4d.cloudfunctions.net/login_and_issue_jwt"  # replace with your deployed URL
payload = {
    "email": email,
    "hashed_password": hashed
}

# Send POST request
response = requests.post(url, json=payload)

# Print result
print("Status:", response.status_code)
print("Response JSON:", response.json())
