const config = require('./config');
const WebSocket = require('ws');
const zmq = require('zeromq');

function addApiKeyToRequestObject(msg, apiKey) {
  const requestNames = Object.keys(msg);
  requestNames.forEach(function(requestName) {
    if (msg[requestName].apiContext) {
      msg[requestName].apiContext = apiKey + '_' + msg[requestName].apiContext;
    }
  });
}

function removeApiKeyFromResponseObject(msg, apiKey) {
  const responseNames = Object.keys(msg);
  responseNames.forEach(function(responseName) {
    if (msg[responseName].apiContext) {
      msg[responseName].apiContext = msg[responseName].apiContext.substring(apiKey.length + 1);
    }
  });
}

console.log('binding websocket server to port ' + config.webSocket.port);
const wss = new WebSocket.Server({ port: config.webSocket.port });
wss.on('connection', function connection(ws, req) {
  const apiKey = req.url.substring(1);
  if (config.apiKeys.length > 0) {
    if (!apiKey) return;
    if (config.apiKeys.indexOf(apiKey) === -1) return;
  }

  console.log('new websocket connection with apiKey ' + apiKey);
  const keepAliveTimer = setInterval(function() {
    try {
      ws.send('{}');
    } catch (error) {}
  }, config.webSocket.keepAliveIntervalMs);

  const apiSocket = zmq.socket('dealer');
  apiSocket.connect(config.zmq.mediaUri);
  apiSocket.on('message', function(message) {
    message = message.toString();
    try {
      const msg = JSON.parse(message);
      removeApiKeyFromResponseObject(msg, apiKey); 
      ws.send(JSON.stringify(msg));
      console.log('WS > ', msg);
    } catch (parseError) {
      console.log('apiSocket.onmessage', parseError);
    }
  });

  const eventSocket = zmq.socket('sub');
  eventSocket.connect(config.zmq.mediaEventUri);
  eventSocket.subscribe('APIEVENT|' + apiKey);
  eventSocket.subscribe('MEDIAEVENT|' + apiKey);
  eventSocket.on('message', function(topic, message) {
    message = message.toString();
    try {
      const msg = JSON.parse(message);
      removeApiKeyFromResponseObject(msg, apiKey); 
      ws.send(JSON.stringify(msg));
      console.log('WS > ', msg);
    } catch (parseError) {
      console.log('apiSocket.onmessage', parseError);
    }
  });


  ws.on('message', function(message) {
    try {
      const msg = JSON.parse(message);
      console.log('WS < ', msg);
      if (msg instanceof Object) {
        addApiKeyToRequestObject(msg, apiKey);
      } else if (msg instanceof Array) {
        msg.forEach(function(requestObject) {
          addApiKeyToRequestObject(requestObject, apiKey);
        });
      }
      apiSocket.send(JSON.stringify(msg));
    } catch (parseError) {
      console.log('ws.onmessage', parseError);
      console.log('message: ' , message);
    }
  })

  ws.on('close', function() {
    clearInterval(keepAliveTimer);
    apiSocket.close();
    eventSocket.close();
  })

})

