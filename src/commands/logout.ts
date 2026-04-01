import { Command } from "commander";
import { clearCredentials, getConfig, saveConfig } from "../config.js";

const isTTY = process.stdin.isTTY;

async function logSuccess(msg: string) {
  if (isTTY) {
    const clack = await import("@clack/prompts");
    clack.log.success(msg);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

export function logoutCommand(program: Command) {
  program
    .command("logout")
    .description("Revoke CLI credentials and clear local data")
    .action(async () => {
      clearCredentials();
      const config = getConfig();
      config.projects = [];
      config.activeProject = undefined;
      saveConfig(config);
      await logSuccess("Local credentials cleared.");
    });
}
