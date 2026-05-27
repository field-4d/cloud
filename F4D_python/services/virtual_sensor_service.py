import threading
import time
import requests

from sensors.freezer_reader import create_freezer_reader


def start_virtual_freezer_sensor_thread(
    update_flash_memory_fn,
    enqueue_last_package_fn,
    logger=print,
):
    """
    Starts a background thread that reads the freezer thermocouple,
    injects it into the normal Field4D packet flow,
    and optionally sends temporary Pi-side email alerts.

    Alert behavior:
    - Sends alert when thermocouple temperature is above alert_above_c.
    - Sends maximum N emails per activation.
    - Waits email_interval_seconds between emails.
    - Resets only when temperature goes back to reset_below_c or lower.
    """

    def loop():
        try:
            reader = create_freezer_reader()
        except Exception as e:
            logger(f"[FREEZER] Failed to initialize freezer reader: {e}")
            return

        if reader is None:
            logger("[FREEZER] Virtual freezer sensor disabled.")
            return

        interval = int(reader.config.get("read_interval_seconds", 40))

        alerts = reader.config.get("alerts", {})
        alert_enabled = bool(alerts.get("enabled", False))

        alert_above_c = float(alerts.get("alert_above_c", -70))
        reset_below_c = float(alerts.get("reset_below_c", alert_above_c))
        max_emails = int(alerts.get("max_emails_per_activation", 3))
        email_interval_seconds = int(alerts.get("email_interval_seconds", 180))
        request_timeout_seconds = int(alerts.get("request_timeout_seconds", 20))

        email_endpoint = alerts.get("email_endpoint")
        recipients = alerts.get("recipients", [])

        variable_names = reader.config.get("variables", {})
        temp_key = variable_names.get(
            "thermocouple_temperature",
            "thermocouple_temperature_c",
        )

        alert_active = False
        emails_sent = 0
        last_email_ts = 0

        logger(
            f"[FREEZER] Virtual freezer sensor started. "
            f"LLA={reader.lla}, interval={interval}s"
        )

        if alert_enabled:
            logger(
                f"[FREEZER ALERT] Enabled. "
                f"alert_above_c={alert_above_c}, "
                f"reset_below_c={reset_below_c}, "
                f"max_emails={max_emails}, "
                f"email_interval_seconds={email_interval_seconds}"
            )

        while True:
            try:
                packet = reader.read_packet()

                update_flash_memory_fn(packet)
                enqueue_last_package_fn(packet)

                if alert_enabled:
                    temp_value = packet.get(temp_key)

                    if temp_value is None:
                        logger(f"[FREEZER ALERT] Missing temperature key: {temp_key}")
                    else:
                        temp_c = float(temp_value)
                        now_ts = int(time.time())

                        # Reset / re-arm alert after freezer becomes cold again.
                        if temp_c <= reset_below_c:
                            if alert_active:
                                logger(
                                    f"[FREEZER ALERT] Recovered. "
                                    f"temp={temp_c:.2f} °C <= {reset_below_c:.2f} °C. "
                                    "Alert state reset."
                                )

                            alert_active = False
                            emails_sent = 0
                            last_email_ts = 0

                        # Alert if freezer is too warm.
                        elif temp_c > alert_above_c:
                            if not alert_active:
                                alert_active = True
                                emails_sent = 0
                                last_email_ts = 0
                                logger(
                                    f"[FREEZER ALERT] Activated. "
                                    f"temp={temp_c:.2f} °C > {alert_above_c:.2f} °C"
                                )

                            enough_time_passed = (
                                last_email_ts == 0
                                or now_ts - last_email_ts >= email_interval_seconds
                            )

                            if emails_sent >= max_emails:
                                logger(
                                    f"[FREEZER ALERT] Max emails already sent "
                                    f"({emails_sent}/{max_emails})."
                                )

                            elif not enough_time_passed:
                                wait_left = email_interval_seconds - (now_ts - last_email_ts)
                                logger(
                                    f"[FREEZER ALERT] Waiting {wait_left}s before next email."
                                )

                            elif not email_endpoint or not recipients:
                                logger(
                                    "[FREEZER ALERT] Missing email_endpoint or recipients."
                                )

                            else:
                                subject = (
                                    f"URGENT Field4D Freezer Alert: "
                                    f"{reader.lla} is {temp_c:.2f} °C"
                                )

                                body = f"""
                                <div style="font-family: Arial, sans-serif; max-width: 760px; border: 2px solid #b00020; border-radius: 10px; overflow: hidden;">

                                <div style="background-color: #b00020; color: white; padding: 18px 22px;">
                                    <h1 style="margin: 0; font-size: 24px;">URGENT FREEZER TEMPERATURE ALERT</h1>
                                    <p style="margin: 6px 0 0 0; font-size: 16px;">
                                    The freezer temperature is above the configured safety threshold.
                                    </p>
                                </div>

                                <div style="padding: 22px; background-color: #fff5f5;">

                                    <p style="font-size: 18px; margin-top: 0;">
                                    <b style="color: #b00020;">Immediate attention may be required.</b>
                                    </p>

                                    <div style="font-size: 34px; font-weight: bold; color: #b00020; margin: 18px 0;">
                                    Current temperature: {temp_c:.2f} °C
                                    </div>

                                    <table style="border-collapse: collapse; width: 100%; font-size: 15px; background-color: white;">
                                    <tr>
                                        <th style="text-align: left; padding: 10px; border: 1px solid #ddd; background-color: #333; color: white;">Field</th>
                                        <th style="text-align: left; padding: 10px; border: 1px solid #ddd; background-color: #333; color: white;">Value</th>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px; border: 1px solid #ddd;"><b>Sensor</b></td>
                                        <td style="padding: 10px; border: 1px solid #ddd;">{reader.lla}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px; border: 1px solid #ddd;"><b>Measured temperature</b></td>
                                        <td style="padding: 10px; border: 1px solid #ddd; color: #b00020; font-weight: bold;">{temp_c:.2f} °C</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px; border: 1px solid #ddd;"><b>Alert threshold</b></td>
                                        <td style="padding: 10px; border: 1px solid #ddd;">Above {alert_above_c:.2f} °C</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px; border: 1px solid #ddd;"><b>Reset threshold</b></td>
                                        <td style="padding: 10px; border: 1px solid #ddd;">{reset_below_c:.2f} °C or lower</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px; border: 1px solid #ddd;"><b>Emails sent in this activation</b></td>
                                        <td style="padding: 10px; border: 1px solid #ddd;">{emails_sent + 1}/{max_emails}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 10px; border: 1px solid #ddd;"><b>Status</b></td>
                                        <td style="padding: 10px; border: 1px solid #ddd; color: #b00020; font-weight: bold;">ALERT ACTIVE</td>
                                    </tr>
                                    </table>

                                    <h3 style="color: #333; margin-top: 24px;">Raw packet</h3>
                                    <pre style="background-color: #f3f4f6; border: 1px solid #ddd; padding: 12px; white-space: pre-wrap; font-size: 13px;">{packet}</pre>

                                    <p style="margin-top: 22px; font-size: 14px; color: #555;">
                                    This temporary alert was sent directly from the Raspberry Pi freezer monitor.
                                    </p>

                                </div>
                                </div>
                                """

                                payload = {
                                    "to": recipients,
                                    "subject": subject,
                                    "body": body,
                                    "is_html": True,
                                }

                                try:
                                    response = requests.post(
                                        email_endpoint,
                                        json=payload,
                                        timeout=request_timeout_seconds,
                                    )

                                    if response.status_code == 200:
                                        emails_sent += 1
                                        last_email_ts = now_ts
                                        logger(
                                            f"[FREEZER ALERT] Email sent "
                                            f"{emails_sent}/{max_emails}."
                                        )
                                    else:
                                        logger(
                                            f"[FREEZER ALERT] Email failed. "
                                            f"status={response.status_code}, "
                                            f"text={response.text}"
                                        )

                                except Exception as e:
                                    logger(f"[FREEZER ALERT] Email error: {e}")

                logger(f"[FREEZER] Packet injected: {packet}")

            except Exception as e:
                logger(f"[FREEZER] Error reading/injecting packet: {e}")

            time.sleep(interval)

    thread = threading.Thread(
        target=loop,
        name="virtual-freezer-sensor",
        daemon=True,
    )
    thread.start()
    return thread