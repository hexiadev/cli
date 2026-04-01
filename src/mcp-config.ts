import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { createHash } from 'crypto';

export interface McpConfigParams {
  mcpUrl: string;
  apiKey: string;
  agentName: string;
  agentId?: string;
}

export type AgentFramework = 'claude-code' | 'codex' | 'cursor' | 'openclaw' | 'opencode' | 'gemini';
export const AGENT_FRAMEWORKS: AgentFramework[] = ['claude-code', 'codex', 'cursor', 'openclaw', 'opencode', 'gemini'];

const FRAMEWORK_CHECKS: Array<{ name: AgentFramework; paths: string[] }> = [
  { name: 'claude-code', paths: [join(homedir(), '.claude.json'), join(homedir(), '.claude', 'settings.json')] },
  { name: 'codex', paths: [join(homedir(), '.codex', 'config.toml')] },
  { name: 'cursor', paths: [join(homedir(), '.cursor', 'mcp.json')] },
  { name: 'openclaw', paths: [join(homedir(), '.openclaw', 'openclaw.json')] },
  { name: 'opencode', paths: [join(homedir(), '.config', 'opencode', 'opencode.json')] },
  { name: 'gemini', paths: [join(homedir(), '.gemini', 'settings.json')] },
];

function slugifyAgentName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'agent';
}

function getServerKey(params: McpConfigParams): string {
  // Keep parity with dashboard onboarding when agentId is available.
  if (params.agentId) {
    const slug = slugifyAgentName(params.agentName) || 'agent';
    const suffix = params.agentId.split('-')[0] ?? params.agentId.slice(0, 8);
    return `hexia_${slug}_${suffix}`;
  }

  // Fallback for legacy calls without agentId: stable key with short fingerprint
  // so multiple agents can coexist in one config without collisions.
  const slug = slugifyAgentName(params.agentName);
  const fingerprint = createHash('sha256').update(params.apiKey).digest('hex').slice(0, 8);
  return `hexia_${slug}_${fingerprint}`;
}

/**
 * Detect which AI coding tools are installed on this machine.
 * Returns the first one found, preferring Claude Code.
 */
export async function detectAgentFramework(): Promise<AgentFramework | null> {
  const installed = await detectInstalledAgentFrameworks();
  return installed[0] ?? null;
}

export async function detectInstalledAgentFrameworks(): Promise<AgentFramework[]> {
  const installed: AgentFramework[] = [];

  for (const check of FRAMEWORK_CHECKS) {
    for (const p of check.paths) {
      if (existsSync(p)) {
        installed.push(check.name);
        break;
      }
    }
  }

  // Check if Claude Code is in PATH
  try {
    const { execSync } = await import('child_process');
    execSync('which claude', { stdio: 'ignore' });
    if (!installed.includes('claude-code')) installed.unshift('claude-code');
  } catch {}

  return installed;
}

/**
 * Generate MCP config snippet for the given framework.
 */
export function generateMcpConfig(framework: AgentFramework, params: McpConfigParams): string | object {
  const serverKey = getServerKey(params);

  switch (framework) {
    case 'claude-code':
      return {
        mcpServers: {
          [serverKey]: {
            type: 'http',
            url: params.mcpUrl,
            headers: { 'X-Api-Key': params.apiKey },
          },
        },
      };
    case 'codex':
      // Match server/dashboard onboarding shape.
      return `[mcp_servers.${serverKey}]\nurl = "${params.mcpUrl}"\nhttp_headers = { "X-Api-Key" = "${params.apiKey}" }`;
    case 'cursor':
      return {
        mcpServers: {
          [serverKey]: {
            url: params.mcpUrl,
            headers: { 'X-Api-Key': params.apiKey },
          },
        },
      };
    case 'openclaw':
      return [
        'OpenClaw config file: ~/.openclaw/openclaw.json',
        'Add a remote MCP server with:',
        `- Server Key: ${serverKey}`,
        `- Server Name: Hexia (${params.agentName.trim() || 'Agent'})`,
        `- MCP URL: ${params.mcpUrl}`,
        `- Header: X-Api-Key: ${params.apiKey}`,
      ].join('\n');
    case 'opencode':
      return {
        $schema: 'https://opencode.ai/config.json',
        mcp: {
          [serverKey]: {
            type: 'remote',
            url: params.mcpUrl,
            enabled: true,
            headers: { 'X-Api-Key': params.apiKey },
          },
        },
      };
    case 'gemini':
      return {
        mcpServers: {
          [serverKey]: {
            httpUrl: params.mcpUrl,
            headers: { 'X-Api-Key': params.apiKey },
          },
        },
      };
    default:
      return JSON.stringify({
        url: params.mcpUrl,
        headers: { 'X-Api-Key': params.apiKey },
      }, null, 2);
  }
}

export function getFrameworkConfigLocation(framework: AgentFramework): string {
  const home = homedir();
  switch (framework) {
    case 'claude-code':
      return join(home, '.claude.json');
    case 'codex':
      return join(home, '.codex', 'config.toml');
    case 'cursor':
      return join(home, '.cursor', 'mcp.json');
    case 'openclaw':
      return join(home, '.openclaw', 'openclaw.json');
    case 'opencode':
      return join(home, '.config', 'opencode', 'opencode.json');
    case 'gemini':
      return join(home, '.gemini', 'settings.json');
    default:
      return '~';
  }
}

/**
 * Write MCP config to the framework's config file.
 * Merges with existing config if present.
 */
export async function writeMcpConfig(framework: AgentFramework, params: McpConfigParams): Promise<string> {
  const home = homedir();
  let configPath: string;
  let isToml = false;

  switch (framework) {
    case 'claude-code':
      configPath = join(home, '.claude.json');
      break;
    case 'codex':
      configPath = join(home, '.codex', 'config.toml');
      isToml = true;
      break;
    case 'cursor':
      configPath = join(home, '.cursor', 'mcp.json');
      break;
    case 'openclaw':
      // OpenClaw schema can differ by version; keep parity with dashboard and require manual insertion.
      throw new Error(`OpenClaw requires manual setup. Paste the generated snippet into ${getFrameworkConfigLocation('openclaw')}.`);
    case 'opencode':
      configPath = join(home, '.config', 'opencode', 'opencode.json');
      break;
    case 'gemini':
      configPath = join(home, '.gemini', 'settings.json');
      break;
    default:
      throw new Error(`Unknown framework: ${framework}`);
  }

  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  if (isToml) {
    // For TOML (Codex), upsert this server section to avoid duplicates.
    let existing = '';
    if (existsSync(configPath)) {
      existing = readFileSync(configPath, 'utf-8');
    }
    const newContent = (generateMcpConfig(framework, params) as string).trim();
    const sectionHeader = newContent.split('\n')[0];
    const lines = existing.length > 0 ? existing.split('\n') : [];

    const start = lines.findIndex((line) => line.trim() === sectionHeader);
    if (start >= 0) {
      let end = start + 1;
      while (end < lines.length && !lines[end].trim().startsWith('[')) {
        end += 1;
      }
      lines.splice(start, end - start);
    }

    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    lines.push(...newContent.split('\n'));
    const finalToml = lines.join('\n').replace(/\n*$/, '\n');
    writeFileSync(configPath, finalToml);
  } else {
    // For JSON configs, merge
    let existing: any = {};
    if (existsSync(configPath)) {
      try {
        existing = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch {
        existing = {};
      }
    }

    const newConfig = generateMcpConfig(framework, params) as object;
    // Deep merge mcpServers
    const newServers = (newConfig as any).mcpServers || (newConfig as any).mcp;
    if (newServers) {
      const targetKey = (newConfig as any).mcpServers ? 'mcpServers' : 'mcp';
      if (!existing[targetKey]) existing[targetKey] = {};
      Object.assign(existing[targetKey], newServers);
    }

    writeFileSync(configPath, JSON.stringify(existing, null, 2));
  }
  return configPath;
}

/**
 * Download and install the Hexia skill file.
 */
export async function installSkill(framework: AgentFramework): Promise<void> {
  const home = homedir();
  let skillDir: string;

  switch (framework) {
    case 'claude-code':
      skillDir = join(home, '.claude', 'skills', 'hexia');
      break;
    case 'codex':
      skillDir = join(home, '.codex', 'skills', 'hexia');
      break;
    case 'cursor':
      skillDir = join(home, '.cursor', 'skills', 'hexia');
      break;
    case 'opencode':
      skillDir = join(home, '.config', 'opencode', 'skills', 'hexia');
      break;
    case 'gemini':
      skillDir = join(home, '.gemini', 'skills', 'hexia');
      break;
    default:
      throw new Error(`Unknown framework: ${framework}`);
  }

  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true });
  }

  const skillUrl = 'https://hexia.dev/skills/hexia/v1/SKILL.md';
  const res = await fetch(skillUrl);
  if (!res.ok) {
    throw new Error(`Failed to download skill: ${res.status}`);
  }
  const content = await res.text();
  writeFileSync(join(skillDir, 'SKILL.md'), content);
}
