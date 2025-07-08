"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
require('events').EventEmitter.prototype._maxListeners = 100;
const Functions_1 = require("../modules/Functions");
const Serial_1 = require("../modules/Serial");
const Models_1 = require("../modules/Models");
const socket_io_1 = require("socket.io");
const pkgHandler_1 = require("../modules/pkgHandler");
const router = express_1.default.Router();
const testList = [];
const io = new socket_io_1.Server();
Serial_1.Port.on('data', async function (raw) {
    try {
        if ((0, Functions_1.checkPkg)(raw)) {
            const Packet = (0, Models_1.Package)(JSON.parse(raw));
            console.log('New packet from: ' + Packet.ADDR + ' at: ' + Packet.TIME);
            testList.push(Packet.ADDR);
            console.log(testList);
            if ((0, pkgHandler_1.isNewSP)(Packet.ADDR)) {
                (0, pkgHandler_1.addNewSP)(Packet);
            }
            else if ((0, pkgHandler_1.isNewPackage)(Packet.ADDR, Packet.NUM)) {
                (0, pkgHandler_1.updateNewPackage)(Packet);
            }
        }
        else if ((0, Functions_1.isPing)(raw)) {
            console.log(raw);
            // io.emit('Ping', getIpv6byPing(raw));
        }
    }
    catch (err) {
        console.log('Error: ', err['message']);
    }
});
io.on('connection', (socket) => {
    console.log(`user connected: ${socket.id}`);
});
// router.get('/api/sensors', (req:any,res:any) => { 
//     console.log('got a req from /api/sensors ')
//     // console.log(req);
//     res.json(testList);
// });
module.exports = router;
