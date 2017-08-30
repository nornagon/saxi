package saxi

import scala.annotation.tailrec
import scala.collection.mutable.ArrayBuffer
import scala.collection.{Searching, mutable}

/**
  * Cribbed from https://github.com/fogleman/axi/blob/master/axi/planner.py
  */
object Planning {
  val epsilon: Double = 1e-9

  case class Instant(t: Double, p: Vec2, s: Double, v: Double, a: Double)

  case class Block(accel: Double, duration: Double, vInitial: Double, p1: Vec2, p2: Vec2) {
    require(vInitial + accel * duration >= -epsilon, s"vFinal must be >= 0, but vInitial=$vInitial, duration=$duration, accel=$accel")
    def vFinal: Double = math.max(0, vInitial + accel * duration)
    require(vInitial >= 0, s"vInitial must be >= 0, but was $vInitial")
    val distance: Double = (p1 - p2).length
    def instant(tU: Double, dt: Double=0, ds: Double=0): Instant = {
      val t = math.max(0, math.min(duration, tU))
      val a = accel
      val v = vInitial + accel * t
      val s = math.max(0, math.min(distance, vInitial * t + accel * t * t / 2))
      val p = p1 + (p2 - p1).norm * s
      Instant(t + dt, p, s + ds, v, a)
    }
  }

  trait Motion {
    def duration: Double
  }

  case class PenMotion(initialPos: Int, finalPos: Int, duration: Double) extends Motion

  case class XYMotion(blocks: Seq[Block]) extends Motion {
    private val ts: Seq[Double] = blocks.map(_.duration).scan(0d)(_ + _).init
    private val ss: Seq[Double] = blocks.map(_.distance).scan(0d)(_ + _).init
    val duration: Double = blocks.map(_.duration).sum

    def instant(t: Double): Instant = {
      val result = Searching.search(ts).search(t)
      val blockIdx = result match {
        case Searching.Found(i) => i
        case Searching.InsertionPoint(i) => i - 1
      }
      val block = blocks(blockIdx)
      block.instant(t - ts(blockIdx), ts(blockIdx), ss(blockIdx))
    }

    def p1: Vec2 = blocks.head.p1
    def p2: Vec2 = blocks.last.p2
  }

  case class Plan(motions: Seq[Motion]) {
    def duration: Double = motions.map(_.duration).sum
  }

  case class Segment(
    p1: Vec2,
    p2: Vec2
  ) {
    val length: Double = (p2 - p1).length
    val direction: Vec2 = (p2 - p1).norm
    var maxEntryVelocity: Double = 0
    var entryVelocity: Double = 0
    var blocks: Seq[Block] = Seq()
  }

  def cornerVelocity(seg1: Segment, seg2: Segment, vMax: Double, accel: Double, cornerFactor: Double): Double = {
    // https://onehossshay.wordpress.com/2011/09/24/improving_grbl_cornering_algorithm/
    val cosine = -seg1.direction.dot(seg2.direction)
    assert(!cosine.isNaN, s"cosine was NaN: $seg1, $seg2, ${seg1.direction}, ${seg2.direction}")
    if (math.abs(cosine - 1) < epsilon)
      return 0
    val sine = math.sqrt((1 - cosine) / 2)
    if (math.abs(sine - 1) < epsilon)
      return vMax
    val v = math.sqrt((accel * cornerFactor * sine) / (1 - sine))
    assert(!v.isNaN, s"v was NaN: $accel, $cornerFactor, $sine")
    math.min(v, vMax)
  }

  case class Triangle(
    s1: Double, s2: Double,
    t1: Double, t2: Double,
    vMax: Double,
    p1: Vec2, p2: Vec2, p3: Vec2
  )
  object Triangle {
    /** Compute a triangular velocity profile with piecewise constant acceleration.
      *
      * {{{
      * +a ^____,        positive acceleration until maximum velocity is reached
      *    |    |
      *    |----|---> t
      *    |    |___     followed by negative acceleration until final velocity is reached
      * -a v
      *
      * +v ^    ,
      *    |  ,' `.   vf
      * vi |,'     `
      *    |
      *    +--------> t
      * }}}
      *
      * The maximum velocity is derived from the maximum acceleration and the distance to be travelled.
      *
      * @param distance Distance to travel.
      * @param initialVel Starting velocity, unit length per unit time.
      * @param finalVel Final velocity, unit length per unit time.
      * @param accel Magnitude of acceleration, unit length per unit time per unit time.
      * @param p1 Starting point.
      * @param p3 Ending point.
      * @return
      */
    def compute(distance: Double, initialVel: Double, finalVel: Double, accel: Double, p1: Vec2, p3: Vec2): Triangle = {
      require(!finalVel.isNaN, s"finalVel was NaN")
      val acceleratingDistance = (2 * accel * distance + finalVel * finalVel - initialVel * initialVel) / (4 * accel)
      assert(!acceleratingDistance.isNaN, s"acceleratingDistance was NaN: $accel, $distance, $finalVel, $initialVel")
      val deceleratingDistance = distance - acceleratingDistance
      val vMax = math.sqrt(initialVel * initialVel + 2 * accel * acceleratingDistance)
      assert(!vMax.isNaN, s"vMax was NaN: $initialVel, $accel, $acceleratingDistance")
      val t1 = (vMax - initialVel) / accel
      val t2 = (finalVel - vMax) / -accel
      assert(!t1.isNaN, s"t1 was NaN: $vMax $initialVel $accel")
      assert(!t2.isNaN, s"t2 was NaN: $vMax $finalVel $accel")
      val p2 = p1 + (p3 - p1).norm * acceleratingDistance
      Triangle(acceleratingDistance, deceleratingDistance, t1, t2, vMax, p1, p2, p3)
    }
  }

  case class Trapezoid(
    s1: Double, s2: Double, s3: Double,
    t1: Double, t2: Double, t3: Double,
    p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2
  )
  object Trapezoid {
    def compute(distance: Double, initialVel: Double, maxVel: Double, finalVel: Double, accel: Double, p1: Vec2, p4: Vec2): Trapezoid = {
      val t1 = (maxVel - initialVel) / accel
      val s1 = (maxVel + initialVel) / 2 * t1
      val t3 = (finalVel - maxVel) / -accel
      val s3 = (finalVel + maxVel) / 2 * t3
      val s2 = distance - s1 - s3
      val t2 = s2 / maxVel
      val dir = (p4 - p1).norm
      val p2 = p1 + dir * s1
      val p3 = p1 + dir * (distance - s3)
      Trapezoid(s1, s2, s3, t1, t2, t3, p1, p2, p3, p4)
    }
  }

  /**
    * Plan a path, using a constant acceleration profile.
    * @param points Sequence of points to pass through
    * @param profile Tooling profile to use
    * @return A plan of action
    */
  def constantAccelerationPlan(points: Seq[Vec2], profile: AccelerationProfile): XYMotion = {
    val dedupedPoints = mutable.ArrayBuffer.empty[Vec2]
    dedupedPoints += points.head
    for (p <- points.tail) {
      if ((p - dedupedPoints.last).length > epsilon)
        dedupedPoints += p
    }
    if (dedupedPoints.size == 1) {
      return XYMotion(Seq(Block(0, 0, 0, dedupedPoints.head, dedupedPoints.head)))
    }
    var segments = dedupedPoints.sliding(2).map { case Seq(a, b) => Segment(a, b) }.toSeq
    val accel = profile.acceleration
    val vMax = profile.maximumVelocity
    val cornerFactor = profile.corneringFactor
    for ((s1, s2) <- segments.zip(segments.tail)) {
      s2.maxEntryVelocity = cornerVelocity(s1, s2, vMax, accel, cornerFactor)
      assert(!s2.maxEntryVelocity.isNaN, s"cornerVel was NaN: $s1, $s2, $vMax, $accel, $cornerFactor")
    }

    segments = segments :+ Segment(dedupedPoints.last, dedupedPoints.last)

    var i: Int = 0
    while (i < segments.size - 1) {
      val segment = segments(i)
      val nextSegment = segments(i + 1)
      val distance = segment.length
      val vInitial = segment.entryVelocity
      val vExit = nextSegment.maxEntryVelocity
      val p1 = segment.p1
      val p2 = segment.p2

      val m = Triangle.compute(distance, vInitial, vExit, accel, p1, p2)
      if (m.s1 < -epsilon) {
        // We'd have to start decelerating _before we started on this segment_. backtrack.
        // In order enter this segment slow enough to be leaving it at vExit, we need to compute a maximum entry
        // velocity s.t. we can slow down in the distance we have.
        // TODO: verify this equation.
        segment.maxEntryVelocity = math.sqrt(vExit * vExit + 2 * accel * distance)
        i -= 1
      } else if (m.s2 < 0) {
        // No deceleration.
        val vFinal = math.sqrt(vInitial * vInitial + 2 * accel * distance)
        val t = (vFinal - vInitial) / accel
        segment.blocks = Seq(
          Block(accel, t, vInitial, p1, p2)
        )
        nextSegment.entryVelocity = vFinal
        i += 1
      } else if (m.vMax > vMax) {
        // Triangle profile would exceed maximum velocity, so top out at vMax.
        val z = Trapezoid.compute(distance, vInitial, vMax, vExit, accel, p1, p2)
        segment.blocks = Seq(
          Block(accel, z.t1, vInitial, z.p1, z.p2),
          Block(0, z.t2, vMax, z.p2, z.p3),
          Block(-accel, z.t3, vMax, z.p3, z.p4)
        )
        nextSegment.entryVelocity = vExit
        i += 1
      } else {
        // Accelerate, then decelerate.
        segment.blocks = Seq(
          Block(accel, m.t1, vInitial, m.p1, m.p2),
          Block(-accel, m.t2, m.vMax, m.p2, m.p3)
        )
        nextSegment.entryVelocity = vExit
        i += 1
      }
    }
    val blocks: Seq[Block] = segments.flatMap(_.blocks).filter(_.duration > epsilon)
    XYMotion(blocks.toList)
  }

  def plan(
    paths: Seq[Seq[Vec2]],
    profile: ToolingProfile
  ): Plan = {
    val drawnMotions = paths.map { constantAccelerationPlan(_, profile.penDownProfile) }
    Plan((constantAccelerationPlan(Seq(Vec2(0, 0)), profile.penUpProfile) +: drawnMotions).sliding(2).flatMap {
      case Seq(a, b) =>
        Seq(
          constantAccelerationPlan(Seq(a.p2, b.p1), profile.penUpProfile),
          PenMotion(profile.penUpPos, profile.penDownPos, profile.penDropDuration),
          b,
          PenMotion(profile.penDownPos, profile.penUpPos, profile.penLiftDuration),
        )
    }.toSeq :+ constantAccelerationPlan(Seq(drawnMotions.last.p2, Vec2(0, 0)), profile.penUpProfile))
  }
}
