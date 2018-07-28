import Dependencies._

lazy val root = (project in file(".")).
  settings(
    inThisBuild(List(
      organization := "net.nornagon",
      scalaVersion := "2.12.2",
      version      := "0.1.0-SNAPSHOT"
    )),
    name := "Saxi",
  )

lazy val core = (project in file("core")).
  settings(
    libraryDependencies ++= Seq(
      scalaTest % Test,
      jSerialComm,
      "org.apache.xmlgraphics" % "batik-parser" % "1.9.1",
      "org.apache.xmlgraphics" % "batik-bridge" % "1.9.1",
      "org.apache.xmlgraphics" % "batik-anim" % "1.9.1",
      "org.apache.xmlgraphics" % "batik-svg-dom" % "1.9.1",
      "org.apache.xmlgraphics" % "batik-gvt" % "1.9.1",
    ),
    // In classic Java maximalist style, the Batik SVG parser depends on TWO
    // OTHER WHOLE PROGRAMMING LANGUAGES. You can't make this stuff up.
    excludeDependencies ++= Seq(
      ExclusionRule("org.python", "jython"),
      ExclusionRule("org.mozilla", "rhino"),
    ),
  )

lazy val cli = (project in file("cli")).
  settings(
    libraryDependencies ++= Seq(
      "com.github.scopt" %% "scopt" % "3.7.0",
      "io.suzaku" %% "boopickle" % "1.2.6",
      "com.typesafe.akka" %% "akka-http-core" % "10.0.11",
    ),
  )
  .enablePlugins(JavaAppPackaging)
  .dependsOn(core)

lazy val server = (project in file("server")).
  settings(
    libraryDependencies ++= Seq(
      "com.typesafe.akka" %% "akka-http" % "10.0.11",
      "com.typesafe.akka" %% "akka-stream" % "2.5.8",
      "io.suzaku" %% "boopickle" % "1.2.6",
    )
  )
  .enablePlugins(JavaAppPackaging)
  .dependsOn(core)
