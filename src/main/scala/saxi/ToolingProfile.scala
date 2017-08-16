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
}

