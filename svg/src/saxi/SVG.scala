package saxi

import java.awt.geom.{AffineTransform, FlatteningPathIterator, PathIterator}
import java.io.{File, FileInputStream}

import org.apache.batik.anim.dom.SAXSVGDocumentFactory
import org.apache.batik.bridge.{BridgeContext, DocumentLoader, GVTBuilder, UserAgentAdapter}
import org.apache.batik.util.XMLResourceDescriptor

import scala.collection.mutable

object SVG {
  def readSVG(f: File): Seq[Seq[Vec2]] = {
    val parser = XMLResourceDescriptor.getXMLParserClassName
    val factory = new SAXSVGDocumentFactory(parser)
    val doc = factory.createDocument(f.toURI.toString, new FileInputStream(f))
    val userAgent = new UserAgentAdapter
    val loader = new DocumentLoader(userAgent)
    val ctx = new BridgeContext(userAgent, loader)
    ctx.setDynamicState(BridgeContext.DYNAMIC)
    val builder = new GVTBuilder
    val rootNode = builder.build(ctx, doc)
    val shape = rootNode.getOutline
    val pi = shape.getPathIterator(new AffineTransform())
    val fpi = new FlatteningPathIterator(pi, 0.01)
    val pointLists = mutable.Buffer.empty[mutable.Buffer[Vec2]]
    var currentPointList: Option[mutable.Buffer[Vec2]] = None

    def appendPoint(point: Vec2): Unit = {
      val pl = currentPointList.getOrElse {
        val pointList = mutable.Buffer.empty[Vec2]
        currentPointList = Some(pointList)
        pointLists.append(pointList)
        pointList
      }
      pl.append(point)
    }
    def endPath(): Unit = currentPointList = None
    def closePath(): Unit = {
      currentPointList match {
        case Some(points) if points.nonEmpty =>
          appendPoint(points.head)
          endPath()
        case _ =>
      }
    }

    val coords = new Array[Double](2)
    while (!fpi.isDone) {
      fpi.currentSegment(coords) match {
        case PathIterator.SEG_MOVETO =>
          val (x, y) = (coords(0), coords(1))
          endPath()
          appendPoint(Vec2(x, y))
        case PathIterator.SEG_LINETO =>
          val (x, y) = (coords(0), coords(1))
          appendPoint(Vec2(x, y))
        case PathIterator.SEG_CLOSE =>
          closePath()
      }
      fpi.next()
    }

    pointLists
  }
}
