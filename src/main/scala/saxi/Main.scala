package saxi

import java.io.File

import saxi.Planning.{Plan, XYMotion}

object Main {
  def scaleToPaper(pointLists: Seq[Seq[Vec2]], paperSize: PaperSize, marginMm: Double): Seq[Seq[Vec2]] = {
    Util.scaleToFit(
      pointLists,
      Vec2(marginMm, marginMm),
      paperSize.size - Vec2(marginMm, marginMm)
    )
  }

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
  case object InfoCommand extends Command
  case object VersionCommand extends Command

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
          .action { case (artFile, c: Config) => c.copy(artFile = artFile) },
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

    cmd("info").action { (_, c) => c.copy(command = InfoCommand) }
      .text("Print info about what would be plotted")
      .children(
        arg[File]("<art.svg>")
          .required()
          .action { case (artFile, c: Config) => c.copy(artFile = artFile) },
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

    cmd("version").text("Print info about EBB version").action { (_, c) => c.copy(command = VersionCommand) }

    checkConfig { c =>
      if (c.command != null) success
      else failure("Must specify a command")
    }
  }

  def main(args: Array[String]): Unit = {
    parser.parse(args, Config()) match {
      case Some(config) =>
        config.command match {
          case PlotCommand => plotCmd(config)
          case InfoCommand => infoCmd(config)
          case VersionCommand => versionCmd()
        }
      case None =>
        // scopt already printed an error message, nothing left to do but quit
    }
  }

  def planFromConfig(config: Config): Plan = {
    val pointLists = Optimization.optimize(SVG.readSVG(config.artFile))

    val scaledPointLists =
      scaleToPaper(pointLists, config.paperSize, marginMm = config.marginMm)
        .map(_.map(_ * config.device.stepsPerMm))

    Planning.plan(scaledPointLists, config.toolingProfile)
  }

  def printInfo(plan: Plan, device: Device): Unit = {
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

  def versionCmd(): Unit = {
    EBB.findFirst match {
      case Some(port) =>
        port.open { ebb => println(ebb.firmwareVersion()) }
      case None =>
        println("[ERROR] Couldn't find a connected EiBotBoard.")
        sys.exit(1)
    }
  }

  def infoCmd(config: Config): Unit = {
    val plan = planFromConfig(config)
    printInfo(plan, config.device)
  }

  def plotCmd(config: Config): Unit = {
    val plan = planFromConfig(config)
    printInfo(plan, config.device)

    EBB.findFirst match {
      case Some(port) =>
        port.open { ebb =>
          if (!ebb.areSteppersPowered()) {
            println("[ERROR] Device does not appear to have servo power.")
            return
          }

          // TODO: do the motors need to be enabled to move the pen?
          ebb.enableMotors(microsteppingMode = 5)
          ebb.raisePen()
          ebb.disableMotors()
          println("Pen up and motors disabled, move to home.")
          println("Press [enter] to plot.")
          io.StdIn.readLine()

          val begin = System.currentTimeMillis()
          ebb.executePlan(plan)
          ebb.waitUntilMotorsIdle()
          println(s"Plot took ${Util.formatDuration((System.currentTimeMillis() - begin) / 1000.0)}")

          ebb.disableMotors()
        }
      case None =>
        println("[ERROR] Couldn't find a connected EiBotBoard.")
        sys.exit(1)
    }

  }
}
