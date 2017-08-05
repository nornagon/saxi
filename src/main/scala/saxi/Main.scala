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
      println(s"Version: ${ebb.query("V")}")
      val Array(ra0Voltage, vPlusVoltage) = ebb.queryM("QC").head.split(",")
      println(f"RA0: ${ra0Voltage.toInt / 1023.0 * 3.3}%.2f V")
      println(f" V+: ${vPlusVoltage.toInt / 1023.0 * 3.3}%.2f V")
      println(f"Vin: ${vPlusVoltage.toInt / 1023.0 * 3.3 * 9.2 + 0.3}%.2f V (approx)")
      if (vPlusVoltage.toInt < 200) {
        println("[ERROR] AxiDraw does not appear to have servo power.")
        return
      }
      println(s"Pen is ${if (ebb.queryM("QP").head == "1") "up" else "down"}")
      println(ebb.queryM("QS"))

      ebb.command(s"EM,$microsteppingMode,$microsteppingMode")
      ebb.command("SP,0,2000")

      plot(ebb, Seq(plan), stepsPerInch)

      Iterator.continually(ebb.query("QM")).find(_.split(",") match {
        case Array("QM", commandStatus, motor1Status, motor2Status, fifoStatus) =>
          commandStatus == "0" && fifoStatus == "0"
      })
      ebb.command("EM,0,0")
    }
  }

  def plot(ebb: OpenEBB, plannedPaths: Seq[Plan], stepsPerUnit: Double): Unit = {
    var curPos = Vec2(0, 0)
    ebb.command("SP,0,400")
    for (plan <- plannedPaths) {
      val penUpPlan = Planning.constantAccelerationPlan(Seq(curPos, plan.blocks.head.p1), accel = 16, vMax = 8, cornerFactor = 0)
      ebb.executePlan(penUpPlan, stepsPerUnit = stepsPerInch)
      ebb.command("SP,1,400")
      ebb.executePlan(plan, stepsPerUnit)
      ebb.command("SP,0,400")
      curPos = plan.blocks.last.p2
    }
    val penUpPlan = Planning.constantAccelerationPlan(Seq(curPos, Vec2(0, 0)), accel = 16, vMax = 8, cornerFactor = 0)
    ebb.executePlan(penUpPlan, stepsPerUnit = stepsPerInch)
  }
}
