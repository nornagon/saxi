package saxi

trait Device {
  def stepsPerMm: Double
  def penServoMin: Int
  def penServoMax: Int
}

object Device {
  val Axidraw = new Device {
    override val stepsPerMm: Double = 5

    // Practical min/max that you might ever want the pen servo to go on the AxiDraw (v2)
    // Units: 83ns resolution pwm output.
    // Defaults: penup at 12000 (1ms), pendown at 16000 (1.33ms).
    override val penServoMin: Int = 7500
    override val penServoMax: Int = 28000

    def penPctToPos(pct: Double): Int = {
      val t = pct / 100.0
      (penServoMin * t + penServoMax * (1 - t)).round.toInt
      (penServoMax - pct / 100.0 * (penServoMax - penServoMin)).round.toInt
    }
  }
}