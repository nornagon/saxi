package saxi

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

  def extent(pointLists: Seq[Seq[Vec2]]): (Vec2, Vec2) = {
    val allPoints = pointLists.flatten
    val maxX = allPoints.view.map(_.x).max
    val maxY = allPoints.view.map(_.y).max
    val minX = allPoints.view.map(_.x).min
    val minY = allPoints.view.map(_.y).min
    (Vec2(minX, minY), Vec2(maxX, maxY))
  }

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
}
