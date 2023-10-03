const { SerialPortMock: SerialPort } = require('serialport')
import { MockBinding } from '@serialport/binding-mock';

jest.doMock('serialport', () => ({
  SerialPort: SerialPort,
}));
import {EBB} from "../ebb";
import {SerialPortSerialPort} from "../serialport-serialport";

describe("EBB", () => {
  afterEach(() => {
    MockBinding.reset();
  })

  async function openTestPort(path = '/dev/ebb'): Promise<SerialPort> {
    MockBinding.createPort(path, {record: true});
    const port = new SerialPortSerialPort(path);
    await port.open({ baudRate: 9600 })
    return port as any;
  }

  it("firmware version", async () => {
    const port = await openTestPort();
    const ebb = new EBB(port);
    ((port as any)._port.port).emitData(Buffer.from('aoeu\r\n'));
    expect(await ebb.firmwareVersion()).toEqual('aoeu');
    expect((port as any)._port.port.recording).toEqual(Buffer.from("V\r"));
  })

  it("enable motors", async () => {
    const port = await openTestPort();
    const ebb = new EBB(port);
    const oldWrite = (port as any)._port.write;
    (port as any)._port.write = (data: string | Buffer | number[], ...args: any[]) => {
      if (data.toString() === 'V\r')
        (port as any)._port.port.emitData(Buffer.from('test 2.5.3\r\n'))
      return oldWrite.apply((port as any)._port, [data, ...args])
    };
    (port as any)._port.port.emitData(Buffer.from('OK\r\n'));
    await ebb.enableMotors(2);
    expect((port as any)._port.port.recording).toEqual(Buffer.from("EM,2,2\rV\r"));
  })
})
