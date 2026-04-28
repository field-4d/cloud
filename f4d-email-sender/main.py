import os
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Gmail credentials
GMAIL_USER = "f4d_support@field4d.com"
GMAIL_PASSWORD="qfrb vetg ktkn mcuz" # app password for mail


def send_email(to_addrs, subject, body, is_html=True):
    if isinstance(to_addrs, str):
        to_addrs = [to_addrs]

    msg = MIMEMultipart("alternative")
    msg["From"] = GMAIL_USER
    msg["To"] = ", ".join(to_addrs)
    msg["Subject"] = subject

    msg.attach(
        MIMEText(body, "html" if is_html else "plain")
    )

    with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
        smtp.starttls()
        smtp.login(GMAIL_USER, GMAIL_PASSWORD)
        smtp.sendmail(GMAIL_USER, to_addrs, msg.as_string())


def main(request):
    try:
        data = request.get_json(silent=True)

        if not data:
            return ("Missing JSON body", 400)

        to_addrs = data.get("to")
        subject = data.get("subject")
        body = data.get("body")
        is_html = data.get("is_html", True)

        if not to_addrs or not subject or not body:
            return ("Missing required fields: to / subject / body", 400)

        send_email(
            to_addrs=to_addrs,
            subject=subject,
            body=body,
            is_html=is_html
        )

        return ("Email sent successfully", 200)

    except Exception as e:
        return (f"Error: {str(e)}", 500)