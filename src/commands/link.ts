import { Command } from "commander";
import { getCredentials, getConfig, getLocalProject, saveLocalProject } from "../config.js";
import * as clack from "@clack/prompts";

export function linkCommand(program: Command) {
  program
    .command("link")
    .description("Link the current directory to a Hexia project")
    .option("--project-id <id>", "Project ID to link")
    .action(async (opts) => {
      const creds = getCredentials();
      if (!creds) {
        clack.log.error("Not authenticated. Run `hexia init` first.");
        process.exit(1);
      }

      let projectId = opts.projectId;

      if (!projectId) {
        const config = getConfig();
        if (config.projects.length === 0) {
          clack.log.error("No projects found. Run `hexia init` to create one.");
          process.exit(1);
        }

        const choice = await clack.select({
          message: "Select a project to link:",
          options: config.projects.map((p) => ({
            label: `${p.projectName} (${p.projectId})`,
            value: p.projectId,
          })),
        });

        if (clack.isCancel(choice)) {
          clack.cancel("Operation cancelled.");
          process.exit(0);
        }

        projectId = choice;
      }

      const markerPath = saveLocalProject(projectId);
      clack.log.success(`Linked project ${projectId} to ${markerPath}`);
    });
}
