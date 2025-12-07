const { SlashCommandBuilder } = require('discord.js');
const { addPattern } = require('../../lib/db');

module.exports = {
  name: 'teach',
  slash: new SlashCommandBuilder().setName('teach').setDescription('Teach the bot a pattern (admins only)')
    .addStringOption(o => o.setName('trigger').setDescription('Trigger phrase').setRequired(true))
    .addStringOption(o => o.setName('response').setDescription('Response (use {user})').setRequired(true)),
  execute: async (client, interaction) => {
    const trigger = interaction.options.getString('trigger');
    const response = interaction.options.getString('response');
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has('ManageGuild')) return interaction.reply({ content: 'Manage Server required', ephemeral: true });
    addPattern(interaction.guildId, trigger, response);
    await interaction.reply({ content: 'Pattern saved.', ephemeral: true });
  }
};
