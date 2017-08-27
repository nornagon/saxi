import Dependencies._

lazy val root = (project in file(".")).
  settings(
    inThisBuild(List(
      organization := "net.nornagon",
      scalaVersion := "2.12.2",
      version      := "0.1.0-SNAPSHOT"
    )),
    name := "Saxi",
    //javaOptions in run += "-Djava.library.path=lib/native",
    //fork in run := true,
    libraryDependencies ++= Seq(
      scalaTest % Test,
      jSerialComm,
      "org.apache.xmlgraphics" % "batik-parser" % "1.9",
      "com.github.scopt" %% "scopt" % "3.7.0"
    )
  )
