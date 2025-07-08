declare module 'serialport' {
  import { EventEmitter } from 'events';
  import { Duplex } from 'stream';

  interface SerialPortOptions {
    baudRate: number;
  }

  class SerialPort extends EventEmitter {
    constructor(path: string, options: SerialPortOptions);
    pipe<T extends Duplex>(destination: T): T;
    on(event: 'data', callback: (data: Buffer) => void): this;
    on(event: 'error', callback: (err: Error) => void): this;

    static parsers: {
      Readline: new () => Duplex;
    };
  }

  export = SerialPort;
}
