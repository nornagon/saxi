package saxi

import scala.scalajs.js.annotation.{JSExport, JSExportAll, JSExportTopLevel}

@JSExportAll
trait Device {
  def stepsPerMm: Double
  def penServoMin: Int
  def penServoMax: Int
  def penPctToPos(pct: Double): Int
}

@JSExportTopLevel("Device")
object Device {
  @JSExport
  val Axidraw = new Device {
    override val stepsPerMm: Double = 5

    // Practical min/max that you might ever want the pen servo to go on the AxiDraw (v2)
    // Units: 83ns resolution pwm output.
    // Defaults: penup at 12000 (1ms), pendown at 16000 (1.33ms).
    override val penServoMin: Int = 7500
    override val penServoMax: Int = 28000

    @JSExport
    def penPctToPos(pct: Double): Int = {
      val t = pct / 100.0
      (penServoMin * t + penServoMax * (1 - t)).round.toInt
    }
  }
}