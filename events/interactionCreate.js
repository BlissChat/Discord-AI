const path = require('path');
const fs = require('fs');

module.exports = {
  event: 'interactionCreate',
  run: async (client, interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;
      const name = interaction.commandName;
      // walk /commands for module with name matching exported 'name'
      const commandsDir = path.join(__dirname, '..', 'commands');

      function findCommand(dir) {
        for (const f of fs.readdirSync(dir)) {
          const full = path.join(dir, f);
          if (fs.statSync(full).isDirectory()) {
            const m = findCommand(full);
            if (m) return m;
          } else if (f.endsWith('.js')) {
            const mod = require(full);
            if (mod.name === name && typeof mod.execute === 'function') return mod;
          }
        }
        return null;
      }

      const cmd = findCommand(commandsDir);
      if (!cmd) return interaction.reply({ content: 'Command not found', ephemeral: true });
      await cmd.execute(client, interaction);
    } catch (err) {
      console.error('interactionCreate error', err);
      try {
        if (!interaction.replied) await interaction.reply({ content: 'Error handling command', ephemeral: true });
      } catch {}
    }
  }
};
