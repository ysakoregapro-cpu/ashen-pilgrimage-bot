import 'dotenv/config';

import {

  Client,

  GatewayIntentBits,

  Events,

  type Interaction,

  type ButtonInteraction,

  type StringSelectMenuInteraction,
} from 'discord.js';

import { getDb } from './db/database';

import { loadCommands } from './commands/index';

import { getEnv } from './utils/permissions';

import { errorEmbed, successEmbed } from './utils/embeds';
import { nextActionButtons, errorRecoveryPayload } from './utils/nextActionButtons';
import type { UiPayload } from './utils/townUi';

import { handleJobSelect } from './commands/job';

import { handleEquip } from './commands/equip';

import { handleExploreSelect } from './commands/explore';
import { handleBattleAction } from './commands/battle';
import {
  buildBattleReply, buildSkillMenuReply, buildItemMenuReply, processBattleAction,
} from './systems/battleSystem';
import { parseBattleCustomId } from './utils/battleCustomId';

import { handleTradeAdd } from './commands/trade';

import { handleUpgradeAction } from './commands/upgrade';

import { joinRescue, startPreemptiveRescue } from './commands/rescue';

import { joinRaid, startRaid, leaveRaid } from './commands/raid';

import {

  handleUxButton,

  handleUxSelect,

  buildPostVictory,

  buildPostDefeat,

  buildPostExplore,
  buildPostFled,
  buildSkillLearnedPost,
} from './interactions/uxHandler';

import {
  parseSessionCustomId,
  isPanelSessionValid,
  respondStale,
  sendJourneyLogAfterSelect,
  disableOldComponents,
  getSendableChannel,
} from './utils/messageFlow';



const client = new Client({ intents: [GatewayIntentBits.Guilds] });



client.once(Events.ClientReady, (c) => {

  getDb();

  console.log(`灰星巡礼録 起動完了: ${c.user.tag}`);

});



client.on(Events.InteractionCreate, async (interaction: Interaction) => {

  try {

    if (interaction.isChatInputCommand()) {

      const commands = loadCommands();

      const cmd = commands.get(interaction.commandName);

      if (!cmd) return;

      await cmd.execute(interaction);

      return;

    }



    if (interaction.isStringSelectMenu()) {

      const handled = await handleUxSelect(interaction);

      if (handled) return;

      await handleSelect(interaction);

      return;

    }



    if (interaction.isButton()) {

      const handled = await handleUxButton(interaction);

      if (handled) return;

      await handleButton(interaction);

    }

  } catch (e) {

    console.error('Interaction error:', e);

    const recovery = errorRecoveryPayload('道しるべが乱れたようです。\n少し戻って、もう一度選び直してください。');

    if (interaction.isRepliable()) {

      const channel = getSendableChannel(interaction.channel);

      if (interaction.replied || interaction.deferred) {

        if (channel) await channel.send(recovery).catch(() => {});

        else await interaction.followUp({ ...recovery, ephemeral: true }).catch(() => {});

      } else {

        await interaction.reply(recovery).catch(() => {});

      }

    }

  }

});



function stripSelectId(customId: string): string {

  return parseSessionCustomId(customId).base;

}



async function sendSelectResultLog(
  interaction: StringSelectMenuInteraction,
  payload: UiPayload,
): Promise<void> {

  await disableOldComponents(interaction.message);

  const channel = getSendableChannel(interaction.channel);
  if (!channel) return;
  await interaction.deferUpdate();
  await channel.send(payload);

}



async function handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {

  const base = stripSelectId(interaction.customId);

  const [prefix, action, extra] = base.split(':');

  const userId = interaction.user.id;

  const value = interaction.values[0]!;

  const { session } = parseSessionCustomId(interaction.customId);



  if (prefix === 'town' && action === 'travel') {

    if (session && !isPanelSessionValid(userId, session)) {

      await respondStale(interaction);

      return;

    }

    const { arriveAndShowHub } = await import('./systems/townActionSystem');

    await sendJourneyLogAfterSelect(interaction, arriveAndShowHub(userId, value));

    return;

  }



  if (prefix === 'onboarding' && action === 'job') {

    if (session && !isPanelSessionValid(userId, session)) {

      await respondStale(interaction);

      return;

    }

    const isSub = extra === 'sub';

    const msg = await handleJobSelect(userId, value, isSub);

    await sendSelectResultLog(interaction, {

      embeds: [successEmbed(msg)],

      components: nextActionButtons('job_done'),

    });

    return;

  }



  if (prefix === 'equip') {

    const msg = handleEquip(userId, Number(value));

    await sendSelectResultLog(interaction, { embeds: [successEmbed(msg)], components: nextActionButtons('equip') });

    return;

  }



  if (prefix === 'explore' && action === 'select') {

    if (session && !isPanelSessionValid(userId, session)) {

      await respondStale(interaction);

      return;

    }

    const result = await handleExploreSelect(userId, value);

    if (result.type === 'battle' && result.battleId) {

      const reply = buildBattleReply(result.battleId, userId);

      if (reply) {

        await sendJourneyLogAfterSelect(interaction, reply);

        return;

      }

    }

    await sendJourneyLogAfterSelect(interaction, buildPostExplore(result.message));

    return;

  }



  if (prefix === 'trade' && action === 'add' && extra) {

    const msg = handleTradeAdd(userId, extra, Number(value));

    await sendSelectResultLog(interaction, { embeds: [successEmbed(msg)], components: nextActionButtons('generic') });

    return;

  }



  if (prefix === 'battle') {

    const battle = parseBattleCustomId(base);

    if (!battle) {

      await interaction.update({ embeds: [errorEmbed('不明な選択です。')], components: [] });

      return;

    }

    if (battle.action === 'skill_pick') {

      const result = await processBattleAction(userId, battle.sessionId, 'skill', { skillId: value });

      await handleBattleResult(interaction, battle.sessionId, result);

      return;

    }

    if (battle.action === 'item_pick') {

      const result = await processBattleAction(userId, battle.sessionId, 'item', { inventoryId: Number(value) });

      await handleBattleResult(interaction, battle.sessionId, result);

      return;

    }

  }



  if (prefix === 'upgrade') {

    if (session && !isPanelSessionValid(userId, session)) {

      await respondStale(interaction);

      return;

    }

    const result = handleUpgradeAction(userId, action!, Number(value));

    await sendSelectResultLog(interaction, { ...result, components: nextActionButtons('upgrade') });

    return;

  }



  await interaction.update({ embeds: [errorEmbed('不明な選択です。')], components: [] });

}



async function handleBattleResult(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  sessionId: string,
  result: Awaited<ReturnType<typeof processBattleAction>>,
): Promise<void> {

  if (result.done) {

    await disableOldComponents(interaction.message);

    const channel = getSendableChannel(interaction.channel);
    if (!channel) return;
    await interaction.deferUpdate();

    if (result.status === 'victory') {

      await channel.send(buildPostVictory(result.message));

      if (result.skillLearned?.length) {

        const { buildSkillLearnedPost } = await import('./systems/townActionSystem');

        for (const sl of result.skillLearned) {

          await channel.send(buildSkillLearnedPost(sl.jobName, sl.skills));

        }

      }

      return;

    }

    if (result.status === 'defeat') {

      await channel.send(buildPostDefeat(result.message));

      return;

    }

    if (result.status === 'fled') {

      await channel.send(buildPostFled(result.message));

      return;

    }

    await channel.send(buildPostExplore(result.message));

    return;

  }

  const reply = buildBattleReply(sessionId, interaction.user.id);

  if (!reply) return;

  if (result.notify === 'mp' || result.notify === 'blocked') {

    reply.embeds[0]?.setDescription(result.message);

  }

  if (interaction.isButton() || interaction.isStringSelectMenu()) {

    await interaction.update(reply);

  }

}



async function handleButton(interaction: ButtonInteraction): Promise<void> {

  const parts = interaction.customId.split(':');

  const userId = interaction.user.id;



  if (parts[0] === 'battle') {

    const sessionId = parts[1]!;

    const action = parts[2]!;

    if (action === 'rescue') {

      await interaction.reply({

        embeds: [successEmbed('救難の便りは「救難を求める」から出せます。\n/rescue request でも同じです。')],

        ephemeral: true,

      });

      return;

    }

    if (action === 'skill_menu') {

      const reply = buildSkillMenuReply(sessionId, userId);

      if (!reply) {

        await interaction.reply({ embeds: [errorEmbed('使える技がない。')], ephemeral: true });

        return;

      }

      await interaction.update(reply);

      return;

    }



    if (action === 'item_menu') {

      const reply = buildItemMenuReply(sessionId, userId);

      if (!reply) {

        await interaction.reply({ embeds: [errorEmbed('戦闘で使える品がない。')], ephemeral: true });

        return;

      }

      await interaction.update(reply);

      return;

    }



    const result = await handleBattleAction(userId, sessionId, action);

    await handleBattleResult(interaction, sessionId, result);

    return;

  }



  if (parts[0] === 'rescue') {

    const rescueId = parts[2]!;

    if (parts[1] === 'join') {

      const msg = joinRescue(rescueId, userId);

      await interaction.reply({ embeds: [successEmbed(msg)] });

      return;

    }

    if (parts[1] === 'depart') {

      const msg = startPreemptiveRescue(rescueId, userId);

      await interaction.reply({ embeds: [successEmbed(msg)] });

    }

    return;

  }



  if (parts[0] === 'raid') {

    const raidId = parts[2]!;

    if (parts[1] === 'join') {

      const msg = joinRaid(raidId, userId);

      await interaction.reply({ embeds: [successEmbed(msg)] });

      return;

    }

    if (parts[1] === 'depart') {

      const msg = startRaid(raidId, userId);

      await interaction.reply({ embeds: [successEmbed(msg)] });

      return;

    }

    if (parts[1] === 'leave') {

      const msg = leaveRaid(raidId, userId);

      await interaction.reply({ embeds: [successEmbed(msg)] });

    }

    return;

  }



  await interaction.reply({ embeds: [errorEmbed('不明な操作です。')], ephemeral: true });

}



client.login(getEnv('DISCORD_TOKEN')).catch((e) => {

  console.error('Login failed:', e);

  process.exit(1);

});

