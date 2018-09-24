package saxi

import scala.scalajs.js.annotation.{JSExportAll, JSExportTopLevel}

@JSExportAll
@JSExportTopLevel("Util")
object Util {
  /** Split d into its fractional and integral parts */
  def modf(d: Double): (Double, Long) = {
    val intPart = d.toLong
    val fracPart = d - intPart
    (fracPart, intPart)
  }

  /** Format a smallish duration in 2h30m15s form */
  def formatDuration(seconds: Double): String = {
    val hours = (seconds / 60 / 60).floor.toLong
    val mins = ((seconds - hours * 60 * 60) / 60).floor.toLong
    val secs = (seconds - hours * 60 * 60 - mins * 60).floor.toLong
    Seq((hours, "h"), (mins, "m"), (secs, "s")).dropWhile(_._1 == 0).map { case (n, s) => s"$n$s" }.mkString
  }

  /** Return the top-left and bottom-right corners of the bounding box containing all points in pointLists */
  def extent(pointLists: Seq[Seq[Vec2]]): (Vec2, Vec2) = {
    val allPoints = pointLists.flatten
    val maxX = allPoints.view.map(_.x).max
    val maxY = allPoints.view.map(_.y).max
    val minX = allPoints.view.map(_.x).min
    val minY = allPoints.view.map(_.y).min
    (Vec2(minX, minY), Vec2(maxX, maxY))
  }

  /**
    * Scale pointLists to fit within the bounding box specified by (targetMin, targetMax).
    *
    * Preserves aspect ratio, scaling as little as possible to completely fit within the box.
    *
    * Also centers the paths within the box.
    */
  def scaleToFit(pointLists: Seq[Seq[Vec2]], targetMin: Vec2, targetMax: Vec2): Seq[Seq[Vec2]] = {
    val (min, max) = Util.extent(pointLists)
    val availWidthMm = targetMax.x - targetMin.x
    val availHeightMm = targetMax.y - targetMin.y
    val scaleFitX = availWidthMm / (max.x - min.x)
    val scaleFitY = availHeightMm / (max.y - min.y)
    val scale = math.min(scaleFitX, scaleFitY)
    val targetCenter = targetMin + (targetMax - targetMin) * 0.5
    val offset = targetCenter - (max - min) * scale * 0.5
    pointLists.map { pl => pl.map { p => (p - min) * scale + offset } }
  }

  /** Scale a drawing to fill a piece of paper, with the given size and margins. */
  def scaleToPaper(pointLists: Seq[Seq[Vec2]], paperSize: PaperSize, marginMm: Double): Seq[Seq[Vec2]] = {
    Util.scaleToFit(
      pointLists,
      Vec2(marginMm, marginMm),
      paperSize.size - Vec2(marginMm, marginMm)
    )
  }
}
