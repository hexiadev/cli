import { Command } from "commander";
import { startLoopbackServer } from "../loopback.js";
import {
  saveCredentials,
  getConfig,
  saveConfig,
  addProject,
  saveLocalProject,
} from "../config.js";
import {
  AGENT_FRAMEWORKS,
  detectInstalledAgentFrameworks,
  generateMcpConfig,
  getFrameworkConfigLocation,
  installSkill,
  writeMcpConfig,
} from "../mcp-config.js";
import type { AgentFramework } from "../mcp-config.js";

const HEXIA_API_URL = process.env.HEXIA_API_URL || "https://api.hexia.dev";
const HEXIA_FRONTEND_URL =
  process.env.HEXIA_FRONTEND_URL || "https://hexia.dev";

const isTTY = process.stdin.isTTY;

interface ProjectSummary {
  id: string;
  name: string;
}

type FrameworkSelection = AgentFramework | "auto" | "none";

function parseFrameworkSelection(value: string): FrameworkSelection | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "auto" || normalized === "detect") return "auto";
  if (normalized === "none" || normalized === "skip") return "none";
  if (normalized === "claude" || normalized === "claudecode")
    return "claude-code";
  if (normalized === "opencode" || normalized === "open-code")
    return "opencode";
  if (normalized === "openclaw" || normalized === "open-claw")
    return "openclaw";
  if (
    normalized === "codex" ||
    normalized === "cursor" ||
    normalized === "gemini" ||
    normalized === "claude-code"
  ) {
    return normalized as AgentFramework;
  }
  return null;
}

async function loadClack() {
  return await import("@clack/prompts");
}

async function promptProjectSelection(
  projects: ProjectSummary[],
): Promise<ProjectSummary | "create_new"> {
  if (!isTTY) {
    return "create_new";
  }

  const clack = await loadClack();
  const choice = await clack.select({
    message: "Select a project:",
    options: [
      { label: "Create a new project", value: "create_new" },
      ...projects.map((p) => ({
        label: `${p.name} (${p.id})`,
        value: p.id,
      })),
    ],
  });

  if (clack.isCancel(choice)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  if (choice === "create_new") return "create_new";
  return projects.find((p) => p.id === choice)!;
}

async function promptFrameworkSelection(
  installed: AgentFramework[],
): Promise<FrameworkSelection> {
  if (!isTTY) {
    return "auto";
  }

  const clack = await loadClack();
  const installedLabel =
    installed.length > 0 ? installed.join(", ") : "none detected";

  const choice = await clack.select({
    message: "Framework to configure:",
    options: [
      { label: `Auto-detect (installed: ${installedLabel})`, value: "auto" },
      ...AGENT_FRAMEWORKS.map((f) => ({
        label: f + (installed.includes(f) ? " ✓" : ""),
        value: f,
      })),
      { label: "Skip MCP configuration", value: "none" },
    ],
  });

  if (clack.isCancel(choice)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return choice;
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

function logStep(msg: string) {
  if (isTTY) {
    loadClack().then((clack) => clack.log.step(msg)).catch(() => {});
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

function logError(msg: string) {
  if (isTTY) {
    loadClack().then((clack) => clack.log.error(msg)).catch(() => {});
  } else {
    console.log(`  ✗ ${msg}`);
  }
}

function logInfo(msg: string) {
  if (isTTY) {
    loadClack().then((clack) => clack.log.info(msg)).catch(() => {});
  } else {
    console.log(`  ${msg}`);
  }
}

async function promptText(
  message: string,
  defaultValue: string,
): Promise<string> {
  if (!isTTY) {
    return defaultValue;
  }

  const clack = await loadClack();
  const result = await clack.text({
    message,
    placeholder: defaultValue,
    defaultValue,
  });

  if (clack.isCancel(result)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  return result;
}

export function initCommand(program: Command) {
  program
    .command("init")
    .description("Connect Hexia CLI to your account and set up an agent")
    .option("--api-url <url>", "Hexia API URL", HEXIA_API_URL)
    .option("--frontend-url <url>", "Hexia frontend URL", HEXIA_FRONTEND_URL)
    .option("--project-name <name>", "Project name")
    .option("--project-id <id>", "Existing project ID to add the agent to")
    .option("--agent-name <name>", "Agent name")
    .option(
      "--framework <name>",
      "Framework to configure MCP for (auto|claude-code|codex|cursor|openclaw|opencode|gemini|none)",
    )
    .option("--skip-mcp", "Skip MCP configuration")
    .option(
      "--defer-project",
      "Skip project creation and let the agent create it on first run",
    )
    .action(async (opts) => {
      const apiUrl = opts.apiUrl;
      const frontendUrl = opts.frontendUrl;
      const skipMcp = opts.skipMcp;
      const deferProject = opts.deferProject;

      logIntro("Hexia CLI — connecting your agent");

      // Step 1: Start loopback server first so callback URL is known
      logStep("Starting local auth server...");
      const {
        port,
        result: loopbackResult,
        server,
      } = await startLoopbackServer();
      logSuccess(`Auth server ready (port ${port})`);

      const callbackUrl = `http://127.0.0.1:${port}`;

      // Step 2: Init auth code on server
      logStep("Generating auth code...");
      const initRes = await fetch(`${apiUrl}/v1/cli/auth/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callbackUrl }),
      });
      if (!initRes.ok) {
        logError(`Server error: ${initRes.status}`);
        server.close();
        process.exit(1);
      }
      const initBody = await initRes.json();
      const { code, state } = initBody;
      logSuccess("Auth code generated");

      // Step 3: Open browser — login page with CLI auth code + state
      const authUrl = `${frontendUrl}/login?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;

      logInfo(`Login URL: ${authUrl}`);

      // Try to open browser (non-blocking)
      try {
        const { default: open } = await import("open");
        open(authUrl).catch(() => {});
      } catch {
        // open failed, user will use the URL manually
      }

      // Step 4: Wait for callback
      logStep("Waiting for login...");
      try {
        const loopbackData = await loopbackResult;
        logSuccess("Logged in");

        // Step 5: Exchange code for JWT
        logStep("Exchanging code for token...");
        const exchangeRes = await fetch(`${apiUrl}/v1/cli/auth/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: loopbackData.code,
            state: loopbackData.state,
          }),
        });
        if (!exchangeRes.ok) {
          logError(`Error: ${exchangeRes.statusText}`);
          server.close();
          process.exit(1);
        }
        const exchangeBody = await exchangeRes.json();
        const { token, refreshToken, user } = exchangeBody;
        logSuccess(`Authenticated as ${user.email}`);

        // Save credentials
        saveCredentials({
          token,
          refreshToken,
          userId: user.id,
          email: user.email,
          name: user.name,
        });

        server.close();

        // Step 6: Create project (or defer project creation to the agent)
        let config = getConfig();
        config.apiUrl = apiUrl;
        config.frontendUrl = frontendUrl;

        let agentName = opts.agentName;
        if (!agentName) {
          agentName = await promptText(
            "Agent name:",
            "My Claude Code Agent",
          );
        }

        let apiKey: string;
        let agent: { id: string; name: string };

        if (deferProject) {
          logStep(
            `Creating agent "${agentName}" (project setup deferred)...`,
          );
          const agentRes = await fetch(`${apiUrl}/v1/agents`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ name: agentName, onboardingRequired: true }),
          });
          if (!agentRes.ok) {
            logError(`Error: ${agentRes.statusText}`);
            process.exit(1);
          }
          const agentBody = await agentRes.json();
          agent = agentBody.agent;
          apiKey = agentBody.apiKey;
          logSuccess("Agent created");
          saveConfig(config);
        } else {
          let projectId = opts.projectId as string | undefined;
          let projectName = opts.projectName as string | undefined;

          if (!projectId && !projectName) {
            const projectsRes = await fetch(
              `${apiUrl}/v1/projects?limit=100&offset=0`,
              {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
              },
            );
            if (projectsRes.ok) {
              const projectsBody = await projectsRes
                .json()
                .catch(() => ({ data: [] }));
              const existingProjects = Array.isArray(projectsBody?.data)
                ? projectsBody.data
                    .filter(
                      (p: any) =>
                        typeof p?.id === "string" &&
                        typeof p?.name === "string",
                    )
                    .map((p: any) => ({
                      id: p.id as string,
                      name: p.name as string,
                    }))
                : [];
              if (existingProjects.length > 0) {
                const selection =
                  await promptProjectSelection(existingProjects);
                if (selection !== "create_new") {
                  projectId = selection.id;
                  projectName = selection.name;
                }
              }
            }
          }

          if (!projectId) {
            if (!projectName) {
              projectName = await promptText(
                "Project name:",
                "my-hexia-project",
              );
            }

            logStep(`Creating project "${projectName}"...`);
            const projectRes = await fetch(`${apiUrl}/v1/projects`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ name: projectName }),
            });
            if (!projectRes.ok) {
              logError(`Error: ${projectRes.statusText}`);
              process.exit(1);
            }
            const projectBody = await projectRes.json();
            projectId = projectBody.id;
            projectName = projectBody.name ?? projectName;
            logSuccess("Project created");
          } else {
            logSuccess(
              `Using existing project "${projectName || projectId}"`,
            );
          }

          if (!projectId) {
            throw new Error("Project ID is required before agent bootstrap");
          }
          logStep(`Creating agent "${agentName}"...`);
          const bootstrapRes = await fetch(
            `${apiUrl}/v1/projects/${projectId}/bootstrap`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ name: agentName }),
            },
          );
          if (!bootstrapRes.ok) {
            logError(`Error: ${bootstrapRes.statusText}`);
            process.exit(1);
          }
          const bootstrapBody = await bootstrapRes.json();
          agent = bootstrapBody.agent;
          apiKey = bootstrapBody.apiKey;
          logSuccess("Agent created");

          const finalProjectId = projectId;
          const projectConfig = {
            projectId: finalProjectId,
            projectName: projectName || `project-${finalProjectId.slice(0, 8)}`,
            agentId: agent.id,
            agentName: agent.name,
            apiKey,
            mcpUrl: `${apiUrl}/mcp/message`,
          };

          config = addProject(config, projectConfig);
          saveConfig(config);
          saveLocalProject(finalProjectId);
        }

        if (!skipMcp) {
          let installedFrameworks: AgentFramework[] = [];
          try {
            installedFrameworks = await detectInstalledAgentFrameworks();
          } catch {}

          const explicitFrameworkRaw = (
            opts.framework as string | undefined
          )?.trim();
          let selection: FrameworkSelection = "auto";
          if (explicitFrameworkRaw && explicitFrameworkRaw.length > 0) {
            const parsed = parseFrameworkSelection(explicitFrameworkRaw);
            if (!parsed) {
              throw new Error(
                `Invalid --framework "${explicitFrameworkRaw}". Use auto|claude-code|codex|cursor|openclaw|opencode|gemini|none.`,
              );
            }
            selection = parsed;
          } else if (isTTY) {
            selection = await promptFrameworkSelection(installedFrameworks);
          }

          const framework =
            selection === "auto"
              ? (installedFrameworks[0] ?? null)
              : selection === "none"
                ? null
                : selection;

          const selectedLabel =
            selection === "auto"
              ? `auto (${framework || "none detected"})`
              : selection;
          logStep(`Framework selection: ${selectedLabel}`);

          if (framework) {
            logStep(`Configuring ${framework}...`);
            try {
              const configPath = await writeMcpConfig(framework, {
                mcpUrl: `${apiUrl}/mcp/message`,
                apiKey,
                agentName: agent.name,
                agentId: agent.id,
              });
              logSuccess(`MCP configured (${configPath})`);
            } catch (e: any) {
              logError(e.message);
              const snippet = generateMcpConfig(framework, {
                mcpUrl: `${apiUrl}/mcp/message`,
                apiKey,
                agentName: agent.name,
                agentId: agent.id,
              });
              logInfo(
                `Config file: ${getFrameworkConfigLocation(framework)}`,
              );
              logInfo("Paste this config manually:");
              console.log(
                typeof snippet === "string"
                  ? snippet
                  : JSON.stringify(snippet, null, 2),
              );
            }

            logStep("Installing Hexia skill...");
            try {
              await installSkill(framework);
              logSuccess("Skill installed");
            } catch (e: any) {
              logError(e.message);
            }
          } else {
            logInfo(
              "No agent framework detected. Configure MCP manually:",
            );
            logInfo(`MCP URL: ${apiUrl}/mcp/message`);
            logInfo(`API Key: ${apiKey}`);
          }
        }

        logOutro("Your agent is ready!");

        console.log("");
        console.log("Next steps:");
        console.log("  1. Launch your agent tool (Claude Code, Codex, etc.)");
        if (deferProject) {
          console.log(
            "  2. Ask the agent to run onboarding and create your first project",
          );
          console.log(
            "  3. The agent should call complete_onboarding when done",
          );
        } else {
          console.log(
            "  2. The agent will connect and guide you through setup",
          );
        }
        console.log("");
      } catch (e: any) {
        logError(e.message);
        server.close();
        process.exit(1);
      }
    });
}
