package saxi

import java.io.File

object Main {
  def scaleToPaper(pointLists: Seq[Seq[Vec2]], paperSize: PaperSize, marginMm: Double): Seq[Seq[Vec2]] = {
    Util.scaleToFit(
      pointLists,
      Vec2(marginMm, marginMm),
      paperSize.size - Vec2(marginMm, marginMm)
    )
  }

  // "WxHin", "W x H mm" and friends
  private val paperSizeString = raw"(\\d+(?:\\.\\d+)?)\\s*x\\s*(\\d+(?:\\.\\d+)?)\\s*(in|mm|cm)".r
  private val lengthString = raw"(\\d+(?:\\.\\d+)?)\\s*(in|mm|cm)".r
  private def mmPer(unit: String): Double = unit match {
    case "in" => 25.4
    case "cm" => 10
    case "mm" => 1
  }

  implicit val paperReader: scopt.Read[PaperSize] = scopt.Read.reads { s =>
    PaperSize.byName.get(s) match {
      case Some(paperSize) => paperSize
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

  case class Config(
    command: Command = null,
    artFile: File = null,
    paperSize: PaperSize = null,
    paperIsPortrait: Boolean = false,
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
          .text("If present, the paper has its short side in the X direction. Will not flip the drawing.")
          .action { (_, c) => c.copy(paperIsPortrait = true) },
        opt[Length]('m', "margin")
          .valueName("<Xmm|Xin>")
          .text("Margin to leave at paper edge. Defaults to 20mm.")
          .action { (m, c) => c.copy(marginMm = m.lengthMm) },
      )

    checkConfig { c =>
      if (c.command != null) success
      else failure("Must specify a command")
    }
  }

  def main(args: Array[String]): Unit = {
    parser.parse(args, Config()) match {
      case Some(config) if config.command == PlotCommand =>
        plotCmd(config)
      case None =>
        // bad args, error message was displayed
    }
  }

  def plotCmd(config: Config): Unit = {
    val pointLists = Optimization.optimize(SVG.readSVG(config.artFile))

    val paperSize =
      if (config.paperIsPortrait) config.paperSize.flipped
      else config.paperSize

    val scaledPointLists = scaleToPaper(pointLists, paperSize, marginMm = config.marginMm).map {
      _.map(_ * config.device.stepsPerMm)
    }

    val plans = Planning.plan(scaledPointLists, config.toolingProfile)

    println(s"Planned ${pointLists.map(_.size).sum} points with ${plans.map(_.blocks.size).sum} blocks")
    // TODO: Estimate total time, incl. pen-up moves
    println(f"Estimated pen-down time: ${Util.formatDuration(plans.map(_.tMax).sum)}")
    val (min, max) = Util.extent(scaledPointLists)
    println("Drawing bounds, from the current location of the pen:")
    println(
      f"  ${min.x / config.device.stepsPerMm}%.2f - ${max.x / config.device.stepsPerMm}%.2f mm in X\n" +
      f"  ${min.y / config.device.stepsPerMm}%.2f - ${max.y / config.device.stepsPerMm}%.2f mm in Y")

    EBB.findFirst match {
      case Some(port) =>
        port.open { ebb =>
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
      case None =>
        println("[ERR] Couldn't find a connected EiBotBoard.")
        sys.exit(1)
    }

  }
}
