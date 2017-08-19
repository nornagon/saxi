package saxi

object Util {
  /** Split d into its fractional and integral parts */
  def modf(d: Double): (Double, Long) = {
    val intPart = d.toLong
    val fracPart = d - intPart
    (fracPart, intPart)
  }
}
