import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname, resolve } from 'path';

const HEXIA_DIR = join(homedir(), '.hexia');
const CREDENTIALS_FILE = join(HEXIA_DIR, 'credentials.json');
const CONFIG_FILE = join(HEXIA_DIR, 'config.json');
const LOCAL_MARKER_FILE = '.hexia';

export interface Credentials {
  token: string;
  refreshToken: string;
  userId: string;
  email: string;
  name: string;
}

export interface ProjectConfig {
  projectId: string;
  projectName: string;
  agentId: string;
  agentName: string;
  apiKey: string;
  mcpUrl: string;
}

export interface HexiaConfig {
  projects: ProjectConfig[];
  activeProject?: string;
  apiUrl: string;
  frontendUrl: string;
}

export interface LocalProjectMarker {
  projectId: string;
}

function ensureHexiaDir() {
  if (!existsSync(HEXIA_DIR)) {
    mkdirSync(HEXIA_DIR, { recursive: true });
  }
}

export function saveCredentials(creds: Credentials) {
  ensureHexiaDir();
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function getCredentials(): Credentials | null {
  if (!existsSync(CREDENTIALS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function clearCredentials() {
  if (existsSync(CREDENTIALS_FILE)) {
    readFileSync(CREDENTIALS_FILE, 'utf-8');
    writeFileSync(CREDENTIALS_FILE, '');
  }
}

export function getConfig(): HexiaConfig {
  if (!existsSync(CONFIG_FILE)) {
    return {
      projects: [],
      apiUrl: process.env.HEXIA_API_URL || 'https://api.hexia.dev',
      frontendUrl: process.env.HEXIA_FRONTEND_URL || 'https://hexia.dev',
    };
  }
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
}

export function saveConfig(config: HexiaConfig) {
  ensureHexiaDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function addProject(config: HexiaConfig, project: ProjectConfig): HexiaConfig {
  const existing = config.projects.findIndex(p => p.projectId === project.projectId);
  if (existing >= 0) {
    config.projects[existing] = project;
  } else {
    config.projects.push(project);
  }
  config.activeProject = project.projectId;
  return config;
}

export function getActiveProject(config: HexiaConfig): ProjectConfig | null {
  if (!config.activeProject) return null;
  return config.projects.find(p => p.projectId === config.activeProject) || null;
}

export function findLocalProjectFile(startDir?: string): string | null {
  let current = resolve(startDir || process.cwd());
  const root = dirname(current);

  while (current !== root) {
    const markerPath = join(current, LOCAL_MARKER_FILE);
    if (existsSync(markerPath)) {
      return markerPath;
    }
    current = dirname(current);
  }

  const rootMarker = join(current, LOCAL_MARKER_FILE);
  if (existsSync(rootMarker)) return rootMarker;

  return null;
}

export function getLocalProject(): LocalProjectMarker | null {
  const markerPath = findLocalProjectFile();
  if (!markerPath) return null;
  try {
    return JSON.parse(readFileSync(markerPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveLocalProject(projectId: string, dir?: string) {
  const markerPath = join(dir || process.cwd(), LOCAL_MARKER_FILE);
  writeFileSync(markerPath, JSON.stringify({ projectId }, null, 2) + '\n');
  return markerPath;
}

export function removeLocalProject(dir?: string): boolean {
  const markerPath = findLocalProjectFile(dir);
  if (!markerPath) return false;
  writeFileSync(markerPath, '');
  return true;
}
