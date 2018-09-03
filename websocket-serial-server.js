const express = require('express');
// const http = require('http').Server(app);
const socketIO = require('socket.io');
const path = require('path');

const SerialPort = require('serialport');
const Readline = SerialPort.parsers.Readline;
const parser = new Readline();
let port;

SerialPort.list()
  .then(list => {
    // console.log('serialports: ');
    // console.log(list);
    let name;
    let orionFound = false;
    for (let i = 0; i < list.length; i++) {
      let port = list[i];
      if (port.productId === '7523') {
        console.log('found the orion at port (I.E. found a port with productId 7523): ' + port.comName);
        name = port.comName;
        orionFound = true;
        break;
      }
    }
    if (!orionFound) {
      console.log("Couldn't find an orion board. Exiting!!!");
      process.exit();
    }
    port = new SerialPort(name, { baudRate: 115200 }, function(err) {
      if (err) {
        return console.log('Error: ', err.message);
      }
      console.log('opened a serialport!! Wuuuhuuu!');
    });

    port.pipe(parser);
    parser.on('data', onData);
  })
  .catch(function(err) {
    console.log(err);
  });

function onData(data) {
  console.log('from port: ' + data);
  // port.write('>');
}

process.on('exit', function() {
  console.log('Goodbye!');
});

const PORT = process.env.PORT;
const INDEX = path.join(__dirname, 'index.html');
// const JSPATH = '/js/';

server = express()
  // .use('/camera', (req, res) => {
  //   res.sendFile(path.join(__dirname, 'camera.html'));
  // })
  // .use('/js', (req, res) => {
  //   res.sendFile(path.join(__dirname, req.originalUrl));
  // })
  // .use('/lib', (req, res) => {
  //   res.sendFile(path.join(__dirname, req.originalUrl));
  // })
  // .use((req, res) => res.sendFile(INDEX))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const io = socketIO(server);

let robot = undefined;

io.use((socket, next) => {
  let token = socket.handshake.query.token;
  if (token !== process.env.ROBOT_TOKEN) {
    console.log('wrong token');
    console.log(token);
    console.log('expected ' + process.env.ROBOT_TOKEN);
    return next(new Error('authentication error'));
  }
  console.log('correct token: ' + token);

  // if(clients.length >= 2){
  //   return next(new Error('Too many clients. Max is 2'));
  // }

  return next();
});

io.on('connection', function(socket) {
  let token = socket.handshake.query.token;
  console.log('a user connected with token: ' + token);
  console.log('socket id: ' + socket.id);

  robot = socket;

  robot.on('disconnect', () => {
    console.log('robot disconnected. Now cry!!');
    robot = undefined;
  });

  robot.send('Welcome mr. robot');

  robot.on('message', data => {
    console.log('message from robot (id=' + robot.id + '):');
    console.log(data);
  });

  //messaging protocol
  let startCharacter = '<';
  let delimiter = ';';
  let endCharacter = '>';

  //motor control
  // let driveAngle = 0;
  let angleReference = 0;
  let angleOffset = 0;
  let angleOffsetMultiplier = 1;
  // let driveSpeed = 0;
  // let rotationSpeed = 0;

  // servocontrol
  // let pitch = 90;
  // let yaw = 90;
  const pitchMin = 20,
    pitchMax = 160;
  const yawMin = 20,
    yawMax = 160;

  let robotState = {
    driveAngle: 0,
    driveSpeed: 0,
    rotationSpeed: 0,
    pitch: 90,
    yaw: 90
  };

  let serialStamp = Date.now();
  let minSerialInterval = 10;

  serialTimeout = null;

  //ok. So this part is a little bit hacky where we just check for certain words in the incoming message and build our serialmessage accordingly.
  robot.on('robotMouseControl', data => {
    console.log('received mouse socket data:');
    console.log(data);
    let value = '';
    if (data.startsWith('changePitch')) {
      value = data.slice(11);
      robotState.pitch += Number(value);
    } else {
      value = data.slice(9);
      state.yaw += Number(value);
    }
    robotState.pitch = Math.max(pitchMin, robotState.pitch);
    robotState.pitch = Math.min(pitchMax, robotState.pitch);

    state.yaw = Math.max(yawMin, state.yaw);
    state.yaw = Math.min(yawMax, state.yaw);

    let serialServoMessage =
      startCharacter + 's' + robotState.pitch + delimiter + state.yaw + endCharacter;

    console.log('clearing timeout: ' + serialTimeout);
    clearTimeout(serialTimeout);
    let durationSinceSerialStamp = Date.now() - serialStamp;
    if (durationSinceSerialStamp < minSerialInterval) {
      console.log(
        'setting a timeout for serialout because port might get overloaded'
      );
      serialTimeout = setTimeout(() => {
        console.log('running timeout function');
        sendToSerial(serialServoMessage);
      }, minSerialInterval + 1);
    } else {
      console.log(
        'no timeout! durationSinceSerialStamp: ' + durationSinceSerialStamp
      );
      sendToSerial(serialServoMessage);
    }
  });

  robot.on('robotKeyboardControl', data => {
    console.log('received robotKeyboardControl socket data: ' + data);
    // let messageType = 'motorControl';
    switch (data) {
      case 'ArrowUp':
        robotState.driveSpeed = 1.0;
        angleReference = 0;
        angleOffsetMultiplier = 0.5;
        break;
      case 'ArrowDown':
        robotState.driveSpeed = 1.0;
        angleReference = Math.PI;
        angleOffsetMultiplier = -0.5;
        break;
      case '!ArrowUp':
      case '!ArrowDown':
        robotState.driveSpeed = 0;
        angleReference = 0;
        angleOffsetMultiplier = 1;
        break;
      case 'ArrowLeft':
        robotState.rotationSpeed = -1;
        break;
      case 'ArrowRight':
        robotState.rotationSpeed = 1;
        break;
      case '!ArrowLeft':
      case '!ArrowRight':
        robotState.rotationSpeed = 0;
        break;
      case 'z':
        robotState.driveSpeed = 1;
        angleOffset = Math.PI / 2;
        break;
      case 'x':
        robotState.driveSpeed = 1;
        angleOffset = -Math.PI / 2;
        break;
      case '!z':
      case '!x':
        robotState.driveSpeed = 0;
        angleOffset = 0;
        break;
      case 'b':
        // messageType = 'servoControl';
        robotState.yaw--;
        robotState.yaw = Math.max(yawMin, robotState.yaw);
        break;
      case 'm':
        // messageType = 'servoControl';
        robotState.yaw++;
        robotState.yaw = Math.min(yawMax, robotState.yaw);
        break;
      case 'h':
        // messageType = 'servoControl';
        robotState.pitch--;
        robotState.pitch = Math.max(pitchMin, robotState.pitch);
        break;
      case 'n':
        // messageType = 'servoControl';
        robotState.pitch++;
        robotState.pitch = Math.min(pitchMax, robotState.pitch);
        break;
      case '!b':
      case '!m':
      case '!h':
      case '!n':
        // messageType = 'servoControl';
        break;
      case 'None':
        break;
    }
    robotState.driveAngle =
      Math.PI * 2 + angleReference + angleOffsetMultiplier * angleOffset;
    robotState.driveAngle = robotState.driveAngle % (Math.PI * 2);

    let serialMessage = 
    startCharacter +
    robotState.driveAngle +
    delimiter +
    robotState.driveSpeed*0.2 +
    delimiter +
    robotState.rotationSpeed*0.2 +
    delimiter +
    robotState.pitch +
    delimiter +
    robotState.yaw +
    delimiter +
    '90' +
    endCharacter;

    sendToSerial(serialMessage);

    robot.emit('robotState', JSON.stringify(robotState));
  });

  robot.on('sensorControl', (data) => {
    console.log('received sensorControl socket data: ' + data);

  })

  function sendToSerial(messageToSend) {
    serialStamp = Date.now();
    console.log('updating serialStamp: ' + serialStamp);
    console.log('sending to serial: ' + messageToSend);
    port.write(messageToSend, err => {
      if (err) {
        return console.log('Error on write: ', err.message);
      }
      console.log('wrote: ' + messageToSend);
    });
  }
});
