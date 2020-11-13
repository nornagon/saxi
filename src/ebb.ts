import SerialPort from "serialport";

import {Block, Motion, PenMotion, Plan, XYMotion} from "./planning";
import {Vec2, vsub} from "./vec";

/** Split d into its fractional and integral parts */
function modf(d: number): [number, number] {
  const intPart = Math.floor(d);
  const fracPart = d - intPart;
  return [fracPart, intPart];
}

function isEBB(p: SerialPort.PortInfo): boolean {
  return p.manufacturer === "SchmalzHaus" || p.manufacturer === "SchmalzHaus LLC" || (p.vendorId == "04D8" && p.productId == "FD92");
}

export class EBB {
  /** List connected EBBs */
  public static async list(): Promise<string[]> {
    const ports = await SerialPort.list();
    return ports.filter(isEBB).map((p) => p.path);
  }

  public port: SerialPort;
  public parser: SerialPort.parsers.Delimiter;
  private commandQueue: Iterator<any, any, Buffer>[];

  private microsteppingMode: number = 0;

  /** Accumulated XY error, used to correct for movements with sub-step resolution */
  private error: Vec2 = {x: 0, y: 0};

  private cachedFirmwareVersion: [number, number, number] | undefined = undefined;

  public constructor(port: SerialPort) {
    this.port = port;
    this.parser = this.port.pipe(new SerialPort.parsers.Regex({ regex: /[\r\n]+/ }));
    this.commandQueue = [];
    this.parser.on("data", (chunk: Buffer) => {
      if (this.commandQueue.length) {
        if (chunk[0] === "!".charCodeAt(0)) {
          return (this.commandQueue.shift() as any).reject(new Error(chunk.toString("ascii")));
        }
        try {
          const d = this.commandQueue[0].next(chunk);
          if (d.done) {
            return (this.commandQueue.shift() as any).resolve(d.value);
          }
        } catch (e) {
          return (this.commandQueue.shift() as any).reject(e);
        }
      } else {
        console.log(`unexpected data: ${chunk}`);
      }
    });
  }

  private get stepMultiplier() {
    switch (this.microsteppingMode) {
      case 5: return 1;
      case 4: return 2;
      case 3: return 4;
      case 2: return 8;
      case 1: return 16;
      default:
        throw new Error(`Invalid microstepping mode: ${this.microsteppingMode}`);
    }
  }

  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port.close((err) => {
        if (err) { reject(err); } else { resolve(); }
      });
    });
  }

  private write(str: string): boolean {
    if (process.env.DEBUG_SAXI_COMMANDS) {
      console.log(`writing: ${str}`)
    }
    return this.port.write(str);
  }

  /** Send a raw command to the EBB and expect a single line in return, without an "OK" line to terminate. */
  public async query(cmd: string): Promise<string> {
    try {
      return await this.run(function* (): Iterator<string, string, Buffer> {
        this.write(`${cmd}\r`);
        const result = (yield).toString("ascii");
        return result;
      });
    } catch (err) {
      throw new Error(`Error in response to query '${cmd}': ${err.message}`);
    }
  }

  /** Send a raw command to the EBB and expect multiple lines in return, with an "OK" line to terminate. */
  public async queryM(cmd: string): Promise<string[]> {
    try {
      return await this.run(function*(): Iterator<string[], string[], Buffer> {
        this.write(`${cmd}\r`);
        const result: string[] = [];
        while (true) {
          const line = (yield).toString("ascii");
          if (line === "OK") { break; }
          result.push(line);
        }
        return result;
      });
    } catch (err) {
      throw new Error(`Error in response to queryM '${cmd}': ${err.message}`);
    }
  }

  /** Send a raw command to the EBB and expect a single "OK" line in return. */
  public async command(cmd: string): Promise<void> {
    try {
      return await this.run(function*(): Iterator<void, void, Buffer> {
        this.write(`${cmd}\r`);
        const ok = (yield).toString("ascii");
        if (ok !== "OK") {
          throw new Error(`Expected OK, got ${ok}`);
        }
      });
    } catch (err) {
      throw new Error(`Error in response to command '${cmd}': ${err.message}`);
    }
  }

  public async enableMotors(microsteppingMode: number): Promise<void> {
    if (!(1 <= microsteppingMode && microsteppingMode <= 5)) {
      throw new Error(`Microstepping mode must be between 1 and 5, but was ${microsteppingMode}`);
    }
    this.microsteppingMode = microsteppingMode;
    await this.command(`EM,${microsteppingMode},${microsteppingMode}`);
    // if the board supports SR, we should also enable the servo motors.
    if (await this.supportsSR())
      await this.setServoPowerTimeout(0, true);
  }

  public async disableMotors(): Promise<void> {
    await this.command("EM,0,0");
    // if the board supports SR, we should also disable the servo motors.
    if (await this.supportsSR())
      // 60 seconds is the default boot-time servo power timeout.
      await this.setServoPowerTimeout(60000, false);
  }

  /**
   * Set the servo power timeout, in seconds. If a second parameter is
   * supplied, the servo will be immediately commanded into the given state (on
   * or off) depending on its value, in addition to setting the power-off
   * timeout duration.
   *
   * NB. this command is only avaliable on firmware v2.6.0 and hardware of at
   * least version 2.5.0.
   */
  public async setServoPowerTimeout(timeout: number, power?: boolean) {
    await this.command(`SR,${(timeout * 1000) | 0}${power != null ? `,${power ? 1 : 0}` : ''}`)
  }

  public setPenHeight(height: number, rate: number, delay: number = 0): Promise<void> {
    return this.command(`S2,${height},4,${rate},${delay}`);
  }

  public lowlevelMove(
    stepsAxis1: number,
    initialStepsPerSecAxis1: number,
    finalStepsPerSecAxis1: number,
    stepsAxis2: number,
    initialStepsPerSecAxis2: number,
    finalStepsPerSecAxis2: number
  ): Promise<void> {
    const [initialRate1, deltaR1] = this.axisRate(stepsAxis1, initialStepsPerSecAxis1, finalStepsPerSecAxis1);
    const [initialRate2, deltaR2] = this.axisRate(stepsAxis2, initialStepsPerSecAxis2, finalStepsPerSecAxis2);
    return this.command(`LM,${initialRate1},${stepsAxis1},${deltaR1},${initialRate2},${stepsAxis2},${deltaR2}`);
  }

  /**
   * Use the low-level move command "LM" to perform a constant-acceleration stepper move.
   *
   * Available with EBB firmware 2.5.3 and higher.
   *
   * @param xSteps Number of steps to move in the X direction
   * @param ySteps Number of steps to move in the Y direction
   * @param initialRate Initial step rate, in steps per second
   * @param finalRate Final step rate, in steps per second
   */
  public moveWithAcceleration(xSteps: number, ySteps: number, initialRate: number, finalRate: number): Promise<void> {
    if (!(xSteps !== 0 || ySteps !== 0)) {
      throw new Error("Must move on at least one axis");
    }
    if (!(initialRate >= 0 && finalRate >= 0)) {
      throw new Error(`Rates must be positive, were ${initialRate},${finalRate}`);
    }
    if (!(initialRate > 0 || finalRate > 0)) {
      throw new Error("Must have non-zero velocity during motion");
    }
    const stepsAxis1 = xSteps + ySteps;
    const stepsAxis2 = xSteps - ySteps;
    const norm = Math.sqrt(Math.pow(xSteps, 2) + Math.pow(ySteps, 2));
    const normX = xSteps / norm;
    const normY = ySteps / norm;
    const initialRateX = initialRate * normX;
    const initialRateY = initialRate * normY;
    const finalRateX = finalRate * normX;
    const finalRateY = finalRate * normY;
    const initialRateAxis1 = Math.abs(initialRateX + initialRateY);
    const initialRateAxis2 = Math.abs(initialRateX - initialRateY);
    const finalRateAxis1 = Math.abs(finalRateX + finalRateY);
    const finalRateAxis2 = Math.abs(finalRateX - finalRateY);
    return this.lowlevelMove(
      stepsAxis1, initialRateAxis1, finalRateAxis1, stepsAxis2, initialRateAxis2, finalRateAxis2);
  }

  /**
   * Use the high-level move command "XM" to perform a constant-velocity stepper move.
   *
   * @param duration Duration of the move, in seconds
   * @param x Number of microsteps to move in the X direction
   * @param y Number of microsteps to move in the Y direction
   */
  public moveAtConstantRate(duration: number, x: number, y: number): Promise<void> {
    return this.command(`XM,${Math.floor(duration * 1000)},${x},${y}`);
  }

  public async waitUntilMotorsIdle(): Promise<void> {
    while (true) {
      const [, commandStatus, _motor1Status, _motor2Status, fifoStatus] = (await this.query("QM")).split(",");
      if (commandStatus === "0" && fifoStatus === "0") {
        break;
      }
    }
  }

  public async executeBlockWithLM(block: Block): Promise<void> {
    const [errX, stepsX] = modf((block.p2.x - block.p1.x) * this.stepMultiplier + this.error.x);
    const [errY, stepsY] = modf((block.p2.y - block.p1.y) * this.stepMultiplier + this.error.y);
    this.error.x = errX;
    this.error.y = errY;
    if (stepsX !== 0 || stepsY !== 0) {
      await this.moveWithAcceleration(
        stepsX,
        stepsY,
        block.vInitial * this.stepMultiplier,
        block.vFinal * this.stepMultiplier
      );
    }
  }
  /**
   * Execute a constant-acceleration motion plan using the low-level LM command.
   *
   * Note that the LM command is only available starting from EBB firmware version 2.5.3.
   */
  public async executeXYMotionWithLM(plan: XYMotion): Promise<void> {
    for (const block of plan.blocks) {
      await this.executeBlockWithLM(block);
    }
  }

  /**
   * Execute a constant-acceleration motion plan using the high-level XM command.
   *
   * This is less accurate than using LM, since acceleration will only be adjusted every timestepMs milliseconds,
   * where LM can adjust the acceleration at a much higher rate, as it executes on-board the EBB.
   */
  public async executeXYMotionWithXM(plan: XYMotion, timestepMs: number = 15): Promise<void> {
    const timestepSec = timestepMs / 1000;
    let t = 0;
    while (t < plan.duration()) {
      const i1 = plan.instant(t);
      const i2 = plan.instant(t + timestepSec);
      const d = vsub(i2.p, i1.p);
      const [ex, sx] = modf(d.x * this.stepMultiplier + this.error.x);
      const [ey, sy] = modf(d.y * this.stepMultiplier + this.error.y);
      this.error.x = ex;
      this.error.y = ey;
      await this.moveAtConstantRate(timestepSec, sx, sy);
      t += timestepSec;
    }
  }

  /** Execute a constant-acceleration motion plan, starting and ending with zero velocity. */
  public async executeXYMotion(plan: XYMotion): Promise<void> {
    if (await this.supportsLM()) {
      await this.executeXYMotionWithLM(plan);
    } else {
      await this.executeXYMotionWithXM(plan);
    }
  }

  public executePenMotion(pm: PenMotion): Promise<void> {
    // rate is in units of clocks per 24ms.
    // so to fit the entire motion in |pm.duration|,
    // dur = diff / rate
    // [time] = [clocks] / ([clocks]/[time])
    // [time] = [clocks] * [clocks]^-1 * [time]
    // [time] = [time]
    // ✔
    // so rate = diff / dur
    // dur is in [sec]
    // but rate needs to be in [clocks] / [24ms]
    // duration in units of 24ms is duration * [24ms] / [1s]
    return this.setPenHeight(pm.finalPos, 0, Math.round(pm.duration() * 1000 + 0));
  }

  public executeMotion(m: Motion): Promise<void> {
    if (m instanceof XYMotion) {
      return this.executeXYMotion(m);
    } else if (m instanceof PenMotion) {
      return this.executePenMotion(m);
    } else {
      throw new Error(`Unknown motion type: ${m.constructor.name}`);
    }
  }

  public async executePlan(plan: Plan, microsteppingMode: number = 2): Promise<void> {
    await this.enableMotors(microsteppingMode);

    for (const m of plan.motions) {
      await this.executeMotion(m);
    }

    await this.waitUntilMotorsIdle();
    await this.disableMotors();
  }

  /**
   * Query voltages for board & steppers. Useful to check whether stepper power is plugged in.
   *
   * @return Tuple of (RA0_VOLTAGE, V+_VOLTAGE, VIN_VOLTAGE)
   */
  public async queryVoltages(): Promise<[number, number, number]> {
    const [ra0Voltage, vPlusVoltage] = (await this.queryM("QC"))[0].split(/,/).map(Number);
    return [
      ra0Voltage / 1023.0 * 3.3,
      vPlusVoltage / 1023.0 * 3.3,
      vPlusVoltage / 1023.0 * 3.3 * 9.2 + 0.3
    ];
  }

  /**
   * Query the firmware version running on the EBB.
   *
   * @return The version string, e.g. "EBBv13_and_above EB Firmware Version 2.5.3"
   */
  public async firmwareVersion(): Promise<string> {
    return await this.query("V");
  }

  /**
   * @return The firmware version as a parsed version triple, e.g. [2, 5, 3]
   */
  public async firmwareVersionNumber(): Promise<[number, number, number]> {
    if (this.cachedFirmwareVersion === undefined) {
      const versionString = await this.firmwareVersion();
      const versionWords = versionString.split(" ");
      const [major, minor, patch] = versionWords[versionWords.length - 1].split(".").map(Number);
      this.cachedFirmwareVersion = [major, minor, patch];
    }
    return this.cachedFirmwareVersion;
  }

  /**
   * Compare the firmware version of the EBB with the given version.
   *
   * @return -1 if the firmware is older than the given version, 0 if it's
   * identical, and 1 if it's newer.
   */
  public async firmwareVersionCompare(major: number, minor: number, patch: number): Promise<number> {
    const [fwMajor, fwMinor, fwPatch] = await this.firmwareVersionNumber();
    if (fwMajor < major) return -1;
    if (fwMajor > major) return 1;
    if (fwMinor < minor) return -1;
    if (fwMinor > minor) return 1;
    if (fwPatch < patch) return -1;
    if (fwPatch > patch) return 1;
    return 0;
  }

  public async areSteppersPowered(): Promise<boolean> {
    const [, , vInVoltage] = await this.queryVoltages();
    return vInVoltage > 6;
  }

  public async queryButton(): Promise<boolean> {
    return (await this.queryM("QB"))[0] === "1";
  }

  /**
   * @return true iff the EBB firmware supports the LM command.
   */
  public async supportsLM(): Promise<boolean> {
    return (await this.firmwareVersionCompare(2, 5, 3)) >= 0;
  }

  /**
   * @return true iff the EBB firmware supports the SR command.
   */
  public async supportsSR(): Promise<boolean> {
    return (await this.firmwareVersionCompare(2, 6, 0)) >= 0;
  }

  /**
   * Helper method for computing axis rates for the LM command.
   *
   * See http://evil-mad.github.io/EggBot/ebb.html#LM
   *
   * @param steps Number of steps being taken
   * @param initialStepsPerSec Initial movement rate, in steps per second
   * @param finalStepsPerSec Final movement rate, in steps per second
   * @return A tuple of (initialAxisRate, deltaR) that can be passed to the LM command
   */
  private axisRate(steps: number, initialStepsPerSec: number, finalStepsPerSec: number): [number, number] {
    if (steps === 0) return [0, 0]
    const initialRate = Math.round(initialStepsPerSec * (0x80000000 / 25000));
    const finalRate = Math.round(finalStepsPerSec * (0x80000000 / 25000));
    const moveTime = 2 * Math.abs(steps) / (initialStepsPerSec + finalStepsPerSec);
    const deltaR = Math.round((finalRate - initialRate) / (moveTime * 25000));
    return [initialRate, deltaR];
  }

  private run<T>(g: (this: EBB) => Iterator<T>): Promise<T> {
    const cmd = g.call(this);
    const d = cmd.next();
    if (d.done) { return Promise.resolve(d.value); }
    this.commandQueue.push(cmd);
    return new Promise((resolve, reject) => {
      cmd.resolve = resolve;
      cmd.reject = reject;
    });
  }
}
