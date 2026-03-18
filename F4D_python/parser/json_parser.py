import json
import re

log_buffer = ""
pan_id = ""
random_quote = ""

capturing = False
json_lines = []


def parse_antenna_log_block(raw: str):
    global log_buffer, pan_id, random_quote

    # only buffer relevant antenna-log lines
    if (
        "PANID" not in raw
        and "Random Quote:" not in raw
        and "Initialization Completed Successfully." not in raw
    ):
        return None

    log_buffer += raw

    pan_match = re.search(r"PANID 0x[0-9a-fA-F]+", log_buffer)
    if pan_match:
        pan_id = pan_match.group(0)

    quote_match = re.search(r'Random Quote: "([^"]+)"', log_buffer)
    if quote_match:
        random_quote = quote_match.group(1)

    log_end = "Initialization Completed Successfully."

    if log_end in log_buffer:
        result = {
            "type": "antenna_log",
            "pan_id": pan_id if pan_id else None,
            "random_quote": random_quote if random_quote else None,
            "raw": log_buffer.strip(),
            "message": f"{pan_id} \nrandom quote: '{random_quote}'"
        }

        log_buffer = ""
        pan_id = ""
        random_quote = ""

        return result

    return None


def parse_serial_line(raw: str):
    global capturing, json_lines

    antenna_log = parse_antenna_log_block(raw)
    if antenna_log:
        return antenna_log

    line = raw.strip()

    if line.startswith("PING received from:"):
        return {
            "type": "PING",
            "raw": line
        }

    if line == "JSON_START":
        capturing = True
        json_lines = []
        return None

    if line == "JSON_END":
        capturing = False
        json_str = "\n".join(json_lines)

        try:
            packet = json.loads(json_str)
            packet["type"] = "sensor_data"
            return packet
        except json.JSONDecodeError:
            print("Invalid JSON received")
            return None

    if capturing:
        json_lines.append(line)

    return None