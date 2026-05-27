import time
import board
import digitalio
import adafruit_max31855

# SPI bus:
# SCK = GPIO11 / physical pin 23
# SO  = GPIO9  / physical pin 21
spi = board.SPI()

# CS connected to GPIO25 / physical pin 22
cs = digitalio.DigitalInOut(board.D25)

sensor = adafruit_max31855.MAX31855(spi, cs)

print("Testing thermocouple. Press Ctrl+C to stop.")
print("Wiring:")
print("VCC -> Pin 1  (3.3V)")
print("GND -> Pin 6  (GND)")
print("SCK -> Pin 23 (GPIO11)")
print("SO  -> Pin 21 (GPIO9)")
print("CS  -> Pin 22 (GPIO25)")
print()

while True:
    try:
        temp_c = sensor.temperature
        board_temp_c = sensor.reference_temperature

        print(
            f"Thermocouple: {temp_c:.2f} °C | "
            f"Board: {board_temp_c:.2f} °C" 
            f" Delta = {temp_c - board_temp_c:.2f} °C"
            
        )

        time.sleep(2)

    except KeyboardInterrupt:
        print("\nStopped.")
        break

    except Exception as e:
        print("Error:", e)
        time.sleep(2)