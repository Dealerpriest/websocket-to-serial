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
        console.log('found the orion at port: ' + port.comName);
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
  let driveAngle = 0;
  let angleOffset = 0;
  let angleOffsetMultiplier = 1;
  let driveSpeed = 0;
  let rotationSpeed = 0;

  // servocontrol
  let pitch = 90;
  let yaw = 90;

  robot.on('cameraControl', data => {
    console.log('received socket data:');
    console.log(data);
    // serialPort.write(data, function(err) {
    //   if (err) {
    //     return console.log('Error on write: ', err.message);
    //   }
    //   console.log('wrote: ' + data);
    // });
  });

  robot.on('motorControl', data => {
    console.log('received socket data: ' + data);

    // console.log(data);
    // serialPort.write(data, function(err) {
    //   if (err) {
    //     return console.log('Error on write: ', err.message);
    //   }
    //   console.log('wrote: ' + data);
    // });
    let messageType = 'motorControl';
    switch (data) {
      case 'ArrowUp':
        driveSpeed = 1.0;
        driveAngle = 0;
        angleOffsetMultiplier = 0.5;
        break;
      case 'ArrowDown':
        driveSpeed = 1.0;
        driveAngle = Math.PI;
        angleOffsetMultiplier = -0.5;
        break;
      case '!ArrowUp':
      case '!ArrowDown':
        driveSpeed = 0;
        driveAngle = 0;
        angleOffsetMultiplier = 1;
        break;
      case 'ArrowLeft':
        rotationSpeed = -1;
        break;
      case 'ArrowRight':
        rotationSpeed = 1;
        break;
      case '!ArrowLeft':
      case '!ArrowRight':
        rotationSpeed = 0;
        break;
      case 'z':
        driveSpeed = 1;
        angleOffset = Math.PI / 2;
        break;
      case 'x':
        driveSpeed = 1;
        angleOffset = -Math.PI / 2;
        break;
      case '!z':
      case '!x':
        driveSpeed = 0;
        angleOffset = 0;
        break;
      case 'b':
        messageType = 'servoControl';
        yaw--;
        yaw = Math.max(0, yaw);
        break;
      case 'm':
        messageType = 'servoControl';
        yaw++;
        yaw = Math.min(180, yaw);
        break;
      case 'h':
        messageType = 'servoControl';
        pitch--;
        pitch = Math.max(0, pitch);
        break;
      case 'n':
        messageType = 'servoControl';
        pitch++;
        pitch = Math.min(180, pitch);
        break;
      case '!b':
      case '!m':
      case '!h':
      case '!n':
        messageType = 'servoControl';
        break;
      case 'None':
        break;
    }
    let computedAngle =
      Math.PI * 2 + driveAngle + angleOffsetMultiplier * angleOffset;
    computedAngle = computedAngle % (Math.PI * 2);
    let serialMotorMessage =
      startCharacter +
      computedAngle +
      delimiter +
      driveSpeed +
      delimiter +
      rotationSpeed +
      endCharacter;

    let serialServoMessage =
      startCharacter + 's' + pitch + delimiter + yaw + endCharacter;

    let messageToSend =
      messageType === 'motorControl' ? serialMotorMessage : serialServoMessage;

    console.log('sending to serial: ' + messageToSend);
    port.write(messageToSend, err => {
      if (err) {
        return console.log('Error on write: ', err.message);
      }
      console.log('wrote: ' + messageToSend);
    });
  });
});
