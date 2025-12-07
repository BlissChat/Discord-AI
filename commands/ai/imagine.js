const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'imagine',
  slash: new SlashCommandBuilder().setName('imagine').setDescription('Generate an image (placeholder)')
    .addStringOption(o => o.setName('prompt').setDescription('Image prompt').setRequired(true)),
  execute: async (client, interaction) => {
    const prompt = interaction.options.getString('prompt');
    await interaction.reply({ content: 'Image generation placeholder — implement with an image API or Gemini image when available.', ephemeral: true });
  }
};
