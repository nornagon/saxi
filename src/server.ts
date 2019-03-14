import cors from "cors";
import express from "express";
import http from "http";
import path from "path";
import { WakeLock } from "wake-lock";
import WebSocket from "ws";
import { EBB } from "./ebb";
import { Device, PenMotion, Plan } from "./planning";
import { formatDuration } from "./util";

export function startServer(port: number, device: string | null = null, enableCors: boolean = false) {
  const app = express();

  app.use("/", express.static(path.join(__dirname, "..", "ui")));
  app.use(express.json({limit: "100mb"}));
  if (enableCors) {
    app.use(cors());
  }

  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  let ebb: EBB | null;
  let clients: WebSocket[] = [];
  let cancelRequested = false;

  wss.on("connection", (ws) => {
    clients.push(ws);
    ws.on("message", (message) => {
      if (typeof message === "string") {
        const msg = JSON.parse(message);
        switch (msg.c) {
          case "ping":
            ws.send(JSON.stringify({c: "pong"}));
            break;
          case "limp":
            if (ebb) { ebb.disableMotors(); }
            break;
          case "setPenHeight":
            if (ebb) { ebb.setPenHeight(msg.p.height, msg.p.rate); }
            break;
        }
      }
    });

    ws.send(JSON.stringify({c: "dev", p: {path: ebb ? ebb.port.path : null}}));

    ws.on("close", () => {
      clients = clients.filter((w) => w !== ws);
    });
  });

  app.post("/plot", async (req, res) => {
    const plan = Plan.deserialize(req.body);
    console.log(`Received plan of estimated duration ${formatDuration(plan.duration())}`);
    console.log(ebb != null ? "Beginning plot..." : "Simulating plot...");
    res.status(200).end();

    const begin = Date.now();
    let wakeLock: any;
    try {
      wakeLock = new WakeLock("saxi plotting");
    } catch (e) {
      console.warn("Couldn't acquire wake lock. Ensure your machine does not sleep during plotting");
    }

    try {
      await (ebb != null ? doPlot(plan) : simulatePlot(plan));
      const end = Date.now();
      console.log(`Plot took ${formatDuration((end - begin) / 1000)}`);
    } finally {
      if (wakeLock) {
        wakeLock.release();
      }
    }
  });

  app.post("/cancel", (req, res) => {
    cancelRequested = true;
    res.status(200).end();
  });

  function broadcast(msg: any) {
    clients.forEach((ws) => ws.send(JSON.stringify(msg)));
  }

  async function doPlot(plan: Plan): Promise<void> {
    await ebb.enableMotors(2);
    const firstPenMotion = (plan.motions.find((x) => x instanceof PenMotion) as PenMotion);
    await ebb.setPenHeight(firstPenMotion.initialPos, 1000, 1000);

    cancelRequested = false;
    let i = 0;
    for (const motion of plan.motions) {
      broadcast({c: "progress", p: {motionIdx: i}});
      await ebb.executeMotion(motion);
      if (cancelRequested) { break; }
      i += 1;
    }
    if (cancelRequested) {
      await ebb.setPenHeight(Device.Axidraw.penPctToPos(0), 1000);
      broadcast({c: "cancelled"});
      cancelRequested = false;
    } else {
      broadcast({c: "finished"});
    }
    await ebb.waitUntilMotorsIdle();
    await ebb.disableMotors();
  }

  async function simulatePlot(plan: Plan): Promise<void> {
    cancelRequested = false;
    let i = 0;
    for (const motion of plan.motions) {
      console.log(`Motion ${i + 1}/${plan.motions.length}`);
      broadcast({c: "progress", p: {motionIdx: i}});
      await new Promise((resolve) => setTimeout(resolve, motion.duration() * 1000));
      if (cancelRequested) { break; }
      i += 1;
    }
    if (cancelRequested) {
      broadcast({c: "cancelled"});
      cancelRequested = false;
    } else {
      broadcast({c: "finished"});
    }
  }

  return new Promise((resolve) => {
    server.listen(port, () => {
      connectEBB(device).then((d) => {
        if (d) {
          ebb = d;
          console.log(`Connected to EBB on ${ebb.port.path}`);
        } else {
          console.log(`No EBBs found, simulation mode active`);
        }
      });
      const {family, address, port} = server.address() as any;
      const addr = `${family === "IPv6" ? `[${address}]` : address}:${port}`;
      console.log(`Server listening on http://${addr}`);
      resolve(server);
    });
  });
}

export async function connectEBB(path: string | undefined): Promise<EBB | null> {
  if (path) {
    return new EBB(path);
  } else {
    const ebbs = await EBB.list();
    if (ebbs.length) {
      return new EBB(ebbs[0]);
    } else {
      return null;
    }
  }
}
