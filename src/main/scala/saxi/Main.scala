package saxi

import saxi.Planning.Plan

object Main {
  // 5 = full step mode, 4 = 1/2 step mode
  val microsteppingMode: Int = 2
  val stepDivider: Int = 1 << (microsteppingMode - 1)
  val stepsPerInch: Int = 2032 / stepDivider
  val stepsPerMm: Int = 80 / stepDivider

  def main(args: Array[String]): Unit = {

    val nPoints = 128
    val d = 0.1
    val points = (0 to nPoints) map { i =>
      Vec2(math.cos(i * 2*math.Pi/nPoints), math.sin(i * 2*math.Pi/nPoints)) * d
    }

    val plan = Planning.constantAccelerationPlan(points, accel = 8, vMax = 2, cornerFactor = 0.005)

    EBB.findFirst.open { ebb =>
      if (!ebb.areSteppersPowered()) {
        println("[ERROR] AxiDraw does not appear to have servo power.")
        return
      }

      ebb.enableMotors(microsteppingMode)
      ebb.raisePen(2000)

      plot(ebb, Seq(plan), stepsPerInch)

      ebb.waitUntilMotorsIdle()
      ebb.disableMotors()
    }
  }

  def plot(ebb: OpenEBB, plannedPaths: Seq[Plan], stepsPerUnit: Double): Unit = {
    val supportsLM = ebb.supportsLM()
    val executePlan = if (supportsLM) ebb.executePlan _ else ebb.executePlanWithoutLM _
    var curPos = Vec2(0, 0)

    def moveWithPenUp(from: Vec2, to: Vec2): Unit = {
      val penUpPlan = Planning.constantAccelerationPlan(Seq(from, to), accel = 16, vMax = 8, cornerFactor = 0)
      executePlan(penUpPlan, stepsPerInch)
    }

    ebb.raisePen(400)
    for (plan <- plannedPaths) {
      moveWithPenUp(from = curPos, to = plan.blocks.head.p1)
      ebb.lowerPen(400)
      executePlan(plan, stepsPerUnit)
      ebb.raisePen(400)
      curPos = plan.blocks.last.p2
    }
    moveWithPenUp(from = curPos, to = Vec2(0, 0))
  }
}
