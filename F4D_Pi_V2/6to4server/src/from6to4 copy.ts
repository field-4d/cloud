import express from 'express';
import ip from 'ip';
import { createServer } from 'http';
import { Port } from './modules/Serial';
import { isNewSP,addNewSP, isNewPackage,updateNewPackage } from './modules/pkgHandler';
import { checkPkg, getIpv6byPing, isPing } from './modules/Functions';
import { Package } from './modules/Models';
import { getClientSensors } from './modules/LocalMongoHandler';
import { alerter } from './modules/notify';
import { handleStartNewExperiment, handleSetSensor , sendLaaToClient , sendPingToClient , handleEndExperiment} from './modules/ClientFunctions';

const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const localPort : number = 3111;
const clientPort : number = 3000;
const app = express();
const httpServer = createServer(app);

// Initialize cors middleware for fetch API communication
const corsOptions = {
  origin: `http://${ip.address()}:${clientPort}`,
};
app.use(require('cors')(corsOptions));

// Handle fetch API
app.get('/getAll', async (req, res) => {
  console.log('/getData received from client');
  const clientSensors = await getClientSensors();
  res.send(clientSensors);
});

// Launching the fetch API server 
httpServer.listen(localPort, () => {
  console.log(`[FieldArr@y] listening on http://${ip.address()}:${localPort}`);
});


// Server <-> Sensors 
wss.on('connection', (ws:any) => {

  Port.on('data', async function (raw: string) {
    try {
      
      if (checkPkg(raw)) { // If pkg is a mesurement ->
        const Packet = Package(JSON.parse(raw));
        // console.log('New packet from: '+Packet.ADDR+' at: '+Packet.TIME);
        sendLaaToClient(Packet.ADDR,ws)
        alerter(JSON.parse(raw));
        if (isNewSP(Packet.ADDR)) {
          addNewSP(Packet);
        } else if (isNewPackage(Packet.ADDR, Packet.NUM)) {
          updateNewPackage(Packet);
        }
  
      } else if (isPing(raw)) { // If pkg is a ping ->
        console.log("Ping From - "+getIpv6byPing(raw))
        sendPingToClient(getIpv6byPing(raw),ws);
      }
    } catch (err:any) {
      console.log('Error: ', err['message']);
    }
  });

  // WebSocket Routing (Server <-> Client)
  ws.on('message', async (message:any) => {
    if (message.toString() != 'undefined'){
      try {
        const received = JSON.parse(message)
        if (received.type == 'setSensor') {
          handleSetSensor(received);
        }
        if (received.type == 'startNewExperiment'){
          handleStartNewExperiment(received,ws);
        }
        if (received.type == 'endExperiment'){
          handleEndExperiment(received, ws);
        }
      } catch (err:any){
        console.error(err);
      }
    }
  });

});