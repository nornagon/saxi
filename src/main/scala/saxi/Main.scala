package saxi

import java.io.{File, FileInputStream}
import java.nio.ByteBuffer
import java.nio.file.Files

import saxi.Planning.{Plan, XYMotion}

object Main {
  // "WxHin", "W x H mm" and friends
  private val paperSizeString = "(\\d+(?:\\.\\d+)?)\\s*x\\s*(\\d+(?:\\.\\d+)?)\\s*(in|mm|cm)".r
  private val lengthString = "(\\d+(?:\\.\\d+)?)\\s*(in|mm|cm)".r
  private def mmPer(unit: String): Double = unit match {
    case "in" => 25.4
    case "cm" => 10
    case "mm" => 1
  }

  implicit val paperReader: scopt.Read[PaperSize] = scopt.Read.reads { s =>
    PaperSize.byName.get(s) match {
      case Some(paperSize) => paperSize.landscape
      case None => s match {
        case paperSizeString(width, height, unit) =>
          PaperSize(Vec2(width.toDouble, height.toDouble) * mmPer(unit))
        case _ =>
          throw new IllegalArgumentException(
            s"I didn't understand '$s' as a paper size. Try something like '11x8.5in' or 'A4'.")
      }
    }
  }

  case class Length(lengthMm: Double)

  implicit val lengthReader: scopt.Read[Length] = scopt.Read.reads {
    case lengthString(length, unit) => Length(length.toDouble * mmPer(unit))
    case s => throw new IllegalArgumentException(
      s"I didn't understand '$s' as a length. Try something like '20mm' or '0.5in'.")
  }

  trait Command
  case object PlotCommand extends Command
  case object PlanCommand extends Command
  case object InfoCommand extends Command
  case object VersionCommand extends Command
  case object LimpCommand extends Command

  case class Config(
    command: Command = null,
    artFile: File = null,
    paperSize: PaperSize = null,
    marginMm: Double = 20,
    toolingProfile: ToolingProfile = ToolingProfile.AxidrawFast,
    device: Device = Device.Axidraw,
  )
  val parser = new scopt.OptionParser[Config](programName = "saxi") {
    head("saxi", "0.9")

    cmd("plot").action { (_, c) => c.copy(command = PlotCommand) }
      .text("Plot an SVG file")
      .children(
        arg[File]("<art.svg>")
          .required()
          .action { (artFile, c) => c.copy(artFile = artFile) },
        opt[PaperSize]('s', "paper-size")
          .required()
          .valueName(s"<WxHmm|WxHin|${PaperSize.byName.keys.mkString("|")}>")
          .text(s"Either WxH{in,cm,mm} or a standard size. Supported sizes: ${PaperSize.supported}.")
          .action { (ps, c) => c.copy(paperSize = ps) },
        opt[Unit]("portrait")
          .text("If present, the paper has its short side in the X direction. Will not flip the drawing. Defaults to landscape.")
          .action { (_, c) => c.copy(paperSize = c.paperSize.portrait) },
        opt[Length]('m', "margin")
          .valueName("<Xmm|Xin>")
          .text("Margin to leave at paper edge. Defaults to 20mm.")
          .action { (m, c) => c.copy(marginMm = m.lengthMm) },
        opt[Double]("pen-up")
          .valueName("<PenUp%>")
          .text("% of servo range for pen up height")
          .action { (p, c) => c.copy(toolingProfile = c.toolingProfile.copy(penUpPos = c.device.penPctToPos(p))) },
        opt[Double]("pen-down")
          .valueName("<PenDown%>")
          .text("% of servo range for pen down height")
          .action { (p, c) => c.copy(toolingProfile = c.toolingProfile.copy(penDownPos = c.device.penPctToPos(p))) }
      )

    cmd("info").action { (_, c) => c.copy(command = InfoCommand) }
      .text("Print info about what would be plotted")
      .children(
        arg[File]("<art.svg>")
          .required()
          .action { (artFile, c) => c.copy(artFile = artFile) },
        opt[PaperSize]('s', "paper-size")
          .required()
          .valueName(s"<WxHmm|WxHin|${PaperSize.byName.keys.mkString("|")}>")
          .text(s"Either WxH{in,cm,mm} or a standard size. Supported sizes: ${PaperSize.supported}.")
          .action { (ps, c) => c.copy(paperSize = ps) },
        opt[Unit]("portrait")
          .text("If present, the paper has its short side in the X direction. Will not flip the drawing. Defaults to landscape.")
          .action { (_, c) => c.copy(paperSize = c.paperSize.portrait) },
        opt[Length]('m', "margin")
          .valueName("<Xmm|Xin>")
          .text("Margin to leave at paper edge. Defaults to 20mm.")
          .action { (m, c) => c.copy(marginMm = m.lengthMm) },
      )

    cmd("plan").action { (_, c) => c.copy(command = PlanCommand) }
      .text("Plot an SVG file")
      .children(
        arg[File]("<art.svg>")
          .required()
          .action { (artFile, c) => c.copy(artFile = artFile) },
        opt[PaperSize]('s', "paper-size")
          .required()
          .valueName(s"<WxHmm|WxHin|${PaperSize.byName.keys.mkString("|")}>")
          .text(s"Either WxH{in,cm,mm} or a standard size. Supported sizes: ${PaperSize.supported}.")
          .action { (ps, c) => c.copy(paperSize = ps) },
        opt[Unit]("portrait")
          .text("If present, the paper has its short side in the X direction. Will not flip the drawing. Defaults to landscape.")
          .action { (_, c) => c.copy(paperSize = c.paperSize.portrait) },
        opt[Length]('m', "margin")
          .valueName("<Xmm|Xin>")
          .text("Margin to leave at paper edge. Defaults to 20mm.")
          .action { (m, c) => c.copy(marginMm = m.lengthMm) }
      )

    cmd("version").text("Print info about EBB version").action { (_, c) => c.copy(command = VersionCommand) }

    cmd("limp").text("Disable the stepper motors").action { (_, c) => c.copy(command = LimpCommand) }

    checkConfig { c =>
      if (c.command != null) success
      else failure("Must specify a command")
    }
  }

  def main(args: Array[String]): Unit = {
    System.setProperty("java.awt.headless", "true")
    parser.parse(args, Config()) match {
      case Some(config) =>
        config.command match {
          case PlotCommand => plotCmd(config)
          case PlanCommand => planCmd(config)
          case InfoCommand => infoCmd(config)
          case VersionCommand => versionCmd()
          case LimpCommand => limpCmd()
        }
      case None =>
        // scopt already printed an error message, nothing left to do but quit
    }
  }

  def planFromConfig(config: Config): Plan = {
    val firstByte = new FileInputStream(config.artFile).read()
    if (firstByte == '<') {
      val lines = SVG.readSVG(config.artFile)
      println(f"Planning ${lines.size} lines...")
      val pointLists = Optimization.optimize(lines)
      if (pointLists.isEmpty) {
        return Plan(Seq.empty)
      }

      val scaledPointLists =
        Util.scaleToPaper(pointLists, config.paperSize, marginMm = config.marginMm)
          .map(_.map(_ * config.device.stepsPerMm))

      Planning.plan(scaledPointLists, config.toolingProfile)
    } else {
      import boopickle.Default._
      val bytes = Files.readAllBytes(config.artFile.toPath)
      Unpickle[Planning.Plan].fromBytes(ByteBuffer.wrap(bytes))
    }
  }

  def printInfo(plan: Plan, device: Device): Unit = {
    if (plan.motions.isEmpty) {
      println(f"Empty plan")
      return
    }
    println(f"Estimated duration: ${Util.formatDuration(plan.duration)}")

    // The first motion is from (0,0) to the first point of the first pen-down motion; the last motion is from the last
    // point of the last pen-down motion to (0,0). Both happen with the pen up.
    val penDownMotions = plan.motions.slice(1, plan.motions.size - 2)
      .collect { case p: XYMotion => p.blocks.flatMap(b => Seq(b.p1, b.p2)) }
    val (min, max) = Util.extent(penDownMotions)
    println(
      f"""|Drawing bounds:
          |  ${min.x / device.stepsPerMm}%.2f - ${max.x / device.stepsPerMm}%.2f mm in X
          |  ${min.y / device.stepsPerMm}%.2f - ${max.y / device.stepsPerMm}%.2f mm in Y""".stripMargin)
  }

  def withFirstEBB(f: OpenEBB => Unit): Unit = {
    EBB.findFirst match {
      case Some(port) =>
        port.open(f)
      case None =>
        println("[ERROR] Couldn't find a connected EiBotBoard.")
        sys.exit(1)
    }
  }

  def versionCmd(): Unit = withFirstEBB { ebb => println(ebb.firmwareVersion()) }

  def limpCmd(): Unit = withFirstEBB(_.disableMotors())

  def infoCmd(config: Config): Unit = {
    val plan = planFromConfig(config)
    printInfo(plan, config.device)
  }

  def planCmd(config: Config): Unit = {
    val plan = planFromConfig(config)
    printInfo(plan, config.device)
    import boopickle.Default._
    val planBytes = Pickle.intoBytes(plan)
    val planPath = config.artFile.toPath.resolveSibling(s"${config.artFile.getName}.plan")
    Files.write(planPath, planBytes.array())
    println(s"Plan written to $planPath")
  }

  def plotCmd(config: Config): Unit = {
    val plan = planFromConfig(config)
    printInfo(plan, config.device)

    withFirstEBB { ebb =>
      if (!ebb.areSteppersPowered()) {
        println("[ERROR] Device does not appear to have servo power.")
        sys.exit(1)
      }

      // TODO: do the motors need to be enabled to move the pen?
      ebb.enableMotors(microsteppingMode = 5)
      ebb.setPenHeight(config.toolingProfile.penUpPos, 10)
      ebb.disableMotors()
      println("Pen up and motors disabled, move to home.")
      println("Press [enter] to plot.")
      scala.io.StdIn.readLine()

      val begin = System.currentTimeMillis()
      ebb.executePlan(plan)
      ebb.waitUntilMotorsIdle()
      println(s"Plot took ${Util.formatDuration((System.currentTimeMillis() - begin) / 1000.0)}")

      ebb.disableMotors()
    }
  }
}
