package saxi

/** 3x3 Matrix
  * ( a  b  c )
  * ( d  e  f )
  * ( g  h  i )
  */
case class Mat33(a: Double, b: Double, c: Double, d: Double, e: Double, f: Double, g: Double, h: Double, i: Double) {
  def *(v: Vec3): Vec3 = Vec3(
    a * v.x + b * v.y + c * v.z,
    d * v.x + e * v.y + f * v.z,
    g * v.x + h * v.y + i * v.z
  )
  def *(m: Mat33): Mat33 = Mat33(
    a * m.a + b * m.d + c * m.g, a * m.b + b * m.e + c * m.h, a * m.c + b * m.f + c * m.i,
    d * m.a + e * m.d + f * m.g, d * m.b + e * m.e + f * m.h, d * m.c + e * m.f + f * m.i,
    g * m.a + h * m.d + i * m.g, g * m.b + h * m.e + i * m.h, g * m.c + h * m.f + i * m.i
  )
  def *(k: Double): Mat33 = Mat33(
    a * k, b * k, c * k,
    d * k, e * k, f * k,
    g * k, h * k, i * k
  )

  def *(v: Vec2): Vec2 = this * Vec3(v.x, v.y, 1) match { case Vec3(x, y, _) => Vec2(x, y) }

  def inverse: Mat33 = {
    val ai = e * i - f * h
    val bi = -(d * i - f * g)
    val ci = d * h - e * g
    val di = -(b * i - c * h)
    val ei = a * i - c * g
    val fi = -(a * h - b * g)
    val gi = b * f - c * e
    val hi = -(a * f - c * d)
    val ii = a * e - b * d
    val det = a * ai + b * bi + c * ci
    if (det == 0)
      throw new RuntimeException(s"Singular matrix can't be inverted: $this")
    Mat33(
      ai, di, gi,
      bi, ei, hi,
      ci, fi, ii
    ) * (1 / det)
  }

  def determinant: Double = {
    val ai = e * i - f * h
    val bi = -(d * i - f * g)
    val ci = d * h - e * g
    a * ai + b * bi + c * ci
  }

  def toSeq: Seq[Double] = Seq(a, b, c, d, e, f, g, h, i)
}
object Mat33 {
  def identity: Mat33 = Mat33(
    1, 0, 0,
    0, 1, 0,
    0, 0, 1
  )
  def translate(tx: Double, ty: Double): Mat33 = Mat33(
    1, 0, tx,
    0, 1, ty,
    0, 0, 1
  )
  def translate(v: Vec2): Mat33 = translate(v.x, v.y)
  def rotate(theta: Double): Mat33 = {
    val c = math.cos(theta)
    val s = -math.sin(theta)
    Mat33(
      c, -s, 0,
      s, c, 0,
      0, 0, 1
    )
  }
  def scale(k: Double): Mat33 = {
    Mat33(
      k, 0, 0,
      0, k, 0,
      0, 0, 1
    )
  }
  def scale(x: Double, y: Double): Mat33 = {
    Mat33(
      x, 0, 0,
      0, y, 0,
      0, 0, 1
    )
  }
  def scale(v: Vec2): Mat33 = scale(v.x, v.y)
}

