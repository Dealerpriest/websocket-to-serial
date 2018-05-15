const express = require('express');
// const http = require('http').Server(app);
const socketIO = require('socket.io');
const path = require('path');

const serial = require('serialport');
let serialPort;

//Assumes our device is the last in the list
serial.list().then(list => {
  console.log('serialports: ');
  console.log(list);
  let name = list[list.length - 1].comName;
  serialPort = new serial(name, { baudRate: 115200 }, function(err) {
    if (err) {
      return console.log('Error: ', err.message);
    }
    console.log('opened a serialport!! Wuuuhuuu!');
  });
});

let state = 30;
let sendSerial = () => {
  let timeOutDuration = 20;
  state += 1;
  if (state > 80) {
    state = 30;
    timeOutDuration = 1500;
  }
  console.log('changing state');
  serialPort.write('pitch:' + state + '\n', function(err) {
    if (err) {
      return console.log('Error on write: ', err.message);
    }
    console.log('wrote: ' + state);
  });
  setTimeout(sendSerial, timeOutDuration);
};

// setTimeout(sendSerial, 500);

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

  let angle = 0;
  let driveSpeed = 0;
  let rotationSpeed = 0;

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
    switch (data) {
      case 'ArrowUp':
        driveSpeed = 1.0;
        break;
      case 'ArrowDown':
        driveSpeed = -1.0;
        break;
      case '!ArrowUp':
      case '!ArrowDown':
        driveSpeed = 0;
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
      case 'None':
        break;
    }

    let serialMessage =
      startCharacter +
      angle +
      delimiter +
      driveSpeed +
      delimiter +
      rotationSpeed +
      endCharacter;

    console.log('sending to serial: ' + serialMessage);
  });
});
