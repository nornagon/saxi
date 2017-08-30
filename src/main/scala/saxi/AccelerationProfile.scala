package saxi

case class AccelerationProfile(
  acceleration: Double,
  maximumVelocity: Double,
  corneringFactor: Double,
)

case class ToolingProfile(
  penDownProfile: AccelerationProfile,
  penUpProfile: AccelerationProfile,
  penDownPos: Int,
  penUpPos: Int,
  penLiftDuration: Double,
  penDropDuration: Double,
)

object ToolingProfile {
  val AxidrawFast = AccelerationProfile(
    acceleration = 200 * Device.Axidraw.stepsPerMm,
    maximumVelocity = 50 * Device.Axidraw.stepsPerMm,
    corneringFactor = 0.127 * Device.Axidraw.stepsPerMm
  )

  val AxidrawPenUp = AccelerationProfile(
    acceleration = 400 * Device.Axidraw.stepsPerMm,
    maximumVelocity = 200 * Device.Axidraw.stepsPerMm,
    corneringFactor = 0
  )

  def axidrawPenPctToPos(pct: Double): Int = {
    import Device.Axidraw.{penServoMin, penServoMax}
    val clocksPerPct = (penServoMax - penServoMin) / 100.0
    (penServoMax - pct * clocksPerPct).round.toInt
  }

  def axidrawPenPctPerSecToRate(pctPerSec: Double): Int = {
    import Device.Axidraw.{penServoMin, penServoMax}
    val clocksPerPct = (penServoMax - penServoMin) / 100.0
    (pctPerSec * (24 / 1000.0) * clocksPerPct).round.toInt
  }

  val AxidrawFastProfile = ToolingProfile(
    penDownProfile = AxidrawFast,
    penUpProfile = AxidrawPenUp,
    penUpPos = axidrawPenPctToPos(50),
    penDownPos = axidrawPenPctToPos(60),
    penDropDuration = 0.067,
    penLiftDuration = 0.067,
  )
}

