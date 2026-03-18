import serial


class SerialPort:
    def __init__(self, device: str, baudrate: int):
        self.ser = serial.Serial(device, baudrate, timeout=1)

    def read_lines(self):
        while True:
            line = self.ser.readline().decode(errors="ignore")
            if line:
                yield line