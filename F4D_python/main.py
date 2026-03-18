from serial_comm.port import SerialPort
from parser import parse_serial_line
from sync import send_ping, enqueue_last_package, start_last_package_sender
from DB import update_flash_memory
from services import start_flush_thread
from helpers import open_serial_with_auto_recovery

def main():
    start_flush_thread()  # single timed worker: metadata sync + flush
    start_last_package_sender()

    ser = open_serial_with_auto_recovery("/dev/ttyACM0", 115200)
    port = SerialPort("/dev/ttyACM0", 115200)

    for raw in port.read_lines():
        packet = parse_serial_line(raw)
        if packet is None:
            continue

        if isinstance(packet, str):
            print(packet)
            continue

        packet_type = packet.get("type")

        if packet_type == "PING":
            ping_packet = packet.get("raw")
            print(f"PING packet: {ping_packet}")
            get_lla = ping_packet.split(" ")[-1]
            send_ping(get_lla)
            continue

        elif packet_type == "antenna_log":
            print("Antenna log received:")
            print(packet.get("message"))
            continue

        elif packet_type == "sensor_data":
            ipv6 = packet.get("ipv6")

            try:
                packet_for_buffer = {k: v for k, v in packet.items() if k != "type"}
                update_flash_memory(packet_for_buffer)
                print(f"[FLASH] Updated buffer for sensor: {ipv6}")
            except Exception as e:
                print(f"[FLASH] Failed to update flash memory: {e}")
                continue

            queued = enqueue_last_package(packet_for_buffer)
            if queued:
                print(f"[Web-Socket] Queued sensor data for upload: {ipv6}")
            else:
                print(f"[Web-Socket] Failed to queue sensor data: {ipv6}")
        else:
            print(f"unknown packet type: {packet_type}")
            print(packet)


if __name__ == "__main__":
    main()