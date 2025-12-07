module.exports = {
  event: 'ready',
  run: async (client) => {
    console.log(`${client.user.tag} (event ready) — online`);
  }
};
