package saxi

case class Vec3(x: Double, y: Double, z: Double) {
  def toVec2: Vec2 = Vec2(x, y)

  def +(other: Vec3): Vec3 = Vec3(x + other.x, y + other.y, z + other.z)
  def -(other: Vec3): Vec3 = Vec3(x - other.x, y - other.y, z - other.z)
  def *(k: Double): Vec3 = Vec3(x * k, y * k, z * k)
  def /(k: Double): Vec3 = Vec3(x / k, y / k, z / k)

  def dot(other: Vec3): Double = x * other.x + y * other.y + z * other.z
  def cross(other: Vec3): Vec3 = Vec3(
    y * other.z - z * other.y,
    z * other.x - x * other.z,
    x * other.y - y * other.x
  )


  def ->(other: Vec3): Vec3 = other - this

  def lengthSquared: Double = x * x + y * y + z * z
  def length: Double = math.sqrt(lengthSquared)
  def normed: Vec3 = if (length == 0) Vec3(0, 0, 0) else this / length
}
