package saxi

import scala.annotation.meta.field
import scala.scalajs.js.annotation.{JSExport, JSExportTopLevel}

@JSExportTopLevel("Vec2")
case class Vec2(@(JSExport @field) x: Double, @(JSExport @field) y: Double) {
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
