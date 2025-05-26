"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Port = void 0;
var serialport_1 = __importDefault(require("serialport"));
var Readline = serialport_1.default.parsers.Readline;
var port = new serialport_1.default('/dev/ttyACM0', { baudRate: 115200 });
var parser = new Readline();
port.pipe(parser);
exports.Port = parser;
