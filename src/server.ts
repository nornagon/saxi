#!/usr/bin/env node
import express from "express";
import http from "http";
import path from "path";
import WebSocket from "ws";
import yargs from "yargs";
import { EBB } from "./ebb";
import { Device, PenMotion, Plan } from "./planning";
import { formatDuration } from "./util";

const app = express();

app.use(express.static(path.join(__dirname, "..", "..", "static")));
app.use("/dist", express.static(path.join(__dirname, "..", "ui")));
app.use(express.json({limit: "100mb"}));

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

  ws.on("close", () => {
    clients = clients.filter((w) => w !== ws);
  });
});

app.post("/plot", (req, res) => {
  const plan = Plan.deserialize(req.body);
  console.log(`Received plan of estimated duration ${formatDuration(plan.duration())}`);
  if (ebb != null) {
    console.log("Beginning plot...");
    const begin = Date.now();
    doPlot(plan).then(() => {
      const end = Date.now();
      console.log(`Plot took ${formatDuration((end - begin) / 1000)}`);
    });
  } else {
    simulatePlot(plan).then(() => {
      console.log("Simulation complete");
    });
  }
  res.status(200).end();
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
  // simulate
  cancelRequested = false;
  let i = 0;
  for (const motion of plan.motions) {
    console.log(`Motion ${i}/${plan.motions.length}`);
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

async function connectEBB(path: string | undefined) {
  if (path) {
    ebb = new EBB(path);
  } else {
    const ebbs = await EBB.list();
    if (ebbs.length) {
      console.log(`Connecting to EBB on ${ebbs[0]}`);
      ebb = new EBB(ebbs[0]);
    } else {
      console.log(`No EBBs found, simulation mode active`);
    }
  }
}

const args = yargs.strict()
  .option("port", {
    alias: "p",
    default: Number(process.env.PORT || 9080),
    describe: "TCP port on which to listen",
    type: "number"
  })
  .option("device", {
    alias: "d",
    describe: "device to connect to",
    type: "string"
  })
  .argv;

server.listen(args.port, () => {
  connectEBB(args.device);
  const {family, address, port} = server.address() as any;
  const addr = `${family === "IPv6" ? `[${address}]` : address}:${port}`;
  console.log(`Server listening on http://${addr}`);
});
