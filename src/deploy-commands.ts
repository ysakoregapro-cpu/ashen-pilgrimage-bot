import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { getCommandData } from './commands/index';
import { getEnv } from './utils/permissions';

async function main() {
  const token = getEnv('DISCORD_TOKEN');
  const clientId = getEnv('CLIENT_ID');
  const guildId = getEnv('GUILD_ID');

  const rest = new REST({ version: '10' }).setToken(token);
  const body = getCommandData();

  console.log(`Deploying ${body.length} commands to guild ${guildId}...`);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
  console.log('Commands deployed successfully.');
}

main().catch((e) => {
  console.error('Deploy failed:', e);
  process.exit(1);
});
