import json
import time
from pathlib import Path


CONFIG_PATH = Path("/home/pi/F4D/config/freezer_sensor.json")


def load_freezer_config() -> dict:
    if not CONFIG_PATH.exists():
        return {"enabled": False}

    with open(CONFIG_PATH, "r") as f:
        return json.load(f)


def build_disabled_result(reason: str) -> dict:
    return {
        "enabled": False,
        "reason": reason,
    }


def get_board_pin(pin_name: str):
    import board

    if not hasattr(board, pin_name):
        raise ValueError(f"Invalid board pin name in freezer config: {pin_name}")

    return getattr(board, pin_name)


class FreezerReader:
    def __init__(self, config: dict):
        self.config = config
        self.enabled = bool(config.get("enabled", False))
        self.lla = config.get("lla", "freezer_thermo_001")
        self.sensor_type = config.get("sensor_type", "max31855").lower()
        self.variables = config.get("variables", {})

        self.sensor = None

        if self.enabled:
            self._init_sensor()

    def _init_sensor(self):
        if self.sensor_type == "max31855":
            import board
            import digitalio
            import adafruit_max31855

            cs_pin_name = self.config.get("pins", {}).get("cs", "D25")
            cs = digitalio.DigitalInOut(get_board_pin(cs_pin_name))

            spi = board.SPI()
            self.sensor = adafruit_max31855.MAX31855(spi, cs)
            return

        raise ValueError(f"Unsupported freezer sensor_type: {self.sensor_type}")

    def read_packet(self) -> dict:
        if not self.enabled:
            raise RuntimeError("Freezer sensor is disabled in config")

        temp_c = float(self.sensor.temperature)
        board_temp_c = float(self.sensor.reference_temperature)
        delta_c = temp_c - board_temp_c

        return {
            "ipv6": self.lla,
            self.variables.get("thermocouple_temperature", "thermocouple_temperature_c"): round(temp_c, 2),
            self.variables.get("board_temperature", "thermocouple_board_temperature_c"): round(board_temp_c, 2),
            self.variables.get("delta_temperature", "thermocouple_delta_c"): round(delta_c, 2),
            self.variables.get("reader_ok", "freezer_reader_ok"): 1,
        }


def create_freezer_reader():
    config = load_freezer_config()

    if not config.get("enabled", False):
        return None

    return FreezerReader(config)


if __name__ == "__main__":
    reader = create_freezer_reader()

    if reader is None:
        print("Freezer sensor disabled.")
        raise SystemExit(0)

    print("Testing freezer reader. Press Ctrl+C to stop.")

    while True:
        try:
            packet = reader.read_packet()
            print(packet)
            time.sleep(reader.config.get("read_interval_seconds", 40))

        except KeyboardInterrupt:
            print("\nStopped.")
            break

        except Exception as e:
            print(f"Freezer reader error: {e}")
            time.sleep(5)