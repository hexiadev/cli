import { Command } from "commander";
import { getCredentials, getConfig, getActiveProject, getLocalProject, findLocalProjectFile } from "../config.js";

const isTTY = process.stdin.isTTY;

async function loadClack() {
  return await import("@clack/prompts");
}

function logInfo(msg: string) {
  if (isTTY) {
    loadClack().then((clack) => clack.log.info(msg)).catch(() => {});
  } else {
    console.log(`  ${msg}`);
  }
}

function logSuccess(msg: string) {
  if (isTTY) {
    loadClack().then((clack) => clack.log.success(msg)).catch(() => {});
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

function logWarn(msg: string) {
  if (isTTY) {
    loadClack().then((clack) => clack.log.warn(msg)).catch(() => {});
  } else {
    console.log(`  ⚠ ${msg}`);
  }
}

function logStep(msg: string) {
  if (isTTY) {
    loadClack().then((clack) => clack.log.step(msg)).catch(() => {});
  } else {
    console.log(`  ${msg}`);
  }
}

function logIntro(msg: string) {
  if (isTTY) {
    loadClack().then((clack) => clack.intro(msg)).catch(() => {});
  } else {
    console.log(`\n${msg}\n`);
  }
}

function logOutro(msg: string) {
  if (isTTY) {
    loadClack().then((clack) => clack.outro(msg)).catch(() => {});
  } else {
    console.log(`\n${msg}\n`);
  }
}

export function statusCommand(program: Command) {
  program
    .command("status")
    .description("Show current authentication status and active project")
    .action(async () => {
      const creds = getCredentials();
      const config = getConfig();
      const activeProject = getActiveProject(config);
      const localProject = getLocalProject();

      logIntro("Hexia CLI Status");

      if (creds) {
        logSuccess(`Authenticated as ${creds.name} (${creds.email})`);
      } else {
        logWarn("Not authenticated — run `hexia init` to connect");
      }

      logInfo(`API URL: ${config.apiUrl}`);
      logInfo(`Frontend URL: ${config.frontendUrl}`);

      if (localProject) {
        logSuccess(`Local project: ${localProject.projectId}`);
      } else {
        const markerPath = findLocalProjectFile();
        logWarn(`No local project link found`);
      }

      if (config.projects.length > 0) {
        logStep(`Projects (${config.projects.length}):`);
        for (const p of config.projects) {
          const marker = p.projectId === config.activeProject ? " (active)" : "";
          logInfo(`  ${p.projectName} (${p.projectId})${marker}`);
        }
      } else {
        logWarn("No projects — run `hexia init` to create one");
      }

      logOutro("Done");
    });
}
