import yargs from "yargs";
import {connectEBB, startServer} from "./server";
import {plan, AxidrawFast} from "./planning";
import {Window} from "svgdom";
import * as fs from "fs";
import {flattenSVG} from "flatten-svg";
import { Vec2 } from "./vec";
import { formatDuration } from "./util";

function parseSvg(svg: string) {
  const window = new Window
  window.document.documentElement.innerHTML = svg
  return window.document.documentElement
}

export function cli(argv: string[]): void {
  yargs.strict()
    .option("device", {
      alias: "d",
      describe: "device to connect to",
      type: "string"
    })
    .command('$0', 'run the saxi web server',
      yargs => yargs
        .option("port", {
          alias: "p",
          default: Number(process.env.PORT || 9080),
          describe: "TCP port on which to listen",
          type: "number"
        })
        .option("enable-cors", {
          describe: "enable cross-origin resource sharing (CORS)",
          type: "boolean"
        })
        .option("max-payload-size", {
          describe: "maximum payload size to accept",
          default: "200 mb",
          type: "string"
        })
        .option("firmware-version", {
          describe: "print the device's firmware version and exit",
          type: "boolean"
        }),
      args => {
        if (args["firmware-version"]) {
          connectEBB(args.device).then(async (ebb) => {
            if (!ebb) {
              console.error(`No EBB connected`);
              return process.exit(1);
            }
            const fwv = await ebb.firmwareVersion();
            console.log(fwv);
            await ebb.close();
          });
        } else {
          startServer(args.port, args.device, args["enable-cors"], args["max-payload-size"]);
        }
      }
    )
    .command('plot <file>', 'plot an svg, then exit',
      yargs => yargs
        .positional("file", {
          type: 'string',
          description: "File to plot",
        })
        .option("paper-size", {
          alias: "s",
          describe: "Paper size to use",
          type: "boolean",
          required: true
        }),
      async args => {
        console.log("reading svg...")
        const svg = fs.readFileSync(args.file, 'utf8')
        console.log("parsing svg...")
        const parsed = parseSvg(svg)
        console.log("flattening svg...")
        const lines = flattenSVG(parsed, {})
        console.log("generating motion plan...")
        const profile = AxidrawFast
        const p = plan(linesToVecs(lines), profile)
        console.log(`${p.motions.length} motions, estimated duration: ${formatDuration(p.duration())}`)
        console.log("connecting to plotter...")
        const ebb = await connectEBB(args.device)
        if (!ebb) {
          console.error("Couldn't connect to device!")
          process.exit(1)
        }
        console.log("plotting...")
        ebb.executePlan(p)
        console.log("done!")
      }
    )
    .parse(argv);
}

function linesToVecs(lines: any[]): Vec2[][] {
  return lines.map((line) => {
    const a = line.points.map(([x, y]: [number, number]) => ({x, y}));
    (a as any).stroke = line.stroke;
    (a as any).groupId = line.groupId;
    return a;
  });
}
