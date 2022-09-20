# visca-ip-to-visca

Allows a visca-ip controller to communicate with a visca device

## Usage

Install dependencies

```
npm i
```

Change `config.json` if needed

```json
{
  "udpPort": 52381,
  "serialPort": "/dev/ttyUSB0",
  "baudRate": 9600
}
```

Run the script

```
npm run start
```

## Additional usage

You can get a list of available serial ports by running
```
npm run list-ports
```