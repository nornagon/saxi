package saxi

import java.io.{BufferedReader, InputStreamReader}
import java.nio.charset.StandardCharsets

import com.fazecast.jSerialComm
import com.fazecast.jSerialComm.SerialPort
import saxi.Planning.{PenMotion, Plan, XYMotion}
import saxi.Util.modf

class OpenEBB(port: SerialPort) {
  // TODO: this doesn't handle the ebb's weird \n\r thing. Maybe use scanner instead?
  private val in = new BufferedReader(new InputStreamReader(port.getInputStream))

  private var microsteppingMode: Int = 0

  private def stepMultiplier = microsteppingMode match {
    case 5 => 1
    case 4 => 2
    case 3 => 4
    case 2 => 8
    case 1 => 16
  }

  // TODO: remove AxiDraw-specific stuff from EBB
  // Practical min/max that you might ever want the pen servo to go on the AxiDraw (v2)
  // Units: 83ns resolution pwm output.
  // Defaults: penup at 12000 (1ms), pendown at 16000 (1.33ms).
  val PenServoMin: Int = 7500
  val PenServoMax: Int = 28000

  // Defaults: see https://github.com/evil-mad/EggBot/blob/399e9130d1b7e340bb084794718ec2309688d9c6/EBB_firmware/app.X/source/RCServo2.c
  // These are configurable, but must be saved in order to determine how long to wait after issuing a pen up or pen down
  // command before beginning a lateral move.
  // There's no way to query the current value of these from the EBB, so assume they're at their default. Things will
  // be weird if configure() doesn't get called.
  private var penDownPos: Int = 16000
  private var penUpPos: Int = 12000
  // speeds are in 83ns per 24ms. So moving from top to bottom = 20500 steps would take 492 sec at rate=1, 4.9 sec at
  // rate 100.
  private var penDownSpeed: Int = 400
  private var penUpSpeed: Int = 400
  private def msForPenToGoUp: Int = ((penUpPos - penDownPos).abs / penUpSpeed.toDouble * 24).round.toInt
  private def msForPenToGoDown: Int = ((penUpPos - penDownPos).abs / penDownSpeed.toDouble * 24).round.toInt

  private def readLine(): String = {
    val line = Iterator.continually(in.readLine().stripLineEnd).find(_.nonEmpty).get
    if (line.startsWith("!")) {
      throw new RuntimeException(s"EBB returned error: $line")
    }
    line
  }

  /** Send a raw command to the EBB and expect a single line in return, without an "OK" line to terminate. */
  def query(cmd: String): String = {
    val bytes = s"$cmd\r".getBytes(StandardCharsets.US_ASCII)
    port.writeBytes(bytes, bytes.length)
    readLine()
  }

  /** Send a raw command to the EBB and expect multiple lines in return, with an "OK" line to terminate. */
  def queryM(cmd: String): Seq[String] = {
    val bytes = s"$cmd\r".getBytes(StandardCharsets.US_ASCII)
    port.writeBytes(bytes, bytes.length)
    Iterator.continually(readLine()).takeWhile(_ != "OK").toList
  }

  /** Send a raw command to the EBB and expect a single "OK" line in return. */
  def command(cmd: String): Unit = {
    val bytes = s"$cmd\r".getBytes(StandardCharsets.US_ASCII)
    port.writeBytes(bytes, bytes.length)
    val resp = readLine()
    if (!resp.startsWith("OK")) {
      throw new RuntimeException(
        s"Unexpected response from EBB:\nCommand: $cmd\nResponse: $resp")
    }
  }

  def reset(): Unit = { command("R"); readLine() /* R seems to send two OK packets? */ }

  def enableMotors(microsteppingMode: Int): Unit = {
    require(
      1 <= microsteppingMode && microsteppingMode <= 5,
      s"Microstepping mode must be between 1 and 5, but was $microsteppingMode"
    )
    command(s"EM,$microsteppingMode,$microsteppingMode")
    this.microsteppingMode = microsteppingMode
  }

  def disableMotors(): Unit = command("EM,0,0")

  def configure(penUpPct: Double, penDownPct: Double, penUpSpeedPctPerSec: Double = 150, penDownSpeedPctPerSec: Double = 150): Unit = {
    val clocksPerPct = (PenServoMax - PenServoMin) / 100.0
    this.penUpPos = (PenServoMax - penUpPct * clocksPerPct).round.toInt
    this.penDownPos = (PenServoMax - penDownPct * clocksPerPct).round.toInt
    this.penUpSpeed = (penUpSpeedPctPerSec * (24 / 1000.0) * clocksPerPct).round.toInt
    this.penDownSpeed = (penDownSpeedPctPerSec * (24 / 1000.0) * clocksPerPct).round.toInt
    command(s"SC,4,$penUpPos")
    command(s"SC,5,$penDownPos")
    command(s"SC,11,$penUpSpeed")
    command(s"SC,12,$penDownSpeed")
  }

  def raisePen(duration: Int = msForPenToGoUp): Unit = {
    require(duration >= 0)
    command(s"SP,1,$duration")
  }

  def lowerPen(duration: Int = msForPenToGoDown): Unit = {
    require(duration >= 0)
    command(s"SP,0,$duration")
  }

  def setPenHeight(height: Int, rate: Int, delay: Int = 0): Unit = {
    command(s"S2,$height,4,$rate,$delay")
  }

  def lowlevelMove(
    stepsAxis1: Long,
    initialStepsPerSecAxis1: Double,
    finalStepsPerSecAxis1: Double,
    stepsAxis2: Long,
    initialStepsPerSecAxis2: Double,
    finalStepsPerSecAxis2: Double
  ): Unit = {
    val (initialRate1, deltaR1) = axisRate(stepsAxis1, initialStepsPerSecAxis1, finalStepsPerSecAxis1)
    val (initialRate2, deltaR2) = axisRate(stepsAxis2, initialStepsPerSecAxis2, finalStepsPerSecAxis2)
    command(s"LM,$initialRate1,$stepsAxis1,$deltaR1,$initialRate2,$stepsAxis2,$deltaR2")
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
  def moveWithAcceleration(xSteps: Long, ySteps: Long, initialRate: Double, finalRate: Double): Unit = {
    require(xSteps != 0 || ySteps != 0, "Must move on at least one axis")
    require(initialRate >= 0 && finalRate >= 0, s"Rates must be positive, were $initialRate,$finalRate")
    require(initialRate > 0 || finalRate > 0, "Must have non-zero velocity during motion")
    val stepsAxis1: Long = xSteps + ySteps
    val stepsAxis2: Long = xSteps - ySteps
    val norm = math.sqrt(math.pow(xSteps.toDouble, 2) + math.pow(ySteps, 2))
    val normX = xSteps / norm
    val normY = ySteps / norm
    val initialRateX = initialRate * normX
    val initialRateY = initialRate * normY
    val finalRateX = finalRate * normX
    val finalRateY = finalRate * normY
    val initialRateAxis1 = math.abs(initialRateX + initialRateY)
    val initialRateAxis2 = math.abs(initialRateX - initialRateY)
    val finalRateAxis1 = math.abs(finalRateX + finalRateY)
    val finalRateAxis2 = math.abs(finalRateX - finalRateY)
    lowlevelMove(stepsAxis1, initialRateAxis1, finalRateAxis1, stepsAxis2, initialRateAxis2, finalRateAxis2)
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
  private def axisRate(steps: Long, initialStepsPerSec: Double, finalStepsPerSec: Double): (Long, Long) = {
    val initialRate: Long = (initialStepsPerSec * ((1L << 31)/25000f)).round
    val finalRate: Long = (finalStepsPerSec * ((1L << 31)/25000f)).round
    val moveTime = 2f * math.abs(steps) / (initialStepsPerSec + finalStepsPerSec)
    val deltaR: Long = ((finalRate - initialRate) / (moveTime * 25000f)).round
    (initialRate, deltaR)
  }

  /**
    * Use the high-level move command "XM" to perform a constant-velocity stepper move.
    *
    * @param duration Duration of the move, in seconds
    * @param x Number of microsteps to move in the X direction
    * @param y Number of microsteps to move in the Y direction
    */
  def moveAtConstantRate(duration: Double, x: Long, y: Long): Unit = {
    command(s"XM,${(duration * 1000).toLong},$x,$y")
  }

  /** Accumulated XY error, used to correct for movements with sub-step resolution */
  var error = Vec2(0, 0)
  /**
    * Execute a constant-acceleration motion plan using the low-level LM command.
    *
    * Note that the LM command is only available starting from EBB firmware version 2.5.3.
    */
  def executeXYMotionWithLM(plan: XYMotion): Unit = {
    plan.blocks.foreach(executeBlockWithLM)
  }

  def executeBlockWithLM(block: Planning.Block): Unit = {
    val (errX, stepsX) = modf((block.p2.x - block.p1.x) * stepMultiplier + error.x)
    val (errY, stepsY) = modf((block.p2.y - block.p1.y) * stepMultiplier + error.y)
    error = Vec2(errX, errY)
    if (stepsX != 0 || stepsY != 0) {
      moveWithAcceleration(
        stepsX,
        stepsY,
        block.vInitial * stepMultiplier,
        block.vFinal * stepMultiplier
      )
    }
  }

  /**
    * Execute a constant-acceleration motion plan using the high-level XM command.
    *
    * This is less accurate than using LM, since acceleration will only be adjusted every timestepMs milliseconds,
    * where LM can adjust the acceleration at a much higher rate, as it executes on-board the EBB.
    */
  def executeXYMotionWithXM(plan: XYMotion, timestepMs: Double = 15): Unit = {
    val timestepSec = timestepMs / 1000d
    var t = 0d
    while (t < plan.duration) {
      val i1 = plan.instant(t)
      val i2 = plan.instant(t + timestepSec)
      val d = i2.p - i1.p
      val (ex, sx) = modf(d.x * stepMultiplier + error.x)
      val (ey, sy) = modf(d.y * stepMultiplier + error.y)
      error = Vec2(ex, ey)
      moveAtConstantRate(timestepSec, sx, sy)
      t += timestepSec
    }
  }

  /** Execute a constant-acceleration motion plan, starting and ending with zero velocity. */
  def executeXYMotion(plan: XYMotion): Unit = {
    if (supportsLM()) executeXYMotionWithLM(plan)
    else executeXYMotionWithXM(plan)
  }

  def executePenMotion(pm: PenMotion): Unit = {
    //val clocksMoved = (pm.finalPos - pm.initialPos).abs
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
    //println(s"$clocksMoved")
    //val rate = clocksMoved * 24 / (pm.duration * 1000)
    setPenHeight(pm.finalPos, 0, (pm.duration * 1000 + 0).round.toInt)
  }

  def executeMotion(m: Planning.Motion): Unit = {
    m match {
      case xy: XYMotion => executeXYMotion(xy)
      case pm: PenMotion => executePenMotion(pm)
    }
  }

  def executePlan(plan: Plan, microsteppingMode: Int = 2): Unit = {
    enableMotors(microsteppingMode)

    plan.motions foreach executeMotion
  }

  def waitUntilMotorsIdle(): Unit = {
    Iterator.continually { query("QM") }.find(_.split(",") match {
      case Array("QM", commandStatus, motor1Status, motor2Status, fifoStatus) =>
        commandStatus == "0" && fifoStatus == "0"
      case s => println(s"Unexpected string ${s.toList}"); false
    })
  }

  /**
    * Query voltages for board & steppers. Useful to check whether stepper power is plugged in.
    *
    * @return Tuple of (RA0_VOLTAGE, V+_VOLTAGE, VIN_VOLTAGE)
    */
  def queryVoltages(): (Double, Double, Double) = {
    val Array(ra0Voltage, vPlusVoltage) = queryM("QC").head.split(",")
    (
      ra0Voltage.toInt / 1023.0 * 3.3,
      vPlusVoltage.toInt / 1023.0 * 3.3,
      vPlusVoltage.toInt / 1023.0 * 3.3 * 9.2 + 0.3
    )
  }

  def areSteppersPowered(): Boolean = {
    val (_, _, vInVoltage) = queryVoltages()
    vInVoltage > 6
  }

  def queryButton(): Boolean = {
    queryM("QB").head == "1"
  }

  /**
    * Query the firmware version running on the EBB.
    *
    * @return The version string, e.g. "Version: EBBv13_and_above EB Firmware Version 2.5.3"
    */
  def firmwareVersion(): String = query("V")

  private var cachedSupportsLM: Option[Boolean] = None
  /**
    * @return true iff the EBB firmware supports the LM command.
    */
  def supportsLM(): Boolean = {
    if (cachedSupportsLM.isEmpty) {
      cachedSupportsLM = Some {
        val Array(major, minor, patch) = firmwareVersion().split(" ").last.split("\\.").map(_.toInt)
        import scala.math.Ordering.Implicits._
        (major, minor, patch) >= (2, 5, 3)
      }
    }
    cachedSupportsLM.get
  }
}

class EBB(port: SerialPort) {
  private def exhaust(): Unit = {
    while (true) {
      val buf = new Array[Byte](1)
      if (port.readBytes(buf, 1) != 1)
        return
    }
  }

  def open(): OpenEBB = {
    if (!port.openPort()) {
      throw new RuntimeException(s"Couldn't open serial device ${port.getSystemPortName}")
    }
    // TODO: set the timeout dynamically according to the expected duration of the command being executed
    port.setComPortTimeouts(SerialPort.TIMEOUT_READ_SEMI_BLOCKING|SerialPort.TIMEOUT_WRITE_BLOCKING, 5000, 5000)
    exhaust()
    new OpenEBB(port)
  }

  def open(f: OpenEBB => Unit): Unit = {
    val openebb = open()
    try {
      f(openebb)
    } finally {
      if (!port.closePort()) {
        throw new RuntimeException(s"Couldn't close serial device ${port.getSystemPortName}")
      }
    }
  }
}

object EBB {
  def findEiBotBoard(): Option[SerialPort] =
    jSerialComm.SerialPort.getCommPorts find { _.getDescriptivePortName startsWith "EiBotBoard" }

  def findFirst: Option[EBB] = findEiBotBoard() match {
    case Some(port) => Some(new EBB(port))
    case None => None
  }
}
