import {
  ChannelType,
  Guild,
  OverwriteType,
  PermissionFlagsBits,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import { getEnvOptional, getOrCreateRole, ensureMemberHasRole } from '../utils/permissions';

export async function setupPlayerChannel(
  guild: Guild,
  member: GuildMember,
  userId: string,
): Promise<TextChannel> {
  const categoryName = getEnvOptional('RPG_CATEGORY_NAME', 'RPG：旅路');
  const adminRoleName = getEnvOptional('ADMIN_ROLE_NAME', '管理者');

  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === categoryName,
  );
  if (!category) {
    category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });
  }

  const channelName = `旅路-${member.user.username}`.slice(0, 100);
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
  ];

  const adminRole = guild.roles.cache.find((r) => r.name === adminRoleName);
  if (adminRole) {
    overwrites.push({
      id: adminRole.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites.map((o) => ({
      id: o.id,
      type: o.id === guild.id || o.id === adminRole?.id ? OverwriteType.Role : OverwriteType.Member,
      allow: 'allow' in o ? o.allow : undefined,
      deny: 'deny' in o ? o.deny : undefined,
    })),
    topic: `灰星巡礼録 - ${member.displayName}の旅路`,
  });

  const adventurerRoleName = getEnvOptional('ADVENTURER_ROLE_NAME', '冒険者');
  const role = await getOrCreateRole(guild, adventurerRoleName);
  await ensureMemberHasRole(member, role);

  return channel;
}

export async function getOrCreatePublicChannel(guild: Guild, name: string): Promise<TextChannel> {
  let channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === name,
  ) as TextChannel | undefined;
  if (!channel) {
    channel = await guild.channels.create({ name, type: ChannelType.GuildText });
  }
  return channel;
}
