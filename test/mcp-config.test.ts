import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { generateMcpConfig } from '../src/mcp-config.js';

describe('mcp-config parity', () => {
  test('claude-code uses http transport with X-Api-Key header', () => {
    const config = generateMcpConfig('claude-code', {
      mcpUrl: 'https://api.hexia.dev/mcp/message',
      apiKey: 'ab_test',
      agentName: 'Claude Agent',
      agentId: '11111111-2222-3333-4444-555555555555',
    }) as any;

    const serverKey = 'hexia_claude_agent_11111111';
    assert.equal(config.mcpServers[serverKey].type, 'http');
    assert.equal(config.mcpServers[serverKey].url, 'https://api.hexia.dev/mcp/message');
    assert.equal(config.mcpServers[serverKey].headers['X-Api-Key'], 'ab_test');
  });

  test('codex uses http_headers (dashboard/server parity)', () => {
    const snippet = generateMcpConfig('codex', {
      mcpUrl: 'https://api.hexia.dev/mcp/message',
      apiKey: 'ab_test',
      agentName: 'My Agent',
      agentId: '123e4567-e89b-12d3-a456-426614174000',
    }) as string;

    assert.ok(snippet.includes('[mcp_servers.hexia_my_agent_123e4567]'));
    assert.ok(snippet.includes('http_headers = { "X-Api-Key" = "ab_test" }'));
    assert.ok(!snippet.includes('\nheaders = {'));
  });

  test('cursor uses url + headers shape', () => {
    const config = generateMcpConfig('cursor', {
      mcpUrl: 'https://api.hexia.dev/mcp/message',
      apiKey: 'ab_test',
      agentName: 'Cursor Agent',
      agentId: '22222222-2222-3333-4444-555555555555',
    }) as any;

    const serverKey = 'hexia_cursor_agent_22222222';
    assert.equal(config.mcpServers[serverKey].url, 'https://api.hexia.dev/mcp/message');
    assert.equal(config.mcpServers[serverKey].headers['X-Api-Key'], 'ab_test');
  });

  test('gemini uses httpUrl field (dashboard/server parity)', () => {
    const config = generateMcpConfig('gemini', {
      mcpUrl: 'https://api.hexia.dev/mcp/message',
      apiKey: 'ab_test',
      agentName: 'Gem Agent',
      agentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    }) as any;

    const serverKey = 'hexia_gem_agent_aaaaaaaa';
    assert.equal(config.mcpServers[serverKey].httpUrl, 'https://api.hexia.dev/mcp/message');
    assert.equal(config.mcpServers[serverKey].headers['X-Api-Key'], 'ab_test');
    assert.equal(config.mcpServers[serverKey].url, undefined);
  });

  test('opencode uses remote transport shape (dashboard/server parity)', () => {
    const config = generateMcpConfig('opencode', {
      mcpUrl: 'https://api.hexia.dev/mcp/message',
      apiKey: 'ab_test',
      agentName: 'Open Agent',
      agentId: 'ffffffff-1111-2222-3333-444444444444',
    }) as any;

    const serverKey = 'hexia_open_agent_ffffffff';
    assert.equal(config.$schema, 'https://opencode.ai/config.json');
    assert.equal(config.mcp[serverKey].type, 'remote');
    assert.equal(config.mcp[serverKey].enabled, true);
    assert.equal(config.mcp[serverKey].oauth, false);
    assert.equal(config.mcp[serverKey].url, 'https://api.hexia.dev/mcp/message');
  });

  test('openclaw returns manual setup snippet with X-Api-Key', () => {
    const snippet = generateMcpConfig('openclaw', {
      mcpUrl: 'https://api.hexia.dev/mcp/message',
      apiKey: 'ab_test',
      agentName: 'OpenClaw Agent',
      agentId: '33333333-2222-3333-4444-555555555555',
    }) as string;

    assert.ok(snippet.includes('OpenClaw config file: ~/.openclaw/openclaw.json'));
    assert.ok(snippet.includes('- Server Key: hexia_openclaw_agent_33333333'));
    assert.ok(snippet.includes('- MCP URL: https://api.hexia.dev/mcp/message'));
    assert.ok(snippet.includes('- Header: X-Api-Key: ab_test'));
  });
});
