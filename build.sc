import mill._, scalalib._

trait CommonModule extends ScalaModule {
  def scalaVersion = "2.12.4"
}

object core extends CommonModule {
  override def ivyDeps = Agg(
    ivy"com.fazecast:jSerialComm:1.3.11",
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

object server extends CommonModule {
  override def moduleDeps = Seq(core)
  override def ivyDeps = Agg(
    ivy"com.typesafe.akka::akka-http:10.0.11",
    ivy"com.typesafe.akka::akka-stream:2.5.8",
    ivy"io.suzaku::boopickle:1.2.6",
  )
  override def mainClass = Some("saxi.server.Main")
}

object cli extends CommonModule {
  override def moduleDeps = Seq(core)
  override def ivyDeps = Agg(
    ivy"com.github.scopt::scopt:3.7.0",
    ivy"com.typesafe.akka::akka-http-core:10.0.11",
    ivy"io.suzaku::boopickle:1.2.6",
  )
}

def launcherScript(mainClass: String, shellClassPath: Agg[String], cmdClassPath: Agg[String]) = {
  mill.modules.Jvm.universalScript(
    shellCommands =
      s"""exec java $$JAVA_OPTS -cp "${shellClassPath.mkString(":")}" $mainClass "$$@"""",
    cmdCommands =
      s"""java %JAVA_OPTS% -cp "${cmdClassPath.mkString(";")}" $mainClass %*"""
  )
}

