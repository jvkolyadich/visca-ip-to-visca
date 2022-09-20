import { SerialPort } from 'serialport'

SerialPort.list()
.then((portsInfo) => {
  if (portsInfo.length) {
    console.log('Available ports:')
    portsInfo.forEach((portInfo) => {
      console.log(`\t${portInfo.path}`)
    })
  } else {
    console.log('No ports are available')
  }
})
.catch(console.log)
