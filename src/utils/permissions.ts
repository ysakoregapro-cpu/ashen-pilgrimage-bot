import type { Guild, GuildMember, Role } from 'discord.js';

export function getEnv(name: string, fallback?: string): string {
  const val = process.env[name] ?? fallback;
  if (!val) throw new Error(`Missing env: ${name}`);
  return val;
}

export function getEnvOptional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export async function getOrCreateRole(guild: Guild, name: string): Promise<Role | null> {
  try {
    let role = guild.roles.cache.find((r) => r.name === name);
    if (!role) {
      role = await guild.roles.create({ name, reason: '灰星巡礼録: ロール作成' });
    }
    return role;
  } catch (e) {
    console.error('Failed to get/create role:', name, e);
    return null;
  }
}

export function isAdmin(member: GuildMember | null): boolean {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const adminRoleName = getEnvOptional('ADMIN_ROLE_NAME', '管理者');
  if (!adminRoleName) return false;
  return member.roles.cache.some((r) => r.name === adminRoleName);
}

export async function ensureMemberHasRole(member: GuildMember, role: Role | null): Promise<void> {
  if (role && !member.roles.cache.has(role.id)) {
    await member.roles.add(role).catch((e) => console.error('Failed to add role', e));
  }
}
