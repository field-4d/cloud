import SerialPort from 'serialport';
const Readline: any = SerialPort.parsers.Readline;
const port = new SerialPort('/dev/ttyACM0', { baudRate: 115200 });
const parser: any = new Readline();
port.pipe(parser);
export const Port: any = parser;