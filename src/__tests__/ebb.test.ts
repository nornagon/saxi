import {EBB} from "../ebb";
import SerialPort from "serialport";
import MockBinding from "@serialport/binding-mock";

(() => {
  let oldBinding: any;
  beforeAll(() => {
    oldBinding = SerialPort.Binding;
    SerialPort.Binding = MockBinding;
  });
  afterAll(() => {
    SerialPort.Binding = oldBinding;
    MockBinding.reset();
  });
})();

describe("EBB.list", () => {
  afterEach(() => {
    MockBinding.reset();
  })

  it("is empty when no serial ports are available", async () => {
    expect(await EBB.list()).toEqual([])
  })

  it("doesn't return a port that doesn't look like an EBB", async () => {
    MockBinding.createPort('/dev/nonebb');
    expect(await EBB.list()).toEqual([])
  })

  it("returns a port that does look like an EBB", async () => {
    MockBinding.createPort('/dev/ebb', { manufacturer: "SchmalzHaus" });
    expect(await EBB.list()).toEqual(["/dev/ebb"])
  })

  it("handles 'SchmalzHaus LLC'", async () => {
    MockBinding.createPort('/dev/ebb', { manufacturer: "SchmalzHaus LLC" });
    expect(await EBB.list()).toEqual(["/dev/ebb"])
  })

  it("handles no manufacturer but vendor id / product id", async () => {
    MockBinding.createPort('/dev/ebb', { vendorId: "04D8", productId: "FD92" });
    expect(await EBB.list()).toEqual(["/dev/ebb"])
  })
})

describe("EBB", () => {
  afterEach(() => {
    MockBinding.reset();
  })

  type TestPort = SerialPort & {
    binding: SerialPort.BaseBinding & {
      recording: Buffer;
      emitData: (data: Buffer) => void;
    };
  };

  async function openTestPort(path = '/dev/ebb'): Promise<TestPort> {
    MockBinding.createPort(path, {record: true});
    const port = new SerialPort(path);
    await new Promise(resolve => port.on('open', resolve));
    return port as any;
  }

  it("firmware version", async () => {
    const port = await openTestPort();
    const ebb = new EBB(port);
    port.binding.emitData(Buffer.from('aoeu\r\n'));
    expect(await ebb.firmwareVersion()).toEqual('aoeu');
    expect(port.binding.recording).toEqual(Buffer.from("V\r"));
  })

  it("enable motors", async () => {
    const port = await openTestPort();
    const ebb = new EBB(port);
    port.binding.emitData(Buffer.from('OK\r\n'));
    await ebb.enableMotors(2);
    expect(port.binding.recording).toEqual(Buffer.from("EM,2,2\r"));
  })
})
