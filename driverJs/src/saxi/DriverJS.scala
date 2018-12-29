package saxi

import java.nio.ByteBuffer

import scala.scalajs.js.annotation._
import scala.scalajs.js
import org.scalajs.dom.raw.{ErrorEvent, MessageEvent, WebSocket}
import org.scalajs.dom
import saxi.protocol.Protocol
import saxi.protocol.Protocol.ServerMessage

import scala.scalajs.js.typedarray.TypedArrayBufferOps._
import js.JSConverters._
import scala.scalajs.js.typedarray.{ArrayBuffer, TypedArrayBuffer}

@JSExportTopLevel("Driver")
@JSExportAll
object DriverJS {
  import boopickle.Default._
  def pickleTp(tp: ToolingProfile) = Pickle.intoBytes(tp)
  def picklePlan(plan: Planning.Plan) = Pickle.intoBytes(plan).dataView()

  @JSExport
  def connect(): Driver = {
    val ws = new WebSocket(s"ws://${dom.document.location.host}/chat")
    val d = new Driver(ws)
    ws.binaryType = "arraybuffer"
    ws.addEventListener("message", (e: MessageEvent) => {
      e.data match {
        case str: String => println(s"""WebSocket message: "$str"""")
        case buff: ArrayBuffer =>
          val bytes: ByteBuffer = TypedArrayBuffer.wrap(buff)
          import boopickle.Default._
          val msg = Unpickle[ServerMessage].fromBytes(bytes)
          msg match {
            case Protocol.Pong(data) =>
            case Protocol.Progress(i) =>
              if (d.onprogress != null) d.onprogress(i)
            case Protocol.Cancelled() =>
              if (d.oncancelled != null) d.oncancelled()
            case Protocol.Finished() =>
              if (d.oncancelled != null) d.oncancelled()
            case other =>
              println(s"Unknown message from server: $other")
          }
      }
    })
    ws.addEventListener("error", (e: ErrorEvent) => {
      // TODO: something
    })
    js.timers.setInterval(30000) { d.ping() }
    d
  }
}


@JSExportAll
class Driver(connection: WebSocket) {
  var onprogress: js.Function1[Int, Unit] = _
  var oncancelled: js.Function0[Unit] = _
  var onfinished: js.Function0[Unit] = _
  def setPenHeight(height: Int, rate: Int): Unit = {
    send(Protocol.SetPenHeight(height, rate))
  }

  def limp(): Unit = {
    send(Protocol.DisableMotors())
  }

  def ping(): Unit = {
    send(Protocol.Ping(""))
  }

  private def send(msg: Protocol.ClientMessage): Unit = {
    import boopickle.Default._
    connection.send(bytes2message(Pickle.intoBytes[Protocol.ClientMessage](msg)))
  }

  private def bytes2message(data: ByteBuffer): ArrayBuffer = {
    if (data.hasTypedArray()) {
      data.typedArray().subarray(data.position, data.limit).asInstanceOf[ArrayBuffer]
    } else {
      val tempBuffer = ByteBuffer.allocateDirect(data.remaining)
      val origPosition = data.position
      tempBuffer.put(data)
      data.position(origPosition)
      tempBuffer.typedArray().buffer
    }
  }
}
