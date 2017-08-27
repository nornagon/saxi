package saxi

case class ToolingProfile(
  acceleration: Double,
  maximumVelocity: Double,
  corneringFactor: Double,
)

object ToolingProfile {
  val AxidrawFast = ToolingProfile(
    acceleration = 200 * Device.Axidraw.stepsPerMm,
    maximumVelocity = 50 * Device.Axidraw.stepsPerMm,
    corneringFactor = 0.127 * Device.Axidraw.stepsPerMm
  )

  val AxidrawPenUp = ToolingProfile(
    acceleration = 400 * Device.Axidraw.stepsPerMm,
    maximumVelocity = 200 * Device.Axidraw.stepsPerMm,
    corneringFactor = 0
  )
}

