package saxi

import java.io.File
import javax.xml.parsers.SAXParserFactory

import org.apache.batik.parser.{DefaultTransformListHandler, PathHandler, TransformListHandler}
import org.xml.sax.Attributes
import org.xml.sax.helpers.DefaultHandler

import scala.collection.mutable

object SVG {
  trait PathElement
  case class PolyLine(var points: Seq[Vec2]) extends PathElement

  class MyPathHandler extends PathHandler {
    var currentPos = Vec2(0, 0)
    var currentElem: Option[PathElement] = None
    val pathElems: mutable.ArrayBuffer[PathElement] = mutable.ArrayBuffer.empty[PathElement]
    override def startPath(): Unit = {
      currentPos = Vec2(0, 0)
    }

    override def endPath(): Unit = {}

    override def linetoAbs(x: Float, y: Float): Unit = {
      currentElem match {
        case Some(pl: PolyLine) => pl.points :+= Vec2(x, y)
        case _ =>
          val pl = PolyLine(Seq(currentPos, Vec2(x, y)))
          pathElems.append(pl)
          currentElem = Some(pl)
      }
    }

    override def movetoAbs(x: Float, y: Float): Unit = {
      currentPos = Vec2(x, y)
      currentElem = None
    }

    override def closePath(): Unit = {
      currentElem match {
        case Some(p: PolyLine) =>
          p.points :+= p.points.head
        case _ => ???
      }
    }

    // rest ???
    override def curvetoCubicRel(x1: Float, y1: Float, x2: Float, y2: Float, x: Float, y: Float): Unit = ???
    override def curvetoQuadraticAbs(x1: Float, y1: Float, x: Float, y: Float): Unit = ???
    override def linetoVerticalAbs(y: Float): Unit = ???
    override def curvetoCubicSmoothRel(x2: Float, y2: Float, x: Float, y: Float): Unit = ???
    override def curvetoQuadraticSmoothAbs(x: Float, y: Float): Unit = ???
    override def arcRel(
      rx: Float,
      ry: Float,
      xAxisRotation: Float,
      largeArcFlag: Boolean,
      sweepFlag: Boolean,
      x: Float,
      y: Float
    ): Unit = ???
    override def linetoHorizontalAbs(x: Float): Unit = ???
    override def curvetoCubicAbs(x1: Float, y1: Float, x2: Float, y2: Float, x: Float, y: Float): Unit = ???
    override def curvetoQuadraticRel(x1: Float, y1: Float, x: Float, y: Float): Unit = ???
    override def linetoHorizontalRel(x: Float): Unit = ???
    override def curvetoQuadraticSmoothRel(x: Float, y: Float): Unit = ???
    override def linetoVerticalRel(y: Float): Unit = ???
    override def movetoRel(x: Float, y: Float): Unit = ???
    override def arcAbs(
      rx: Float,
      ry: Float,
      xAxisRotation: Float,
      largeArcFlag: Boolean,
      sweepFlag: Boolean,
      x: Float,
      y: Float
    ): Unit = ???
    override def curvetoCubicSmoothAbs(x2: Float, y2: Float, x: Float, y: Float): Unit = ???
    override def linetoRel(x: Float, y: Float): Unit = ???
  }

  class MyTransformHandler extends TransformListHandler {
    var transform: Mat33 = Mat33.identity
    override def startTransformList(): Unit = {
      transform = Mat33.identity
    }
    override def endTransformList(): Unit = {}

    override def rotate(theta: Float): Unit = transform *= Mat33.rotate(theta)
    override def rotate(theta: Float, cx: Float, cy: Float): Unit = ???

    override def translate(tx: Float): Unit = transform *= Mat33.translate(Vec2(tx, 0))
    override def translate(tx: Float, ty: Float): Unit = transform *= Mat33.translate(Vec2(tx, ty))

    override def scale(sx: Float): Unit = transform *= Mat33.scale(sx, sx)
    override def scale(sx: Float, sy: Float): Unit = transform *= Mat33.scale(sx, sy)

    override def matrix(a: Float, b: Float, c: Float, d: Float, e: Float, f: Float): Unit =
      transform *= Mat33(a, c, e, b, d, f, 0, 0, 1)


    override def skewX(skx: Float): Unit = ???
    override def skewY(sky: Float): Unit = ???
  }

  def readSVG(f: File): Seq[Seq[Vec2]] = {
    val factory = SAXParserFactory.newInstance()
    val parser = factory.newSAXParser()
    val pathParser = new org.apache.batik.parser.PathParser()
    val transformParser = new org.apache.batik.parser.TransformListParser()
    var transformStack = List(Mat33.identity)

    val paths = mutable.ArrayBuffer.empty[Seq[Vec2]]

    parser.parse(f, new DefaultHandler {
      override def startElement(
        uri: String,
        localName: String,
        qName: String,
        attributes: Attributes
      ): Unit = {
        qName match {
          case "path" =>
            val handler = new MyPathHandler
            pathParser.setPathHandler(handler)
            pathParser.parse(attributes.getValue("d"))
            handler.pathElems.foreach {
              case PolyLine(points) => paths.append(points.map(transformStack.head * _))
            }
          case "g" =>
            val handler = new MyTransformHandler
            transformParser.setTransformListHandler(handler)
            val transformList = attributes.getValue("transform")
            if (transformList != null) {
              transformParser.parse(transformList)
            }
            transformStack = (handler.transform * transformStack.head) :: transformStack
          case _ =>
        }
      }

      override def endElement(
        uri: String,
        localName: String,
        qName: String
      ): Unit = {
        qName match {
          case "g" =>
            transformStack = transformStack.tail
          case _ =>
        }
      }
    })

    paths
  }

}
