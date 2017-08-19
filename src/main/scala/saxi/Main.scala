package saxi

import java.io.File

object Main {
  def extent(pointLists: Seq[Seq[Vec2]]): (Vec2, Vec2) = {
    val allPoints = pointLists.flatten
    val maxX = allPoints.view.map(_.x).max
    val maxY = allPoints.view.map(_.y).max
    val minX = allPoints.view.map(_.x).min
    val minY = allPoints.view.map(_.y).min
    (Vec2(minX, minY), Vec2(maxX, maxY))
  }

  def formatDuration(seconds: Double): String = {
    val hours = (seconds / 60 / 60).floor.toLong
    val mins = ((seconds - hours * 60 * 60) / 60).floor.toLong
    val secs = (seconds - hours * 60 * 60 - mins * 60).floor.toLong
    Seq((hours, "h"), (mins, "m"), (secs, "s")).filter(_._1 > 0).map { case (n, s) => s"$n$s" }.mkString
  }

  /** A calibration pattern that will hopefully expose missed steps or unaccounted-for residual errors. */
  def calibrationPattern(): Seq[Seq[Vec2]] = {
    def square(): Seq[Seq[Vec2]] = {
      Seq(Seq(Vec2(0,0), Vec2(-20,0), Vec2(-20,-20), Vec2(0,-20), Vec2(0,0)))
    }
    def zigZag(): Seq[Seq[Vec2]] = {
      (0 to 10) flatMap { y =>
        Seq(
          (0 to 400) map { x => Vec2(x/3.0, (x % 2) / 9.0 + math.sin(x / 50.0) * 10) + Vec2(0, y*10) },
          (400 to 0 by -1) map { x => Vec2(x/3.0, 4 + math.sin(x / 50.0) * 10 + (x % 3) / 7.0) + Vec2(0, y*10) },
        )
      }
    }
    square() ++ zigZag() ++ square()
  }

  object PaperSize {
    val USLetter: Vec2 = Vec2(11, 8.5) * 25.4
    val ArchA: Vec2 = Vec2(12, 9) * 25.4
  }

  def scaleToFit(pointLists: Seq[Seq[Vec2]], targetMin: Vec2, targetMax: Vec2): Seq[Seq[Vec2]] = {
    val (min, max) = extent(pointLists)
    val availWidthMm = targetMax.x - targetMin.x
    val availHeightMm = targetMax.y - targetMin.y
    val scaleFitX = availWidthMm / (max.x - min.x)
    val scaleFitY = availHeightMm / (max.y - min.y)
    val scale = math.min(scaleFitX, scaleFitY)
    val targetCenter = targetMin + (targetMax - targetMin) * 0.5
    val offset = targetCenter - (max - min) * scale * 0.5
    pointLists.map { pl => pl.map { p => ((p - min) * scale + offset) * ToolingProfile.AxidrawStepsPerMm } }
  }

  def scaleToPaper(pointLists: Seq[Seq[Vec2]], paperSizeMm: Vec2, marginMm: Double): Seq[Seq[Vec2]] = {
    scaleToFit(pointLists, Vec2(marginMm, marginMm), paperSizeMm - Vec2(marginMm, marginMm))
  }

  def main(args: Array[String]): Unit = {
    val pointLists = Optimization.optimize(SVG.readSVG(new File(args.head)))

    val scaledPointLists = scaleToPaper(pointLists, PaperSize.USLetter, marginMm = 20)

    val plans = Planning.plan(scaledPointLists, ToolingProfile.AxidrawFast)

    println(s"Planned ${pointLists.map(_.size).sum} points with ${plans.map(_.blocks.size).sum} blocks")
    // TODO: Estimate total time, incl. pen-up moves
    println(f"Estimated pen-down time: ${formatDuration(plans.map(_.tMax).sum)}")
    val (min, max) = extent(scaledPointLists)
    println("Will reach from the current location of the pen:")
    println(
      f"  ${min.x / ToolingProfile.AxidrawStepsPerMm}%.2f - ${max.x / ToolingProfile.AxidrawStepsPerMm}%.2f mm in X\n" +
      f"  ${min.y / ToolingProfile.AxidrawStepsPerMm}%.2f - ${max.y / ToolingProfile.AxidrawStepsPerMm}%.2f mm in Y")

    EBB.findFirst.open { ebb =>
      if (!ebb.areSteppersPowered()) {
        println("[ERROR] Device does not appear to have servo power.")
        return
      }
      ebb.configure(penUpPct = 50, penDownPct = 60)

      ebb.enableMotors(microsteppingMode = 5)
      ebb.raisePen()
      ebb.disableMotors()
      println("Pen up and motors disabled, move to home.")
      println("Press [enter] to plot.")
      io.StdIn.readLine()

      ebb.plot(plans)

      ebb.waitUntilMotorsIdle()
      ebb.disableMotors()
    }
  }
}
