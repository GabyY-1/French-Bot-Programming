require("dotenv").config();
const path = require("node:path");
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const { FbpCompiler } = require("../../dist/compiler");

if (!process.env.DISCORD_TOKEN) {
  console.error("La variable DISCORD_TOKEN est absente du fichier .env.");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let interactionActuelle;

const compiler = new FbpCompiler({
  nativeFunctions: {
    repond: () => {
      if (!interactionActuelle) return;
      return interactionActuelle.reply({ content: "Pong depuis FBP !" });
    }
  }
});

compiler.runFile(path.join(__dirname, "commandes.fbp"));

client.once(Events.ClientReady, async readyClient => {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const commands = [
    new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Teste une commande exécutée par FBP")
      .toJSON()
  ];

  try {
    await rest.put(Routes.applicationCommands(readyClient.user.id), { body: commands });
    console.log(`Connecté : ${readyClient.user.tag}`);
    console.log("Commande /ping enregistrée.");
  } catch (error) {
    console.error("Impossible d'enregistrer la commande /ping :", error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "ping") return;

  interactionActuelle = interaction;
  try {
    compiler.runFunction("ping");
  } catch (error) {
    console.error("Erreur FBP :", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Erreur pendant l'exécution FBP.", ephemeral: true });
    }
  } finally {
    interactionActuelle = undefined;
  }
});

client.login(process.env.DISCORD_TOKEN);
