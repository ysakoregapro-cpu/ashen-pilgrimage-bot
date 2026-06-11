import fs from 'fs';
import path from 'path';
import type { Collection, SlashCommandBuilder } from 'discord.js';

export interface CommandModule {
  data: SlashCommandBuilder;
  execute: (interaction: import('discord.js').ChatInputCommandInteraction) => Promise<void>;
}

export function loadCommands(): Collection<string, CommandModule> {
  const { Collection } = require('discord.js') as typeof import('discord.js');
  const commands = new Collection<string, CommandModule>();
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter((f) => (f.endsWith('.js') || f.endsWith('.ts')) && !f.startsWith('index'));

  for (const file of files) {
    if (file.endsWith('.d.ts')) continue;
    const mod = require(path.join(dir, file)) as CommandModule;
    if (mod.data?.name) commands.set(mod.data.name, mod);
  }
  return commands;
}

export function getCommandData() {
  const commands = loadCommands();
  return [...commands.values()].map((c) => c.data.toJSON());
}
