import { Command } from "commander";
import { findLocalProjectFile, removeLocalProject } from "../config.js";
import * as clack from "@clack/prompts";

export function unlinkCommand(program: Command) {
  program
    .command("unlink")
    .description("Remove the local project link from the current directory")
    .action(() => {
      const markerPath = findLocalProjectFile();
      if (!markerPath) {
        clack.log.warn("No local project link found.");
        return;
      }

      removeLocalProject();
      clack.log.success(`Removed local project link.`);
    });
}
