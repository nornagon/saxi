import Dependencies._

enablePlugins(JavaAppPackaging)

lazy val root = (project in file(".")).
  settings(
    inThisBuild(List(
      organization := "net.nornagon",
      scalaVersion := "2.12.2",
      version      := "0.1.0-SNAPSHOT"
    )),
    name := "Saxi",
    libraryDependencies ++= Seq(
      scalaTest % Test,
      jSerialComm,
      "org.apache.xmlgraphics" % "batik-parser" % "1.9.1",
      "org.apache.xmlgraphics" % "batik-bridge" % "1.9.1",
      "org.apache.xmlgraphics" % "batik-anim" % "1.9.1",
      "org.apache.xmlgraphics" % "batik-svg-dom" % "1.9.1",
      "org.apache.xmlgraphics" % "batik-gvt" % "1.9.1",
      "com.github.scopt" %% "scopt" % "3.7.0",
      "io.suzaku" %% "boopickle" % "1.2.6",
    ),
    // In classic Java maximalist style, the Batik SVG parser depends on TWO
    // OTHER WHOLE PROGRAMMING LANGUAGES. You can't make this stuff up.
    excludeDependencies ++= Seq(
      ExclusionRule("org.python", "jython"),
      ExclusionRule("org.mozilla", "rhino"),
    )
  )
