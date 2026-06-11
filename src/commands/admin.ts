import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { isAdmin } from '../utils/permissions';
import { getPlayer, recalculatePlayerStats } from '../systems/playerSystem';
import { addItem } from '../systems/inventorySystem';
import { unlockTownForPlayer } from '../systems/townSystem';
import { getDb } from '../db/database';
import { errorEmbed, successEmbed, playerEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import { nowIso } from '../types';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('管理者用コマンド')
  .addSubcommand((s) =>
    s
      .setName('reset_player')
      .setDescription('プレイヤーデータをリセットします')
      .addUserOption((o) =>
        o
          .setName('user')
          .setDescription('対象ユーザー')
          .setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('give_item')
      .setDescription('指定ユーザーにアイテムを付与します')
      .addUserOption((o) =>
        o
          .setName('user')
          .setDescription('対象ユーザー')
          .setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName('item')
          .setDescription('付与するアイテムID')
          .setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('give_gold')
      .setDescription('指定ユーザーにゴールドを付与します')
      .addUserOption((o) =>
        o
          .setName('user')
          .setDescription('対象ユーザー')
          .setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName('amount')
          .setDescription('付与するゴールド量')
          .setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('set_level')
      .setDescription('指定ユーザーのレベルを設定します')
      .addUserOption((o) =>
        o
          .setName('user')
          .setDescription('対象ユーザー')
          .setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName('level')
          .setDescription('設定するレベル')
          .setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('unlock_town')
      .setDescription('指定ユーザーの町を解放します')
      .addUserOption((o) =>
        o
          .setName('user')
          .setDescription('対象ユーザー')
          .setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName('town')
          .setDescription('解放する町ID')
          .setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('debug_player')
      .setDescription('指定ユーザーのデバッグ情報を表示します')
      .addUserOption((o) =>
        o
          .setName('user')
          .setDescription('対象ユーザー')
          .setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction, true);

  const member = interaction.member;
  if (!isAdmin(member as import('discord.js').GuildMember)) {
    await safeEdit(interaction, {
      embeds: [errorEmbed('管理者権限が必要です。')],
    });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const target = interaction.options.getUser('user', true);

  if (sub === 'reset_player') {
    getDb().prepare('DELETE FROM player_inventory WHERE user_id = ?').run(target.id);
    getDb().prepare('DELETE FROM player_equipment WHERE user_id = ?').run(target.id);
    getDb().prepare('DELETE FROM battle_sessions WHERE user_id = ?').run(target.id);

    getDb()
      .prepare(`
        UPDATE players
        SET
          level = 1,
          exp = 0,
          total_exp = 0,
          gold = 0,
          main_job = '未選択',
          sub_job = NULL,
          current_town_id = 'start_starfield',
          last_safe_town_id = 'start_starfield',
          hp = 100,
          max_hp = 100,
          mp = 30,
          max_mp = 30,
          attack = 10,
          magic = 10,
          defense = 8,
          spirit = 8,
          speed = 10,
          updated_at = ?
        WHERE user_id = ?
      `)
      .run(nowIso(), target.id);

    await safeEdit(interaction, {
      embeds: [successEmbed(`${target.username} をリセットしました。`)],
    });
    return;
  }

  if (sub === 'give_item') {
    const itemId = interaction.options.getString('item', true);

    const player = getPlayer(target.id);
    if (!player) {
      await safeEdit(interaction, {
        embeds: [errorEmbed('対象ユーザーはまだ登録されていません。先に /start が必要です。')],
      });
      return;
    }

    addItem(target.id, itemId, 1);

    await safeEdit(interaction, {
      embeds: [successEmbed(`${target.username} に ${itemId} を付与しました。`)],
    });
    return;
  }

  if (sub === 'give_gold') {
    const amount = interaction.options.getInteger('amount', true);

    const player = getPlayer(target.id);
    if (!player) {
      await safeEdit(interaction, {
        embeds: [errorEmbed('対象ユーザーはまだ登録されていません。先に /start が必要です。')],
      });
      return;
    }

    getDb()
      .prepare('UPDATE players SET gold = gold + ?, updated_at = ? WHERE user_id = ?')
      .run(amount, nowIso(), target.id);

    await safeEdit(interaction, {
      embeds: [successEmbed(`${target.username} に ${amount}G を付与しました。`)],
    });
    return;
  }

  if (sub === 'set_level') {
    const level = interaction.options.getInteger('level', true);

    const player = getPlayer(target.id);
    if (!player) {
      await safeEdit(interaction, {
        embeds: [errorEmbed('対象ユーザーはまだ登録されていません。先に /start が必要です。')],
      });
      return;
    }

    getDb()
      .prepare('UPDATE players SET level = ?, updated_at = ? WHERE user_id = ?')
      .run(level, nowIso(), target.id);

    recalculatePlayerStats(target.id);

    await safeEdit(interaction, {
      embeds: [successEmbed(`${target.username} のLvを ${level} に設定しました。`)],
    });
    return;
  }

  if (sub === 'unlock_town') {
    const town = interaction.options.getString('town', true);

    const player = getPlayer(target.id);
    if (!player) {
      await safeEdit(interaction, {
        embeds: [errorEmbed('対象ユーザーはまだ登録されていません。先に /start が必要です。')],
      });
      return;
    }

    unlockTownForPlayer(target.id, town);

    await safeEdit(interaction, {
      embeds: [successEmbed(`${target.username} に ${town} を解放しました。`)],
    });
    return;
  }

  if (sub === 'debug_player') {
    const player = getPlayer(target.id);

    if (!player) {
      await safeEdit(interaction, {
        embeds: [errorEmbed('対象ユーザーはまだ登録されていません。')],
      });
      return;
    }

    recalculatePlayerStats(target.id);
    const updated = getPlayer(target.id)!;

    const inv = getDb()
      .prepare('SELECT COUNT(*) as c FROM player_inventory WHERE user_id = ?')
      .get(target.id) as { c: number };

    const embed = playerEmbed(updated).addFields({
      name: 'インベントリ数',
      value: String(inv.c),
    });

    await safeEdit(interaction, {
      embeds: [embed],
    });
  }
}