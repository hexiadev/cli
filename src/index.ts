#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';
import { logoutCommand } from './commands/logout.js';
import { linkCommand } from './commands/link.js';
import { unlinkCommand } from './commands/unlink.js';

const program = new Command();

program
  .name('hexia')
  .description('Hexia CLI — run AI agents as a coordinated team with shared project context')
  .version('0.1.0');

initCommand(program);
statusCommand(program);
logoutCommand(program);
linkCommand(program);
unlinkCommand(program);

program.parse();
