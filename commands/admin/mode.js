const { SlashCommandBuilder } = require('discord.js');
const { getServerConfig, setServerConfig } = require('../../lib/db');

module.exports = {
  name: 'mode',
  slash: new SlashCommandBuilder().setName('mode').setDescription('Set server personality (admins only)')
    .addStringOption(o => o.setName('mode').setDescription('standard|formal|funny').setRequired(true)),
  execute: async (client, interaction) => {
    const modeVal = interaction.options.getString('mode');
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has('ManageGuild')) return interaction.reply({ content: 'Manage Server required', ephemeral: true });
    const conf = getServerConfig(interaction.guildId);
    conf.personality = modeVal;
    setServerConfig(interaction.guildId, conf);
    await interaction.reply({ content: `Personality set to ${modeVal}`, ephemeral: true });
  }
};
