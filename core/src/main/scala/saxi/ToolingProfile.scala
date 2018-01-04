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
  val AxidrawFast = ToolingProfile(
    penDownProfile = AccelerationProfile(
      acceleration = 200 * Device.Axidraw.stepsPerMm,
      maximumVelocity = 50 * Device.Axidraw.stepsPerMm,
      corneringFactor = 0.127 * Device.Axidraw.stepsPerMm
    ),
    penUpProfile = AccelerationProfile(
      acceleration = 400 * Device.Axidraw.stepsPerMm,
      maximumVelocity = 200 * Device.Axidraw.stepsPerMm,
      corneringFactor = 0
    ),
    penUpPos = Device.Axidraw.penPctToPos(50),
    penDownPos = Device.Axidraw.penPctToPos(60),
    penDropDuration = 0.067,
    penLiftDuration = 0.067,
  )
}

