package saxi

import java.io.File

object Main {
  def main(args: Array[String]): Unit = {
    val pointLists = Optimization.optimize(SVG.readSVG(new File(args.head)))
    val plans = Planning.plan(pointLists, ToolingProfile.AxidrawFast)

    EBB.findFirst.open { ebb =>
      if (!ebb.areSteppersPowered()) {
        println("[ERROR] Device does not appear to have servo power.")
        return
      }
      ebb.configure(penUpPct = 50, penDownPct = 60)

      ebb.enableMotors(microsteppingMode = 5)
      ebb.raisePen()
      ebb.disableMotors()
      println("Pen up and motors disabled, move to home.")
      println("Press [enter] to plot.")
      io.StdIn.readLine()

      ebb.plot(plans)

      ebb.waitUntilMotorsIdle()
      ebb.disableMotors()
    }
  }
}
