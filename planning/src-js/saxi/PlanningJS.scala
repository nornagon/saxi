package saxi

import scala.scalajs.js.annotation._
import scala.scalajs.js
import js.JSConverters._


@JSExportTopLevel("Planning")
object PlanningJS {
  @JSExport
  def plan(paths: js.Array[js.Array[js.Array[Double]]]) = {
    Planning.plan(paths.map(points => points.map(p => Vec2(p(0), p(1))).toSeq).toSeq, ToolingProfile.AxidrawFast).motions.toJSArray
  }
}
