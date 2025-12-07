const { SlashCommandBuilder } = require('discord.js');
module.exports = {
  name: 'help',
  slash: new SlashCommandBuilder().setName('help').setDescription('Show help'),
  execute: async (client, interaction) => {
    const text = `Commands:\n/ask [prompt]\n/mode [standard|formal|funny]\n/memory add/show/clear\n/teach (admin)\n/remind\n/coinflip\n/imagine\n\nYou can also mention the bot in allowed channels.`;
    await interaction.reply({ content: text, ephemeral: true });
  }
};
