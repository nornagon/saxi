package saxi

trait Device {
  def stepsPerMm: Double
  def penServoMin: Int
  def penServoMax: Int
}

object Device {
  val Axidraw = new Device {
    override val stepsPerMm: Double = 5
    override val penServoMin: Int = 7500
    override val penServoMax: Int = 28000
  }
}