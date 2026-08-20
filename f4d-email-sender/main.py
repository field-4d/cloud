import os
import json
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

    try:
        logger.info(
            "SMTP_CONNECT recipients=%s",
            to_addrs
        )

        with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
            logger.info(
                "SMTP_STARTTLS recipients=%s",
                to_addrs
            )
            smtp.starttls()

            logger.info(
                "SMTP_LOGIN recipients=%s",
                to_addrs
            )
            smtp.login(GMAIL_USER, GMAIL_PASSWORD)

            logger.info(
                "SMTP_SENDMAIL recipients=%s",
                to_addrs
            )
            smtp.sendmail(GMAIL_USER, to_addrs, msg.as_string())

        logger.info(
            "EMAIL_SENT recipients=%s subject=%s",
            to_addrs,
            subject
        )

    except smtplib.SMTPException as e:
        logger.exception(
            "SMTP_ERROR recipients=%s exception_type=%s "
            "smtp_code=%s smtp_error=%s error=%s",
            to_addrs,
            type(e).__name__,
            getattr(e, "smtp_code", None),
            getattr(e, "smtp_error", None),
            str(e)
        )
        raise

    except Exception as e:
        logger.exception(
            "EMAIL_SEND_ERROR recipients=%s "
            "exception_type=%s error=%s",
            to_addrs,
            type(e).__name__,
            str(e)
        )
        raise


def main(request):
    try:
        data = request.get_json(silent=True)

        if not data:
            logger.warning("Missing JSON body")
            return ("Missing JSON body", 400)

        to_addrs = data.get("to")
        subject = data.get("subject")
        body = data.get("body")
        is_html = data.get("is_html", True)

        if not to_addrs or not subject or not body:
            logger.warning(
                "Missing required fields: to=%s subject=%s body=%s",
                bool(to_addrs),
                bool(subject),
                bool(body)
            )
            return ("Missing required fields: to / subject / body", 400)

        send_email(
            to_addrs=to_addrs,
            subject=subject,
            body=body,
            is_html=is_html
        )

        return ("Email sent successfully", 200)

    except Exception as e:
        logger.exception(
            "REQUEST_FAILED exception_type=%s error=%s",
            type(e).__name__,
            str(e)
        )

        return ("Failed to send email", 500)