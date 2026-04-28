import os
import requests
from google.cloud import bigquery

import random
import string
PROJECT_ID = "iucc-f4d"

USER_TABLE = "`iucc-f4d.Field4D.F4D_user_table`"
PERMISSIONS_TABLE = "`iucc-f4d.Field4D.F4D_permissions`"
MAC_TO_DEVICE_TABLE = "`iucc-f4d.Field4D.F4D_mac_to_device`"

def generate_password():
    lower = random.choice(string.ascii_lowercase)
    upper1 = random.choice(string.ascii_uppercase)
    lower2 = random.choice(string.ascii_lowercase)
    upper2 = random.choice(string.ascii_uppercase)

    d1 = random.choice(string.digits)
    d2 = random.choice(string.digits)

    d3 = random.choice(string.digits)
    d4 = random.choice(string.digits)

    upper3 = random.choice(string.ascii_uppercase)

    return f"{lower}{upper1}{lower2}{upper2}{d1}{d2}x{d3}{d4}{upper3}"

MAIL_CF_URL = os.getenv(
    "MAIL_CF_URL",
    "https://f4d-email-sender-1000435921680.europe-west1.run.app"
)

bq_client = bigquery.Client(project=PROJECT_ID)


def clean_email(email: str) -> str:
    return email.replace(" ", "").lower()


def clean_password(password: str) -> str:
    return password.replace(" ", "")


def send_mail(to_email: str, subject: str, body: str):
    payload = {
        "to": [to_email],
        "subject": subject,
        "body": body,
        "is_html": True
    }

    r = requests.post(MAIL_CF_URL, json=payload, timeout=20)
    r.raise_for_status()


def get_device_name(mac_address: str) -> str:
    mac_address = mac_address.replace(" ", "")

    query = f"""
    SELECT DISTINCT Device_Name
    FROM {MAC_TO_DEVICE_TABLE}
    WHERE Mac_Address = @mac_address
    LIMIT 1
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("mac_address", "STRING", mac_address)
        ]
    )

    rows = list(bq_client.query(query, job_config=job_config).result())

    if rows:
        return rows[0].Device_Name

    return mac_address


def create_user(user_mail: str, password: str):
    query = f"""
    INSERT INTO {USER_TABLE}
      (email, hashed_password, created_at, last_login)
    VALUES
      (
        @user_mail,
        TO_BASE64(SHA256(@password)),
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP()
      )
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("user_mail", "STRING", user_mail),
            bigquery.ScalarQueryParameter("password", "STRING", password),
        ]
    )

    bq_client.query(query, job_config=job_config).result()


def add_permission(user_mail: str, owner: str, mac_address: str, exp_name: str, role_val: str):
    query = f"""
    INSERT INTO {PERMISSIONS_TABLE}
      (
        email,
        owner,
        Mac_Address,
        experiment,
        role,
        valid_from,
        valid_until,
        created_at
      )
    VALUES
      (
        @user_mail,
        @owner,
        @mac_address,
        @exp_name,
        @role_val,
        CURRENT_TIMESTAMP(),
        TIMESTAMP(DATETIME_ADD(CURRENT_DATETIME(), INTERVAL 10 YEAR)),
        CURRENT_TIMESTAMP()
      )
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("user_mail", "STRING", clean_email(user_mail)),
            bigquery.ScalarQueryParameter("owner", "STRING", owner.replace(" ", "")),
            bigquery.ScalarQueryParameter("mac_address", "STRING", mac_address.replace(" ", "")),
            bigquery.ScalarQueryParameter("exp_name", "STRING", exp_name),
            bigquery.ScalarQueryParameter("role_val", "STRING", role_val.replace(" ", "").lower()),
        ]
    )

    bq_client.query(query, job_config=job_config).result()


def delete_user_access(user_mail: str, mac_address=None, exp_name=None, delete_user=False):
    user_mail = clean_email(user_mail)

    if mac_address and exp_name:
        query = f"""
        DELETE FROM {PERMISSIONS_TABLE}
        WHERE email = @user_mail
          AND Mac_Address = @mac_address
          AND experiment = @exp_name
        """

        params = [
            bigquery.ScalarQueryParameter("user_mail", "STRING", user_mail),
            bigquery.ScalarQueryParameter("mac_address", "STRING", mac_address.replace(" ", "")),
            bigquery.ScalarQueryParameter("exp_name", "STRING", exp_name),
        ]

    elif mac_address:
        query = f"""
        DELETE FROM {PERMISSIONS_TABLE}
        WHERE email = @user_mail
          AND Mac_Address = @mac_address
        """

        params = [
            bigquery.ScalarQueryParameter("user_mail", "STRING", user_mail),
            bigquery.ScalarQueryParameter("mac_address", "STRING", mac_address.replace(" ", "")),
        ]

    else:
        query = f"""
        DELETE FROM {PERMISSIONS_TABLE}
        WHERE email = @user_mail
        """

        params = [
            bigquery.ScalarQueryParameter("user_mail", "STRING", user_mail),
        ]

    bq_client.query(
        query,
        job_config=bigquery.QueryJobConfig(query_parameters=params)
    ).result()

    if delete_user:
        query = f"""
        DELETE FROM {USER_TABLE}
        WHERE email = @user_mail
        """

        bq_client.query(
            query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("user_mail", "STRING", user_mail)
                ]
            )
        ).result()


def reset_password(user_mail: str, new_password: str):
    user_mail = clean_email(user_mail)
    new_password = clean_password(new_password)

    query = f"""
    UPDATE {USER_TABLE}
    SET
      hashed_password = TO_BASE64(SHA256(@new_password)),
      last_login = CURRENT_TIMESTAMP()
    WHERE email = @user_mail
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("user_mail", "STRING", user_mail),
            bigquery.ScalarQueryParameter("new_password", "STRING", new_password),
        ]
    )

    bq_client.query(query, job_config=job_config).result()


def send_create_user_email(user_mail: str, password: str, first_name: str):
    body = f"""
    <p>Hi {first_name}, how are you?</p>

    <p>
    I'm really happy to share that you're among the first users to access and work with our new system –
    it's an exciting milestone for us!
    </p>

    <p>
    To get started, please go to the following link:<br>
    <a href="https://field4d.com">https://field4d.com</a>
    </p>

    <p>
    Your personal login details are:<br>
    <strong>Username:</strong> {user_mail}<br>
    <strong>Password:</strong> {password}
    </p>

    <p>
    Please note that the system is still in its pilot phase, so you may occasionally encounter bugs or glitches.
    It would be a great help if you could keep an eye out and report anything unusual –
    your feedback will help us refine and improve the system before its wider release.
    </p>

    <p>Thanks,</p>
    """

    send_mail(user_mail, "Welcome to Field4D", body)


def send_permission_email(user_mail: str, first_name: str, device_name: str, exp_name: str, role_val: str):
    body = f"""
    <p>Hi {first_name},</p>

    <p>
    I’ve granted you access to a Field4D system and experiment.
    </p>

    <p>
    <strong>System:</strong> {device_name}<br>
    <strong>Experiment:</strong> {exp_name}<br>
    <strong>Role:</strong> {role_val}
    </p>

    <p>
    You can access the system here:<br>
    <a href="https://field4d.com">https://field4d.com</a>
    </p>

    <p>Thanks,</p>
    """

    send_mail(user_mail, "Field4D access granted", body)


def send_reset_password_email(user_mail: str, first_name: str, new_password: str):
    body = f"""
    <p>Hi {first_name},</p>

    <p>
    Your Field4D password was reset successfully.
    </p>

    <p>
    <strong>Username:</strong> {user_mail}<br>
    <strong>New password:</strong> {new_password}
    </p>

    <p>
    Login here:<br>
    <a href="https://field4d.com">https://field4d.com</a>
    </p>

    <p>Thanks,</p>
    """

    send_mail(user_mail, "Field4D password reset", body)


def main(request):
    try:
        data = request.get_json(silent=True)

        if not data:
            return ("Missing JSON body", 400)

        action = data.get("action")

        if action == "create_user":
            user_mail = data.get("user_mail")
            password = data.get("password")
            first_name = data.get("first_name", "there")
            send_email = data.get("send_email", False)

            if not user_mail or not password:
                return ("Missing required fields: user_mail, password", 400)

            user_mail = clean_email(user_mail)
            password = clean_password(password)

            create_user(user_mail, password)

            if send_email:
                send_create_user_email(user_mail, password, first_name)

            return ("User created successfully", 200)

        elif action == "add_permission":
            user_mail = data.get("user_mail")
            first_name = data.get("first_name", "there")
            owner = data.get("owner")
            mac_address = data.get("mac_address")
            exp_name = data.get("exp_name")
            role_val = data.get("role_val")
            send_email = data.get("send_email", False)

            if not all([user_mail, owner, mac_address, exp_name, role_val]):
                return (
                    "Missing required fields: user_mail, owner, mac_address, exp_name, role_val",
                    400
                )

            user_mail = clean_email(user_mail)
            mac_address = mac_address.replace(" ", "")
            role_val = role_val.replace(" ", "").lower()

            add_permission(user_mail, owner, mac_address, exp_name, role_val)

            if send_email:
                device_name = get_device_name(mac_address)
                send_permission_email(user_mail, first_name, device_name, exp_name, role_val)

            return ("Permission added successfully", 200)

        elif action == "delete_user_access":
            user_mail = data.get("user_mail")
            mac_address = data.get("mac_address")
            exp_name = data.get("exp_name")
            delete_user = data.get("delete_user", False)

            if not user_mail:
                return ("Missing required field: user_mail", 400)

            delete_user_access(
                user_mail=user_mail,
                mac_address=mac_address,
                exp_name=exp_name,
                delete_user=delete_user
            )

            if delete_user:
                return ("User and permissions deleted successfully", 200)

            if mac_address and exp_name:
                return ("Specific experiment permission deleted successfully", 200)

            if mac_address:
                return ("All device permissions deleted successfully", 200)

            return ("All user permissions deleted successfully", 200)

        elif action == "reset_password":
            user_mail = data.get("user_mail")
            first_name = data.get("first_name", "there")
            send_email = data.get("send_email", False)

            if not user_mail:
                return ("Missing required field: user_mail", 400)

            user_mail = clean_email(user_mail)

            new_password = generate_password()

            reset_password(user_mail, new_password)

            if send_email:
                send_reset_password_email(
                    user_mail=user_mail,
                    first_name=first_name,
                    new_password=new_password
                )

            return ("Password reset successfully", 200)

        else:
            return ("Unknown action", 400)

    except Exception as e:
        print(f"Error: {e}")
        return (f"Error: {str(e)}", 500)