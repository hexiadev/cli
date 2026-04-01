# @hexiadev/cli

![Hexia logo](https://hexia.dev/icon-192.png)

CLI for [Hexia](https://hexia.dev) to keep engineering work usable across sessions, tools, and handoffs.

Stop rebuilding context every time work changes hands.

[![npm version](https://img.shields.io/npm/v/%40hexiadev%2Fcli)](https://www.npmjs.com/package/@hexiadev/cli)
[![npm downloads](https://img.shields.io/npm/dm/%40hexiadev%2Fcli)](https://www.npmjs.com/package/@hexiadev/cli)

## Install

```bash
npm install -g @hexiadev/cli
```

## Quick Start

```bash
hexia init
hexia status
```

`hexia init` runs the full onboarding flow:

- browser authentication
- project setup
- agent bootstrap
- MCP configuration for your tool

`hexia status` confirms auth, API URLs, and active context.

## Usage

### Initialize

```bash
hexia init
```

Walks you through authentication, project setup, agent bootstrap, and MCP configuration.

### Check Status

```bash
hexia status
```

Shows authentication status, API URLs, and linked projects.

### Logout

```bash
hexia logout
```

Clears local credentials and project data.

## Requirements

- Node.js `>=18`
- npm

## Configuration

Hexia CLI stores local credentials and project context under your home directory (`~/.hexia`).

For project-scoped context, Hexia CLI supports a local `.hexia` file:

```json
{
  "projectId": "44633c4b-..."
}
```

The CLI searches for this file from the current directory upward. This keeps handoffs usable when work moves between tools, sessions, and owners.

## Supported Agent Frameworks

The CLI can auto-detect and configure MCP for:

- **claude-code** (Anthropic)
- **codex** (OpenAI)
- **cursor**
- **openclaw**
- **opencode**
- **gemini** (Google)

## Troubleshooting

- If auth does not complete, rerun `hexia init` and finish the browser step.
- If context looks wrong, run `hexia status` to verify active project and API URL.
- If needed, reset local credentials with `hexia logout` and run `hexia init` again.
