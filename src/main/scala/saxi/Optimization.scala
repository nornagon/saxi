package saxi

import scala.collection.mutable

object Optimization {
  def joinNearby(pointLists: Seq[Seq[Vec2]], tolerance: Double = 0.5): Seq[Seq[Vec2]] = {
    def maybeJoin(a: Seq[Vec2], b: Seq[Vec2]): Seq[Seq[Vec2]] = {
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
    if (pointLists.isEmpty) return pointLists
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
    joinNearby(sortedPointLists)
  }

  /*
  def optimizeOrtools(pointLists: Seq[Seq[Vec2]], timeLimit: Option[Int] = None): Seq[Seq[Vec2]] = {
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
    val parametersBuilder = RoutingSearchParameters.newBuilder()
      .mergeFrom(RoutingModel.defaultSearchParameters())
      .setLogSearch(true)
      .setFirstSolutionStrategy(FirstSolutionStrategy.Value.PATH_CHEAPEST_ARC)
    timeLimit match {
      case Some(lim) => parametersBuilder.setTimeLimitMs(lim)
      case None => parametersBuilder.setSolutionLimit(1)
    }
    val parameters = parametersBuilder.build()
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
  */

  def penupDist(pointLists: Seq[Seq[Vec2]]): Double = {
    (for (Seq(a, b) <- pointLists.sliding(2)) yield (b.head - a.last).length).sum
  }

  def evaluate(pointLists: Seq[Seq[Vec2]]): Unit = {
    println(s"Penup distance: ${penupDist(pointLists)}")
    println(s"Penups: ${pointLists.size - 1}")
  }
}
