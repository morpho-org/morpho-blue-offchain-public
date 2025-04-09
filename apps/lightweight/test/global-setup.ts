import { exec, execSync } from "node:child_process";

export default function setup() {
  try {
    const data = execSync("lsof -c anvil -t");

    const pids = data.toString().split("\n").slice(0, -1);

    console.debug(`Clearing ports: ${pids.join(", ")}`);

    for (const pid of pids) {
      exec(`kill -9 ${pid}`, (error) => {
        if (error) console.error(`Error while killing ${pid}: ${error}`);
      });
    }
    // eslint-disable-next-line no-empty
  } catch {}
}
