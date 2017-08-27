package saxi

import scala.collection.immutable.ListMap

case class PaperSize(
  size: Vec2
) {
  def flipped: PaperSize = PaperSize(Vec2(size.y, size.x))
}

object PaperSize {
  val USLetter: PaperSize = PaperSize(Vec2(11, 8.5) * 25.4)
  val USLegal: PaperSize = PaperSize(Vec2(14, 8.5) * 25.4)
  val ArchA: PaperSize = PaperSize(Vec2(12, 9) * 25.4)
  val A4: PaperSize = PaperSize(Vec2(297, 210))
  val A5: PaperSize = PaperSize(Vec2(210, 148))
  val A6: PaperSize = PaperSize(Vec2(148, 105))

  val byName = ListMap(
    "USLetter" -> USLetter,
    "USLegal" -> USLegal,
    "ArchA" -> ArchA,
    "A4" -> A4,
    "A5" -> A5,
    "A6" -> A6,
  )

  def supported: String = {
    byName.map { case (name, size) =>
      f"$name (${size.size.x}%.1fx${size.size.y}%.1f mm)"
    }.mkString(", ")
  }
}
