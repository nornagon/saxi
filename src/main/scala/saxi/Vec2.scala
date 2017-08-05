package saxi

case class Vec2(x: Double, y: Double) {
  def +(o: Vec2) = Vec2(x + o.x, y + o.y)
  def -(o: Vec2) = Vec2(x - o.x, y - o.y)
  def *(k: Double) = Vec2(x * k, y * k)
  def /(k: Double) = Vec2(x / k, y / k)
  def length: Double = math.sqrt(x*x+y*y)

  def norm: Vec2 = this / length

  def dot(other: Vec2): Double = x*other.x + y*other.y

  def unary_-(): Vec2 = Vec2(-x, -y)

  def toTuple: (Double, Double) = (x, y)
}
