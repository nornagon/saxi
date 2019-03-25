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
    MockBinding.createPort('/dev/ebb');
    (await MockBinding.list())[0].manufacturer = "SchmalzHaus"
    expect(await EBB.list()).toEqual(["/dev/ebb"])
  })

  it("handles 'SchmalzHaus LLC'", async () => {
    MockBinding.createPort('/dev/ebb');
    (await MockBinding.list())[0].manufacturer = "SchmalzHaus LLC"
    expect(await EBB.list()).toEqual(["/dev/ebb"])
  })
})
