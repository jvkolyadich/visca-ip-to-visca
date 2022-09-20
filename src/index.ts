import { SerialPort } from 'serialport'
import { DelimiterParser } from '@serialport/parser-delimiter'
import { createSocket, RemoteInfo } from 'dgram'
import { readFileSync } from 'fs'

const configFile = 'config.json'

const config = {
  udpPort: 52381,
  serialPort: '/dev/ttyUSB0',
  baudRate: 9600,
}

enum ViscaIpPacketType {
  command = 0x0100,
  inquiry = 0x0110,
  reply = 0x0111,
}

class ViscaIpPacket {
  type: ViscaIpPacketType
  length: number
  sequenceNumber: number
  payload: Buffer

  constructor(
    type: ViscaIpPacketType,
    length: number,
    sequenceNumber: number,
    payload: Buffer
  ) {
    this.type = type
    this.length = length
    this.sequenceNumber = sequenceNumber
    this.payload = payload
  }

  toString() {
    return (
      `${this.typeAsString()} packet` +
      ` with a sequence number of ${this.sequenceNumber}` +
      ` and a payload of ${bufferToHexString(this.payload)}`
    )
  }

  typeAsString() {
    return this.type === ViscaIpPacketType.command
      ? 'command'
      : this.type === ViscaIpPacketType.inquiry
      ? 'inquiry'
      : this.type === ViscaIpPacketType.reply
      ? 'reply'
      : 'unknown'
  }

  toHexString() {
    return bufferToHexString(this.toBuffer())
  }

  toBuffer() {
    return Buffer.from([
      this.type >>> 8,
      this.type,
      this.length >>> 8,
      this.length,
      this.sequenceNumber >>> 24,
      this.sequenceNumber >>> 16,
      this.sequenceNumber >>> 8,
      this.sequenceNumber,
      ...this.payload,
    ])
  }

  static _parseType(value: number) {
    if (value === ViscaIpPacketType.command) return ViscaIpPacketType.command
    if (value === ViscaIpPacketType.inquiry) return ViscaIpPacketType.inquiry
    if (value === ViscaIpPacketType.reply) return ViscaIpPacketType.command
    throw new Error(`Unknown packet type: ${value.toString(16)}`)
  }

  static fromBuffer(buffer: Buffer) {
    const type = ViscaIpPacket._parseType(buffer.readUInt16BE(0))
    const length = buffer.readUInt16BE(2)
    const sequenceNumber = buffer.readUInt32BE(4)
    const payload = buffer.subarray(8)
    if (payload.length !== length)
      throw new Error(
        `Expected payload with length ${length}.` +
          ` Actual length: ${payload.length}`
      )
    return new ViscaIpPacket(type, length, sequenceNumber, payload)
  }

  static fromPayload(
    type: ViscaIpPacketType,
    sequenceNumber: number,
    payload: Buffer
  ) {
    return new ViscaIpPacket(type, payload.length, sequenceNumber, payload)
  }
}

function bufferToHexString(buffer: Buffer) {
  return buffer
    .toString('hex')
    .toUpperCase()
    .split('')
    .reduce((array, character, index) => {
      if (index % 2 == 0) {
        array.push(character)
      } else {
        const previousIndex = Math.floor(index / 2)
        array[previousIndex] += character
      }
      return array
    }, [] as string[])
    .join(' ')
}

function loadConfig() {
  try {
    const configData = readFileSync(configFile)
    const loadedConfig = JSON.parse(configData.toString())

    if (loadedConfig.udpPort) config.udpPort = loadedConfig.udpPort
    if (loadedConfig.serialPort) config.serialPort = loadedConfig.serialPort
    if (loadedConfig.baudRate) config.baudRate = loadedConfig.baudRate
  } catch (error) {
    console.log('Failed to load config from file')
  }
}

let currentSequenceNumber: number = null
let currentRemoteInfo: RemoteInfo = null

function main() {
  loadConfig()

  const serialPort = new SerialPort(
    {
      path: config.serialPort,
      baudRate: config.baudRate,
      autoOpen: false,
    },
    (error) => {
      console.log('Serial port error:')
      console.log(error)
    }
  )

  const socket = createSocket('udp4')

  socket.on('error', (error) => {
    console.log('Socket error:')
    console.log(error)
  })

  socket.on('message', (msgBuffer, remoteInfo) => {
    const receivedPacket = ViscaIpPacket.fromBuffer(msgBuffer)
    console.log(`Socket recieved ${receivedPacket.toString()}`)

    currentSequenceNumber = receivedPacket.sequenceNumber
    currentRemoteInfo = remoteInfo

    console.log(`Writing payload ${receivedPacket.payload} to serial port`)
    serialPort.write(receivedPacket.payload, (error) => {
      console.log('Error while writing to serial port:')
      console.log(error)
    })
  })

  const serialPortParser = new DelimiterParser({
    delimiter: [0xff],
    includeDelimiter: true,
  })

  serialPort.pipe(serialPortParser)

  serialPortParser.on('error', (error) => {
    console.log('Error while parsing data from serial port:')
    console.log(error)
  })

  serialPortParser.on('data', (responseData: Buffer) => {
    console.log(
      `Received response ${bufferToHexString(responseData)} from serial port`
    )

    const responsePacket = ViscaIpPacket.fromPayload(
      ViscaIpPacketType.reply,
      currentSequenceNumber,
      responseData
    )

    console.log(`Socket sending ${responsePacket.toString()}`)
    socket.send(
      responsePacket.toBuffer(),
      currentRemoteInfo.port,
      currentRemoteInfo.address,
      (error) => {
        console.log('Error while sending reply packet:')
        console.log(error)
      }
    )
  })

  socket.on('listening', () => {
    const address = socket.address()
    console.log(`Socket listening at ${address.address}:${address.port}`)
  })

  console.log(
    `Opening serial port ${config.serialPort}` +
      ` with baud rate ${config.baudRate}`
  )
  serialPort.open((error) => {
    if (error) {
      console.log('Error while opening serial port:')
      console.log(error)
    } else {
      socket.bind(config.udpPort)
    }
  })
}

main()
