package saxi

object Calibration {
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
}
