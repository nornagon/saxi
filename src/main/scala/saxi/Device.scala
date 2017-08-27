package saxi

trait Device {
  def stepsPerMm: Double
}

object Device {
  val Axidraw = new Device {
    override val stepsPerMm: Double = 5
  }
}