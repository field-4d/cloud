import express from 'express';
require('events').EventEmitter.prototype._maxListeners = 100;
import ip from 'ip';
import { checkPkg, getIpv6byPing, isPing } from '../modules/Functions';
import { Port } from '../modules/Serial';
import { Package } from '../modules/Models';
import { createServer } from 'http';
import { Server} from 'socket.io';
import { isNewSP,addNewSP, isNewPackage,updateNewPackage } from '../modules/pkgHandler';

const router = express.Router();
const testList :any[] = [];
const io = new Server();



Port.on('data', async function (raw: string) {
    try {
      if (checkPkg(raw)) {
        const Packet = Package(JSON.parse(raw));
        console.log('New packet from: '+Packet.ADDR+' at: '+Packet.TIME);
        testList.push(Packet.ADDR);
        console.log(testList)


        if (isNewSP(Packet.ADDR)) {
          addNewSP(Packet);
  
        } else if (isNewPackage(Packet.ADDR, Packet.NUM)) {
          updateNewPackage(Packet);
        }
  
      } else if (isPing(raw)) {
          console.log(raw);
          // io.emit('Ping', getIpv6byPing(raw));
      }
    } catch (err:any) {
      console.log('Error: ', err['message']);
    }
  });

  io.on('connection', (socket)=>{
    console.log(`user connected: ${socket.id}`);
  })

// router.get('/api/sensors', (req:any,res:any) => { 
//     console.log('got a req from /api/sensors ')
//     // console.log(req);
//     res.json(testList);
// });

module.exports = router;