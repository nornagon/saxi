package saxi.protocol

object Protocol {
  sealed trait ServerMessage
  case class Pong(msg: String) extends ServerMessage

  sealed trait ClientMessage
  case class Ping(msg: String) extends ClientMessage
  case class Move(angle: Double, distance: Double /* mm */) extends ClientMessage
  case class SetPenHeight(height: Int, rate: Int) extends ClientMessage
  case class DisableMotors() extends ClientMessage
}
