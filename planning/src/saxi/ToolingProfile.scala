package saxi

import scala.scalajs.js.annotation._

@JSExportTopLevel("AccelerationProfile")
case class AccelerationProfile(
  acceleration: Double,
  maximumVelocity: Double,
  corneringFactor: Double,
)

@JSExportTopLevel("ToolingProfile")
case class ToolingProfile(
  penDownProfile: AccelerationProfile,
  penUpProfile: AccelerationProfile,
  penDownPos: Int,
  penUpPos: Int,
  penLiftDuration: Double,
  penDropDuration: Double,
)

@JSExportTopLevel("TPPreset")
object ToolingProfile {
  @JSExport
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
    penDropDuration = 0.12,
    penLiftDuration = 0.12,
  )
}

