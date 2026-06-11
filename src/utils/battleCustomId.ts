/** battle:<sessionId>:<action> 形式の customId を解析 */
export function parseBattleCustomId(base: string): { sessionId: string; action: string } | null {
  const parts = base.split(':');
  if (parts[0] !== 'battle' || parts.length < 3) return null;
  return { sessionId: parts[1]!, action: parts[2]! };
}
