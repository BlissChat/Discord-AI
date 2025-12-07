const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { askAI } = require('../../lib/ai');
const { getUserMemory, getServerConfig } = require('../../lib/db');

module.exports = {
  name: 'ask',
  slash: new SlashCommandBuilder().setName('ask').setDescription('Ask the assistant a question')
    .addStringOption(o => o.setName('prompt').setDescription('Your question').setRequired(true)),
  execute: async (client, interaction) => {
    const prompt = interaction.options.getString('prompt');
    await interaction.deferReply();
    const conf = getServerConfig(interaction.guildId || 'dm');
    const userMem = getUserMemory(interaction.user.id);
    const memText = (userMem.notes || []).slice(-5).join('\n');
    const systemPrompt = `You are a helpful assistant. Mode: ${conf.personality}`;
    const fullPrompt = `${systemPrompt}\n\nRecent memory:\n${memText}\n\nQuestion:\n${prompt}`;
    try {
      const answer = await askAI(fullPrompt, []);
      const embed = new EmbedBuilder().setTitle('Assistant').setDescription(answer).setColor('#6ea8fe');
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('ask command error', err);
      await interaction.editReply('⚠️ Error contacting AI.');
    }
  }
};
