const express = require('express');
// const http = require('http').Server(app);
const socketIO = require('socket.io');
const path = require('path');
const Struct = require('struct');

const confirmCorrect = 123;
// Keep all fields to a size of 4 bytes (float and word32) in order to not fuck up memory alignment
let sendStruct = Struct()
                  .floatle('driveAngle')
                  .floatle('driveSpeed')
                  .floatle('rotationSpeed')
                  .word32Ule('pitch')
                  .word32Ule('yaw')
                  .word32Ule('height')
                  .word32Sle('rotationTarget')
                  .floatle('distanceTarget')
                  .word32Ule('confirm');
sendStruct.allocate();

sendStruct.fields.confirm = confirmCorrect;

const SerialPort = require('serialport');
const Readline = SerialPort.parsers.Readline;
const parser = new Readline();
let port;

let connectedToOrionBoard = false;

const teensyProductId = '0483';
const orionProductId = '7523';

// Here we define the function in order to call it again if it fails. First call is right below the definition.
// TODO: clear all registered timeouts when serial is lost.
let establishSerialConnection = () => {
  SerialPort.list()
    .then(list => {
      console.log('serialports: ');
      console.log(list);
      let name;
      let orionFound = false;
      for (let i = 0; i < list.length; i++) {
        let candidate = list[i];
        if (candidate.productId === teensyProductId) {
          console.log('found the device at port (I.E. found a port with correct productId): ' + candidate.comName);
          name = candidate.comName;
          orionFound = true;
          break;
        }
      }
      if (!orionFound) {
        console.log("Couldn't find a device. Trying again!!!");
        console.log("(press ctrl+c to exit)");
        setTimeout(establishSerialConnection, 2000);
        return;
        // process.exit();
      }

      port = new SerialPort(name, { baudRate: 115200 }, function(err) {
        if (err) {
          return console.log('Error opening port: ', err.message);
        }
        console.log('opened a serialport!! Wuuuhuuu!');
        connectedToOrionBoard = true;
      });

      port.pipe(parser);

      port.on('error', (err)=>{
        console.log("error on port: " + err);
        connectedToOrionBoard = false;
        establishSerialConnection();
      })

      parser.on('data', onData);

      // setInterval(()=>{
      //   sendStruct.fields.pitch++;
      //   port.write(sendStruct.buffer(), err => {
      //     if (err) {
      //       return console.log('Error on write: ', err.message);
      //     }
      //     console.log('wrote: ' + sendStruct);
      //   });
      // }, 1500);
    })
    .catch(function(err) {
      console.log(err);
    });

  function onData(data) {
    console.log('from port: ' + data);
    // port.write('>');
  }
}


establishSerialConnection();

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

  // we use this object to keep track of the robots state in order to let the client/robot page get updates of current state over the socket
  let robotState = {
    driveAngle: 0,
    driveSpeed: 0,
    rotationSpeed: 0,
    pitch: 90,
    yaw: 90,
    height: 90
  };

  let serialStamp = Date.now();
  let minSerialInterval = 100;
  serialTimeout = null;

  // setInterval(()=> {
  //   console.log("--------------------");
  //   console.log("********************");
  //   console.log("--------------------");
  //   console.log();
  //   sendToSerial(sendStruct.buffer());
  // }, 2000);

  //ok. So this part is a little bit hacky where we just check for certain words in the incoming message and build our serialmessage accordingly.

  // TODO: finish this function. As of now it's in some limbo state where I left it for dead working on other functionality.
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

    // console.log('clearing timeout: ' + serialTimeout);
    // clearTimeout(serialTimeout);
    // let durationSinceSerialStamp = Date.now() - serialStamp;
    // if (durationSinceSerialStamp < minSerialInterval) {
    //   console.log(
    //     'setting a timeout for serialout because port might get overloaded'
    //   );
    //   serialTimeout = setTimeout(() => {
    //     console.log('running timeout function');
    //     sendToSerial(serialServoMessage);
    //   }, minSerialInterval + 1);
    // } else {
    //   console.log(
    //     'no timeout! durationSinceSerialStamp: ' + durationSinceSerialStamp
    //   );
    //   sendToSerial(serialServoMessage);
    // }
  });

  robot.on('clickToDrive', data => {
    console.log('received clickToDrive socket data: ');
    console.log(data);

    let msg = sendStruct.fields;
    msg.rotationTarget = data.angle;
    msg.distanceTarget = data.distance;
    msg.driveAngle = 0;
    msg.driveSpeed = 0;
    msg.rotationSpeed = 0;
    msg.pitch = robotState.pitch;
    msg.yaw = robotState.yaw;
    msg.height = robotState.height;

    sendToSerial(sendStruct.buffer());
  });

  robot.on('robotKeyboardControl', data => {
    console.log('received robotKeyboardControl socket data: ' + data);
    // let messageType = 'motorControl';
    let propagateToSerial = true;
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
        robotState.pitch++;
        robotState.pitch = Math.max(pitchMin, robotState.pitch);
        break;
      case 'n':
        // messageType = 'servoControl';
        robotState.pitch--;
        robotState.pitch = Math.min(pitchMax, robotState.pitch);
        break;
      case '!b':
      case '!m':
      case '!h':
      case '!n':
        propagateToSerial = false;
        // messageType = 'servoControl';
        break;
      case 'None':
        break;
    }

    //calculate the driveAngle from the variables that were set above
    robotState.driveAngle =
      Math.PI * 2 + angleReference + angleOffsetMultiplier * angleOffset;
    robotState.driveAngle = robotState.driveAngle % (Math.PI * 2);

    // msg is a reference for r/w values into the struct
    let msg = sendStruct.fields;
    msg.driveAngle = robotState.driveAngle;
    msg.driveSpeed = robotState.driveSpeed;
    msg.rotationSpeed = robotState.rotationSpeed;
    msg.pitch = robotState.pitch;
    msg.yaw = robotState.yaw;
    msg.height = robotState.height;
    msg.rotationTarget = 0;
    msg.distanceTarget = 0;

    if(propagateToSerial){
      sendToSerial(sendStruct.buffer());
    }

    robot.emit('robotState', JSON.stringify(robotState));
  });

  robot.on('sensorControl', (data) => {
    console.log('received sensorControl socket data: ' + data);

  })

  // TODO: There is some bug when we disconnect the board during operation. Probably related to reference and memory leak.
  // It seems the establishConnection might be called from weird/several contexts as of now.
  function sendToSerial(messageToSend) {
    if(!connectedToOrionBoard || !port.isOpen){
      connectedToOrionBoard = false;
      console.log("port not opened. Please make sure the orion board is connected");
      clearTimeout(serialTimeout);
      port.close(err => {
        delete port;
        establishSerialConnection();
      });
      
      return;
    }

    console.log('clearing timeout: ' + serialTimeout);
    clearTimeout(serialTimeout);
    let durationSinceSerialStamp = Date.now() - serialStamp;
    if (durationSinceSerialStamp < minSerialInterval) {
      // console.log(
      //   'Tooo sooooon! Setting a timeout for serialout because port might get overloaded'
      // );
      serialTimeout = setTimeout(() => {
        console.log('running timeout function');
        sendToSerial(messageToSend);
      }, (minSerialInterval - durationSinceSerialStamp + 1) );
      return;
    } else {
      // console.log(
      //   'Time to send serial! durationSinceSerialStamp: ' + durationSinceSerialStamp
      // );
    }


    serialStamp = Date.now();
    // console.log('updating serialStamp: ' + serialStamp);
    console.log('sending ' + messageToSend.length + ' bytes to serial: ');
    console.log(messageToSend);
    port.write(messageToSend, err => {
      if (err) {
        console.log('Error on write: ', err.message);
        connectedToOrionBoard = false;
        // establishSerialConnection();
        return;
      }
      //console.log('wrote: ');
      //console.log(messageToSend);
    });
  }
});
