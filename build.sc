import ammonite.ops
import mill._
import scalalib._
import scalajslib._
import ammonite.ops._

trait CommonModule extends ScalaModule {
  def scalaVersion = "2.12.4"
}

object util extends Module {
  def utilSourcePath = millSourcePath
  object js extends CommonModule with ScalaJSModule {
    override def millSourcePath = utilSourcePath
    def scalaJSVersion = "0.6.24"

    override def sources = T.sources(
      millSourcePath / "src",
      millSourcePath / "src-js",
    )
  }
  object jvm extends CommonModule {
    override def millSourcePath = utilSourcePath
    override def compileIvyDeps = Agg(
      ivy"org.scala-js::scalajs-stubs:0.6.24"
    )

    override def sources = T.sources(
      millSourcePath / "src",
      millSourcePath / "src-jvm",
    )
  }
}

object svg extends CommonModule {
  override def moduleDeps = Seq(util.jvm)
  override def ivyDeps = Agg(
    ivy"org.apache.xmlgraphics:batik-parser:1.9.1",
    ivy"org.apache.xmlgraphics:batik-bridge:1.9.1",
    ivy"org.apache.xmlgraphics:batik-anim:1.9.1",
    ivy"org.apache.xmlgraphics:batik-svg-dom:1.9.1",
    ivy"org.apache.xmlgraphics:batik-gvt:1.9.1",
  )
    // In classic Java maximalist style, the Batik SVG parser depends on TWO
    // OTHER WHOLE PROGRAMMING LANGUAGES. You can't make this stuff up.
    .map(_.exclude(("org.python", "jython"), ("org.mozilla", "rhino")))
}

object planning extends Module {
  def planningSourcePath = millSourcePath

  object js extends CommonModule with ScalaJSModule {
    override def millSourcePath = planningSourcePath
    def scalaJSVersion = "0.6.24"

    override def moduleDeps = Seq(util.js)

    override def sources = T.sources(
      millSourcePath / "src",
      millSourcePath / "src-js",
    )
  }
  object jvm extends CommonModule {
    override def millSourcePath = planningSourcePath

    override def moduleDeps = Seq(util.jvm)
    override def compileIvyDeps = Agg(
      ivy"org.scala-js::scalajs-stubs:0.6.24"
    )

    override def sources = T.sources(
      millSourcePath / "src",
      millSourcePath / "src-jvm",
    )
  }
}

object driver extends CommonModule {
  override def moduleDeps = Seq(util.jvm, planning.jvm)
  override def ivyDeps = Agg(
    ivy"com.fazecast:jSerialComm:1.3.11",
  )
}

object driverJs extends CommonModule with ScalaJSModule {
  def scalaJSVersion = "0.6.24"
  override def moduleDeps = Seq(planning.js, protocol.js)
  override def ivyDeps = Agg(
    ivy"io.suzaku::boopickle::1.2.6",
    ivy"org.scala-js::scalajs-dom::0.9.2",
  )
}

object protocol extends Module {
  def protocolSourcePath = millSourcePath

  object js extends CommonModule with ScalaJSModule {
    override def millSourcePath = protocolSourcePath
    def scalaJSVersion = "0.6.24"

    override def sources = T.sources(
      millSourcePath / "src",
      millSourcePath / "src-js",
    )
  }
  object jvm extends CommonModule {
    override def millSourcePath = protocolSourcePath

    override def sources = T.sources(
      millSourcePath / "src",
      millSourcePath / "src-jvm",
    )
  }
}

object server extends CommonModule {
  override def moduleDeps = Seq(driver, protocol.jvm, planning.jvm)
  override def ivyDeps = Agg(
    ivy"com.typesafe.akka::akka-http:10.0.11",
    ivy"com.typesafe.akka::akka-stream:2.5.8",
    ivy"io.suzaku::boopickle:1.2.6",
  )
  def extraSources = T.sources { ui.bundle() }
  def jsResources = T {
    val outPath = T.ctx().dest / 'js
    mkdir(outPath)
    cp(
      driverJs.fullOpt().path,
      outPath / "driver.js"
    )
    extraSources().foreach(s => cp(s.path, outPath / s.path.last))
    outPath
  }
  override def resources = T.sources(
    millSourcePath / 'resources,
    jsResources() / RelPath.up
  )
  override def mainClass = Some("saxi.server.Main")
}

trait WebpackModule extends mill.Module {
  def javascriptSourceRoot = T.sources { millSourcePath / "src" }
  def allJSSources = T { javascriptSourceRoot().flatMap(p => os.walk(p.path)).map(PathRef(_)) }
  def bundle = T {
    println(allJSSources())
    ops.%%("npm", "install")(millSourcePath)
    val webpackData = ops.%%("npx", "webpack", "--json")(millSourcePath)
    val wp = ujson.read(webpackData.out.string)
    val outputDir = Path(wp("outputPath").str)
    val assets = wp("assets").arr.map(outputDir / _.obj("name").str)
    assets.map(PathRef(_))
  }
}

object ui extends WebpackModule {

}

object cli extends CommonModule {
  override def moduleDeps = Seq(util.jvm, driver, svg, planning.jvm)
  override def ivyDeps = Agg(
    ivy"com.github.scopt::scopt:3.7.0",
    ivy"com.typesafe.akka::akka-http-core:10.0.11",
    ivy"io.suzaku::boopickle:1.2.6",
  )
}
