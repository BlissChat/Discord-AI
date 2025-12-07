const { SlashCommandBuilder } = require('discord.js');
module.exports = {
  name: 'ping',
  slash: new SlashCommandBuilder().setName('ping').setDescription('Ping the bot'),
  execute: async (client, interaction) => {
    const t = Date.now();
    await interaction.reply('Pong...');
    const r = Date.now() - t;
    await interaction.editReply(`Pong — ${r}ms`);
  }
};
