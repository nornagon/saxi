package saxi

import scala.scalajs.js.annotation._
import scala.scalajs.js
import js.JSConverters._


@JSExportTopLevel("Planning")
@JSExportAll
object PlanningJS {
  def optimize(jsPaths: js.Array[js.Array[js.Array[Double]]]): js.Array[js.Array[js.Array[Double]]] = {
    if (jsPaths.length == 0) return jsPaths
    val paths = jsPaths.map(points => points.map(p => Vec2(p(0), p(1))).toSeq).toSeq
    Optimization.optimize(paths).map { ps => ps.map { p => js.Array(p.x, p.y) }.toJSArray }.toJSArray
  }

  def plan(
    jsPaths: js.Array[js.Array[js.Array[Double]]],
    penUpPos: Int = ToolingProfile.AxidrawFast.penUpPos,
    penDownPos: Int = ToolingProfile.AxidrawFast.penDownPos
  ): Planning.Plan = {
    if (jsPaths.length == 0) return Planning.Plan(Seq.empty)
    val paths = jsPaths.map(points => points.map(p => Vec2(p(0), p(1))).toSeq).toSeq
    Planning.plan(paths, ToolingProfile.AxidrawFast.copy(penUpPos = penUpPos, penDownPos = penDownPos))
  }

  def scaleToPaper(jsPaths: js.Array[js.Array[js.Array[Double]]], paperSize: PaperSize, marginMm: Double): js.Array[js.Array[js.Array[Double]]] = {
    val paths = jsPaths.map(points => points.map(p => Vec2(p(0), p(1))).toSeq).toSeq
    Util.scaleToPaper(paths, paperSize, marginMm).map { ps => ps.map { p => js.Array(p.x, p.y) }.toJSArray }.toJSArray
  }

  def planPoints(plan: Planning.Plan): js.Array[js.Array[Vec2]] = {
    plan.motions.toJSArray.flatMap {
      case xy: Planning.XYMotion =>
        Seq((xy.blocks.map(_.p1) :+ xy.p2).toJSArray)
      case _ => Seq()
    }
  }

  def paperSizes = PaperSize.byName.toJSDictionary
}
