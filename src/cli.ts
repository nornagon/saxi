import yargs from "yargs";
import {connectEBB, startServer} from "./server";

export function cli(argv: string[]): void {
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
    .option("firmware-version", {
      describe: "print the device's firmware version and exit",
      type: "boolean"
    })
    .parse(argv);

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
    startServer(args.port, args.device);
  }
}
