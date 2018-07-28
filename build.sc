import mill._, scalalib._

trait CommonModule extends ScalaModule {
  def scalaVersion = "2.12.4"
}

object util extends CommonModule {
}

object svg extends CommonModule {
  override def moduleDeps = Seq(util)
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

object planning extends CommonModule {
  override def moduleDeps = Seq(util)
}

object driver extends CommonModule {
  override def moduleDeps = Seq(util, planning)
  override def ivyDeps = Agg(
    ivy"com.fazecast:jSerialComm:1.3.11",
  )
}

object server extends CommonModule {
  override def moduleDeps = Seq(driver, planning)
  override def ivyDeps = Agg(
    ivy"com.typesafe.akka::akka-http:10.0.11",
    ivy"com.typesafe.akka::akka-stream:2.5.8",
    ivy"io.suzaku::boopickle:1.2.6",
  )
  override def mainClass = Some("saxi.server.Main")
}

object cli extends CommonModule {
  override def moduleDeps = Seq(util, driver, svg, planning)
  override def ivyDeps = Agg(
    ivy"com.github.scopt::scopt:3.7.0",
    ivy"com.typesafe.akka::akka-http-core:10.0.11",
    ivy"io.suzaku::boopickle:1.2.6",
  )
}
