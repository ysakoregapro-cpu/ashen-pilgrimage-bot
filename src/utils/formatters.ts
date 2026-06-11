import type { ColorResolvable } from 'discord.js';

export const COLORS = {
  town: 0x8b9dc3 as ColorResolvable,
  battle: 0x994444 as ColorResolvable,
  victory: 0x44aa66 as ColorResolvable,
  defeat: 0x666677 as ColorResolvable,
  warning: 0xd6a84f as ColorResolvable,
  reward: 0xc9b458 as ColorResolvable,
};

export function formatSpeech(npcName: string, text: string): string {
  const cleaned = text.trim().replace(/^\*\*[\s\S]*?\*\*\s*/, '');
  const inner = cleaned.replace(/^[「"]|[」"]$/g, '').trim();
  return `${npcName}：\n*「${inner}」*`;
}

export function formatSpeechOnly(text: string): string {
  const cleaned = text.trim().replace(/^\*\*[\s\S]*?\*\*\s*/, '');
  const inner = cleaned.replace(/^[「"]|[」"]$/g, '').trim();
  return `*「${inner}」*`;
}

export function formatTownIntro(text: string): string {
  return `*${text.trim()}*`;
}

export function formatBulletList(items: string[]): string {
  return items.map((i) => `・${i}`).join('\n');
}

export function formatFieldTitle(label: string): string {
  return `【${label}】`;
}

export function formatDamage(amount: number): string {
  return `**${amount}**`;
}

export function formatHeal(amount: number): string {
  return `**${amount}**`;
}

export function formatWarning(text: string): string {
  return `⚠️ ${text}`;
}

export function hpBar(current: number, max: number): string {
  const pct = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(pct * 10);
  return `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)} ${current}/${max}`;
}

export function breakBar(current: number, max: number): string {
  return `🟡 ブレイク ${Math.round(current)}/${max}`;
}

export type BattleLogType = 'player_attack' | 'enemy_attack' | 'player_skill' | 'player_heal' | 'player_divine' | 'status' | 'break' | 'flee_ok' | 'flee_fail' | 'info';

export function formatBattleLine(type: BattleLogType, text: string): string {
  const icons: Record<BattleLogType, string> = {
    player_attack: '🔵',
    enemy_attack: '🔴',
    player_skill: '🔵',
    player_heal: '🟢',
    player_divine: '🟢',
    status: '🟣',
    break: '🟡',
    flee_ok: '🧭',
    flee_fail: '🔴',
    info: '✦',
  };
  return `${icons[type]} ${text}`;
}

export function formatExploreResult(message: string): string {
  const lines = message.split('\n\n');
  return lines.map((block, i) => {
    if (block.startsWith('⚠️') || block.startsWith('この先は')) return formatWarning(block);
    if (i === 0 && block.includes('進んだ') || block.includes('遭遇')) return `🧭 ${block}`;
    if (block.includes('手に入') || block.includes('見つけ') || block.includes('拾っ')) return `🎒 ${block}`;
    return block;
  }).join('\n\n');
}

export function formatVictoryMessage(message: string): string {
  return message.split('\n').map((line) => {
    if (line.includes('EXP') || line.includes('G')) return `✦ ${line}`;
    if (line.includes('手に入') || line.includes('×')) return `🎒 ${line}`;
    if (line.includes('倒した')) return `🔵 ${line}`;
    return line;
  }).join('\n');
}
