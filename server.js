const config = require('./config');
const WebSocket = require('ws');
const zmq = require('zeromq');

const dealerSocket = zmq.socket('router');
dealerSocket.connect(config.zmq.mediaUri);
dealerSocket.on('message', function(address, to, from, timestamp, message) {
  pubSocket.send([to, from, timestamp, message]);
})

console.log('binding websocket server to port ' + config.webSocket.port);
const wss = new WebSocket.Server({ port: config.webSocket.port });
wss.on('connection', function connection(ws, req) {
  const apiKey = req.url.substring(1);
  if (config.apiKeys.length > 0) {
    if (!apiKey) return;
    if (config.apiKeys.indexOf(apiKey) === -1) return;
  }
  ws.send('welcome');

  console.log('new websocket connection with apiKey ' + apiKey);
  const keepAliveTimer = setInterval(function() {
    try {
      ws.send('{}');
    } catch (error) {}
  }, config.webSocket.keepAliveIntervalMs);

  // create a zeromq DEALER socket and connecto to the media engine
  const dealer = zmq.socket('dealer');
  dealer.connect(config.zmq.mediaUri);

  dealer.on('message', function(message) {
    message = message.toString();
    console.log('> ' + message);
    ws.send(message);
  });

  ws.on('message', function(message) {
    console.log('< ' + message);
    dealer.send(message);
  })

  ws.on('close', function() {
    clearInterval(keepAliveTimer);
    dealer.close();
  })

})
