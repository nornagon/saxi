package saxi

case class ToolingProfile(
  acceleration: Double,
  maximumVelocity: Double,
  corneringFactor: Double,
)

object ToolingProfile {
  private val AxidrawStepsPerMm = 5
  val AxidrawFast = ToolingProfile(
    acceleration = 200 * AxidrawStepsPerMm,
    maximumVelocity = 50 * AxidrawStepsPerMm,
    corneringFactor = 0.127 * AxidrawStepsPerMm
  )

  val AxidrawPenUp = ToolingProfile(
    acceleration = 400 * AxidrawStepsPerMm,
    maximumVelocity = 200 * AxidrawStepsPerMm,
    corneringFactor = 0
  )
}

