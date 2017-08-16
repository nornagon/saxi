package saxi

import java.io.File

import com.google.ortools.constraintsolver.{FirstSolutionStrategy, NodeEvaluator2, RoutingSearchParameters}
import saxi.Planning.Plan

import scala.collection.mutable

object Main {
  val fullStepsPerInch: Int = 127
  val fullStepsPerMm: Int = 5

  def joinNearby(pointLists: Seq[Seq[Vec2]]): Seq[Seq[Vec2]] = {
    def maybeJoin(a: Seq[Vec2], b: Seq[Vec2]): Seq[Seq[Vec2]] = {
      val tolerance = 2 // full steps
      if ((a.last - b.head).length <= tolerance)
        Seq(a ++ b.dropWhile(v => (a.last - v).length <= tolerance))
      else
        Seq(a, b)
    }
    def appendAndJoin(a: Seq[Seq[Vec2]], b: Seq[Vec2]): Seq[Seq[Vec2]] = {
      if (a.isEmpty) Seq(b)
      else a.init ++ maybeJoin(a.last, b)
    }
    pointLists.foldLeft(Seq.empty[Seq[Vec2]])(appendAndJoin)
  }

  def optimize(pointLists: Seq[Seq[Vec2]]): Seq[Seq[Vec2]] = {
    // The distance between macro planning points i and j is given by
    // pointDists((n C 2) - (n-i C 2) + (j - i - 1))
    // where n is the # of points
    //       (n C k) is the binomial coefficient
    def distBetween(i: Int, j: Int): Double = {
      if (i == j) return 0
      val a = pointLists(i/2)
      val b = pointLists(j/2)
      val pa = if (i % 2 == 0) a.last else a.head
      val pb = if (j % 2 == 0) b.head else b.last
      val dx = pa.x - pb.x
      val dy = pa.y - pb.y
      math.sqrt(dx*dx + dy*dy)
    }

    val visited = new mutable.BitSet()
    val sortedPointLists = new mutable.ArrayBuffer[Seq[Vec2]](pointLists.size)
    val begin2 = System.nanoTime()
    var firstIdx = 0
    visited.add(firstIdx)
    sortedPointLists.append(pointLists(firstIdx))
    while (visited.size < pointLists.size) {
      val nextIdx = (0 until pointLists.size * 2).filterNot(i => visited(i / 2)).minBy(distBetween(firstIdx, _))
      visited.add(nextIdx / 2)
      sortedPointLists.append(
        if (nextIdx % 2 == 0)
          pointLists(nextIdx / 2)
        else
          pointLists(nextIdx / 2).reverse
      )
      firstIdx = nextIdx
    }
    println(f"Sorting ${pointLists.size} paths took ${(System.nanoTime() - begin2) / 1000000.0}%.2f ms")
    joinNearby(sortedPointLists)
  }

  def optimizeOrtools(pointLists: Seq[Seq[Vec2]]): Seq[Seq[Vec2]] = {
    System.loadLibrary("jniortools")
    import com.google.ortools.constraintsolver.RoutingModel
    def distBetween(i: Int, j: Int): Double = {
      if (i == j) return 0
      val a = pointLists(i/2)
      val b = pointLists(j/2)
      val pa = if (i % 2 == 0) a.last else a.head
      val pb = if (j % 2 == 0) b.head else b.last
      val dx = pa.x - pb.x
      val dy = pa.y - pb.y
      math.sqrt(dx*dx + dy*dy)
    }
    val routing = new RoutingModel(pointLists.size * 2, 1, 0)
    routing.setArcCostEvaluatorOfAllVehicles(new NodeEvaluator2 {
      override def run(i: Int, i1: Int): Long = {
        (distBetween(i, i1) * 16).floor.toLong
      }
    })
    for (i <- pointLists.indices) {
      routing.addDisjunction(Array(i * 2, i * 2 + 1))
      routing.nextVar(i * 2).removeValue(i * 2 + 1)
      routing.nextVar(i * 2 + 1).removeValue(i * 2)
    }
    val parameters = RoutingSearchParameters.newBuilder()
      .mergeFrom(RoutingModel.defaultSearchParameters())
      .setSolutionLimit(1)
      .setLogSearch(true)
      .setFirstSolutionStrategy(FirstSolutionStrategy.Value.PATH_CHEAPEST_ARC)
      .build()
    val assignment = routing.solveWithParameters(parameters)
    var node = routing.start(0)
    val route = mutable.Buffer.empty[Long]
    while (!routing.isEnd(node)) {
      route.append(node)
      node = assignment.value(routing.nextVar(node))
    }
    joinNearby(route.map { i =>
      if (i % 2 == 0) pointLists(i.toInt / 2) else pointLists(i.toInt / 2).reverse
    })
  }

  def plan(
    paths: Seq[Seq[Vec2]],
    accel: Double = 8 * fullStepsPerInch,
    vMax: Double = 2 * fullStepsPerInch,
    cornerFactor: Double = 0.005 * fullStepsPerInch
  ): Seq[Plan] = {
    paths.map { path =>
      Planning.constantAccelerationPlan(path, accel, vMax, cornerFactor)
    }
  }

  def plot(ebb: OpenEBB, plannedPaths: Seq[Plan], microsteppingMode: Int = 2): Unit = {
    val supportsLM = ebb.supportsLM()
    val executePlan = if (supportsLM) ebb.executePlan _ else ebb.executePlanWithoutLM _
    var curPos = Vec2(0, 0)

    def moveWithPenUp(from: Vec2, to: Vec2): Unit = {
      val penUpPlan = Planning.constantAccelerationPlan(Seq(from, to), accel = 16 * fullStepsPerInch, vMax = 8 * fullStepsPerInch, cornerFactor = 0 * fullStepsPerInch)
      executePlan(penUpPlan)
    }

    ebb.enableMotors(microsteppingMode)

    ebb.raisePen()
    for (plan <- plannedPaths) {
      moveWithPenUp(from = curPos, to = plan.blocks.head.p1)
      ebb.lowerPen()
      executePlan(plan)
      ebb.raisePen()
      curPos = plan.blocks.last.p2
    }
    moveWithPenUp(from = curPos, to = Vec2(0, 0))
  }

  def penupDist(pointLists: Seq[Seq[Vec2]]): Double = {
    (for (Seq(a, b) <- pointLists.sliding(2)) yield (b.head - a.last).length).sum
  }

  def time(name: String)(f: => Unit): Unit = {
    val start = System.nanoTime()
    f
    println(f"$name took ${(System.nanoTime() - start) / 1000000.0}%.3f ms")
  }

  def main(args: Array[String]): Unit = {
    val pointLists = optimizeOrtools(SVG.readSVG(new File(args.head)))
    println(s"Penup distance: ${penupDist(pointLists)}")
    println(s"Penups: ${pointLists.size - 1}")

    val plans = plan(pointLists)

    EBB.findFirst.open { ebb =>
      if (!ebb.areSteppersPowered()) {
        println("[ERROR] AxiDraw does not appear to have servo power.")
        return
      }
      ebb.configure(penUpPct = 50, penDownPct = 60)

      ebb.enableMotors(microsteppingMode = 5)
      ebb.raisePen()
      ebb.disableMotors()
      println("Pen up and motors disabled, move to home.")
      println("Press [enter] to plot.")
      scala.io.StdIn.readLine()

      plot(ebb, plans)

      ebb.waitUntilMotorsIdle()
      ebb.disableMotors()
    }
  }
}
