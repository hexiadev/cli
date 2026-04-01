import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';

interface ApiCall {
  method: string;
  path: string;
  body: unknown;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

async function readRequestBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return {};
  return JSON.parse(raw);
}

async function startFakeApiServer() {
  const calls: ApiCall[] = [];
  const code = 'e2e-code';
  const state = 'e2e-state';

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const body = await readRequestBody(req);

    calls.push({
      method,
      path: url.pathname,
      body,
    });

    if (method === 'POST' && url.pathname === '/v1/cli/auth/init') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        code,
        state,
        verificationUrl: 'http://localhost:3999/login',
        expiresIn: 300,
      }));
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/cli/auth/exchange') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        user: {
          id: 'user-1',
          email: 'e2e@example.com',
          name: 'E2E User',
        },
      }));
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/projects') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'project-1', name: 'E2E Project' }));
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/projects/project-1/bootstrap') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        agent: { id: 'agent-1', name: 'e2e-agent' },
        apiKey: 'ab_api_key_regular',
      }));
      return;
    }

    if (method === 'POST' && url.pathname === '/v1/agents') {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        agent: { id: 'agent-2', name: 'e2e-agent' },
        apiKey: 'ab_api_key_deferred',
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('Failed to start fake API server');
  }

  return {
    calls,
    code,
    state,
    apiUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => err ? reject(err) : resolve());
      });
    },
  };
}

async function runInitCli(args: string[], options: { homeDir: string; code: string; state: string; }) {
  const cwd = join(dirname(fileURLToPath(import.meta.url)), '..');
  let stdout = '';
  let stderr = '';
  let callbackSent = false;

  const proc = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts', 'init', ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: options.homeDir,
      USERPROFILE: options.homeDir,
      XDG_CONFIG_HOME: join(options.homeDir, '.config'),
      CI: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (chunk: Buffer | string) => {
    stdout += chunk.toString();
    if (callbackSent) return;

    const match = stdout.match(/port (\d+)\)/);
    if (!match) return;
    callbackSent = true;

    const port = Number(match[1]);
    void fetch(`http://127.0.0.1:${port}/?code=${encodeURIComponent(options.code)}&state=${encodeURIComponent(options.state)}`)
      .catch(() => {});
  });

  proc.stderr.on('data', (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) => resolve(code ?? 1));
  });

  return { exitCode, stdout, stderr };
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('hexia init e2e', () => {
  test('regular init creates project + bootstrap flow and writes local config', async () => {
    const fakeApi = await startFakeApiServer();
    const homeDir = mkdtempSync(join(tmpdir(), 'hexia-cli-e2e-'));
    tempDirs.push(homeDir);
    mkdirSync(join(homeDir, '.config'), { recursive: true });

    try {
      const result = await runInitCli([
        '--api-url', fakeApi.apiUrl,
        '--frontend-url', 'http://localhost:3999',
        '--project-name', 'E2E Project',
        '--agent-name', 'e2e-agent',
        '--skip-mcp',
      ], { homeDir, code: fakeApi.code, state: fakeApi.state });

      assert.equal(result.exitCode, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

      const paths = fakeApi.calls.map(c => `${c.method} ${c.path}`);
      assert.ok(paths.includes('POST /v1/cli/auth/init'));
      assert.ok(paths.includes('POST /v1/cli/auth/exchange'));
      assert.ok(paths.includes('POST /v1/projects'));
      assert.ok(paths.includes('POST /v1/projects/project-1/bootstrap'));

      const bootstrapCall = fakeApi.calls.find(c => c.method === 'POST' && c.path === '/v1/projects/project-1/bootstrap');
      assert.ok(bootstrapCall);
      assert.deepEqual(bootstrapCall.body, { name: 'e2e-agent' });

      const credentials = readJson<{
        token: string;
        refreshToken: string;
        userId: string;
        email: string;
        name: string;
      }>(join(homeDir, '.hexia', 'credentials.json'));
      assert.equal(credentials.token, 'jwt-token');
      assert.equal(credentials.refreshToken, 'refresh-token');

      const config = readJson<{
        apiUrl: string;
        frontendUrl: string;
        activeProject?: string;
        projects: Array<{ projectId: string; agentId: string; apiKey: string }>;
      }>(join(homeDir, '.hexia', 'config.json'));
      assert.equal(config.apiUrl, fakeApi.apiUrl);
      assert.equal(config.activeProject, 'project-1');
      assert.equal(config.projects.length, 1);
      assert.equal(config.projects[0]?.projectId, 'project-1');
      assert.equal(config.projects[0]?.agentId, 'agent-1');
      assert.equal(config.projects[0]?.apiKey, 'ab_api_key_regular');
    } finally {
      await fakeApi.close();
    }
  });

  test('defer-project init creates only agent with onboardingRequired flag', async () => {
    const fakeApi = await startFakeApiServer();
    const homeDir = mkdtempSync(join(tmpdir(), 'hexia-cli-e2e-'));
    tempDirs.push(homeDir);
    mkdirSync(join(homeDir, '.config'), { recursive: true });

    try {
      const result = await runInitCli([
        '--api-url', fakeApi.apiUrl,
        '--frontend-url', 'http://localhost:3999',
        '--agent-name', 'e2e-agent',
        '--skip-mcp',
        '--defer-project',
      ], { homeDir, code: fakeApi.code, state: fakeApi.state });

      assert.equal(result.exitCode, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

      const paths = fakeApi.calls.map(c => `${c.method} ${c.path}`);
      assert.ok(paths.includes('POST /v1/cli/auth/init'));
      assert.ok(paths.includes('POST /v1/cli/auth/exchange'));
      assert.ok(paths.includes('POST /v1/agents'));
      assert.ok(!paths.includes('POST /v1/projects'));
      assert.ok(!paths.includes('POST /v1/projects/project-1/bootstrap'));

      const createAgentCall = fakeApi.calls.find(c => c.method === 'POST' && c.path === '/v1/agents');
      assert.ok(createAgentCall);
      assert.deepEqual(createAgentCall.body, { name: 'e2e-agent', onboardingRequired: true });

      const config = readJson<{
        apiUrl: string;
        frontendUrl: string;
        projects: Array<unknown>;
      }>(join(homeDir, '.hexia', 'config.json'));
      assert.equal(config.apiUrl, fakeApi.apiUrl);
      assert.equal(config.frontendUrl, 'http://localhost:3999');
      assert.equal(config.projects.length, 0);
    } finally {
      await fakeApi.close();
    }
  });
});
