package saxi

import scala.collection.immutable.ListMap

case class PaperSize(
  size: Vec2
) {
  def portrait: PaperSize = PaperSize(Vec2(math.min(size.x, size.y), math.max(size.x, size.y)))
  def landscape: PaperSize = PaperSize(Vec2(math.max(size.x, size.y), math.min(size.x, size.y)))
}

object PaperSize {
  val USLetter: PaperSize = PaperSize(Vec2(8.5, 11) * 25.4)
  val USLegal: PaperSize = PaperSize(Vec2(8.5, 14) * 25.4)
  val ArchA: PaperSize = PaperSize(Vec2(9, 12) * 25.4)
  val A4: PaperSize = PaperSize(Vec2(210, 297))
  val A5: PaperSize = PaperSize(Vec2(148, 210))
  val A6: PaperSize = PaperSize(Vec2(105, 148))

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
