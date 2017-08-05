import Dependencies._

lazy val root = (project in file(".")).
  settings(
    inThisBuild(List(
      organization := "net.nornagon",
      scalaVersion := "2.12.2",
      version      := "0.1.0-SNAPSHOT"
    )),
    name := "Saxi",
    libraryDependencies += scalaTest % Test,
    libraryDependencies += jSerialComm
  )
