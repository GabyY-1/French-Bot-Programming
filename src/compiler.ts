import fs from "node:fs";
import path from "node:path";
import { FbpError } from "./errors";
import { ApplicationCommandType, Client, ContextMenuCommandBuilder, EmbedBuilder, GatewayIntentBits, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, Partials, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";

type ValueType = "texte" | "nombre" | "booleen" | "inconnu";
type Statement =
  | { kind: "assign"; name: string; value: string; line: number }
  | { kind: "function"; name: string; body: Statement[]; line: number }
  | { kind: "call"; name: string; args: string[]; line: number }
  | { kind: "import"; names: string[]; source: string; line: number };

export interface RunOptions {
  onOutput?: (value: unknown) => void;
  connectDiscord?: boolean;
}

function valueType(value: string): ValueType {
  const v = value.trim();
  if (/^"(?:[^"\\]|\\.)*"$/.test(v) || /^'(?:[^'\\]|\\.)*'$/.test(v)) return "texte";
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return "nombre";
  if (v === "true" || v === "false") return "booleen";
  return "inconnu";
}

function splitArguments(raw: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote = "";
  let depth = 0;
  for (const char of raw) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function parseFile(file: string, source: string): Statement[] {
  const lines = source.split(/\r?\n/);
  const root: Statement[] = [];
  const stack: Array<{ name: string; line: number; body: Statement[] }> = [];
  const target = () => stack.length ? stack[stack.length - 1].body : root;

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const line = raw.trim();
    const lineNo = index + 1;
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;

    const importMatch = line.match(/^import\s*\{\s*([^}]+)\s*\}\s*de\s*(["'])(.+?)\2\s*$/);
    if (importMatch) {
      target().push({ kind: "import", names: importMatch[1].split(",").map(x => x.trim()), source: importMatch[3], line: lineNo });
      continue;
    }

    const functionMatch = line.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\(\s*\)\s*\{$/u);
    if (functionMatch) {
      const entry = { name: functionMatch[1], line: lineNo, body: [] as Statement[] };
      target().push({ kind: "function", ...entry });
      stack.push(entry);
      continue;
    }

    if (line === "}") {
      if (!stack.length) throw new FbpError("Accolade fermante sans fonction correspondante.", file, lineNo);
      stack.pop();
      continue;
    }

    const assignment = line.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+)$/u);
    if (assignment) {
      target().push({ kind: "assign", name: assignment[1], value: assignment[2].trim(), line: lineNo });
      continue;
    }

    const call = line.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\((.*)\)\s*;?$/u);
    if (call) {
      target().push({ kind: "call", name: call[1], args: splitArguments(call[2]), line: lineNo });
      continue;
    }

    throw new FbpError(`Syntaxe non reconnue : « ${line} ». Vérifie les parenthèses, les accolades et le signe =.`, file, lineNo);
  }

  if (stack.length) {
    const open = stack[stack.length - 1];
    throw new FbpError(`La fonction « ${open.name} » n'est pas fermée par }.`, file, open.line);
  }
  return root;
}

type DiscordOptionType = "texte" | "nombre" | "entier" | "booleen" | "salon" | "utilisateur" | "role";
type DiscordOption = { name: string; description: string; type: DiscordOptionType; required: boolean; choices?: Array<{ name: string; value: string | number }>; autocomplete?: boolean; minValue?: number; maxValue?: number };
type DiscordResponse =
  (
    | {
        type: "text";
        content: string;
        ephemeral?: boolean;
        deferred?: boolean;
        adminOnly?: boolean;
        roleAction?: "add" | "remove" | "check";
        memberAction?: "ban" | "kick" | "timeout" | "untimeout" | "nickname" | "unban";
        contentAction?: "send" | "read" | "edit" | "delete" | "react" | "pin" | "unpin" | "attach" | "create-channel" | "delete-channel" | "rename-channel" | "topic-channel" | "create-category" | "move-category" | "delete-category" | "channel-permission" | "create-thread" | "send-thread" | "close-thread";
        options?: DiscordOption[];
      }
    | {
        type: "embed";
        title: string;
        description: string;
        color: string;
        fields: Array<{ name: string; value: string; dynamic?: boolean }>;
        userOption?: { name: string; description: string };
        options?: DiscordOption[];
      }
  ) & {
    subcommands?: Array<{
      name: string;
      description: string;
      response: DiscordResponse;
    }>;
    groups?: Array<{
      name: string;
      description: string;
      subcommands: Array<{
        name: string;
        description: string;
        response: DiscordResponse;
      }>;
    }>;
  };

export class FbpCompiler {
  private variables = new Map<string, { type: ValueType; value: unknown }>();
  private functions = new Map<string, Statement & { kind: "function" }>();
  private imports = new Map<string, string>();
  private output: (value: unknown) => void;
  private connectDiscord: boolean;
  private discordClient?: Client;
  private discordCommands = new Map<string, DiscordResponse>();
  private discordContextCommands = new Map<string, "utilisateur" | "message">();
  private discordMemberEvents = new Map<string, string>();
  private discordEvents = new Map<string, string>();
  private useGuildMembersIntent = false;
  private useGuildPresencesIntent = false;
  private useMessageContentIntent = false;
  private useMessageReactionsIntent = false;
  private useVoiceStatesIntent = false;
  private useGuildModerationIntent = false;
  private useDirectMessagesIntent = false;

  constructor(options: RunOptions = {}) {
    this.output = options.onOutput ?? (value => console.log(value));
    this.connectDiscord = options.connectDiscord ?? true;
  }

  private resolveDiscordValue(
    source: string,
    interaction: import("discord.js").ChatInputCommandInteraction,
    selectedUser: import("discord.js").User | null,
    selectedMember: import("discord.js").GuildMember | null,
    optionValues: Map<string, string>
  ): string {
    const guild = interaction.guild;
    const values: Record<string, string> = {
      "serveur.nom": guild?.name ?? "Serveur indisponible",
      "serveur.id": guild?.id ?? "Indisponible",
      "serveur.creation": guild ? "<t:" + Math.floor(guild.createdTimestamp / 1000) + ":D>" : "Indisponible",
      "membres.nombre": guild ? String(guild.memberCount) : "Indisponible",
      "profil.nom": selectedMember?.displayName ?? selectedUser?.username ?? "Sélectionne un membre",
      "profil.id": selectedUser?.id ?? "Sélectionne un membre",
      "profil.avatar": selectedUser?.displayAvatarURL({ size: 256 }) ?? "Sélectionne un membre",
      "roles.nombre": guild ? String(guild.roles.cache.size) : "Indisponible",
      "salons.nombre": guild ? String(guild.channels.cache.size) : "Indisponible",
      "statistiques.membres": guild ? String(guild.memberCount) : "Indisponible",
      "statistiques.roles": guild ? String(guild.roles.cache.size) : "Indisponible",
      "statistiques.salons": guild ? String(guild.channels.cache.size) : "Indisponible",
      "latence": String(Math.max(0, Math.round(interaction.client.ws.ping))) + " ms",
      "avatar": selectedUser?.displayAvatarURL({ size: 256 }) ?? interaction.user.displayAvatarURL({ size: 256 })
    };
    const optionMatch = source.trim().match(/^option\.([a-z0-9_-]{1,32})$/);
    if (optionMatch) return optionValues.get(optionMatch[1]) ?? "Option indisponible : " + optionMatch[1];
    return source.trim() in values ? values[source.trim()] : "Source inconnue : " + source.trim();
  }

  private collectMemberIntents(statements: Statement[], baseDir: string, visited = new Set<string>()): void {
    for (const statement of statements) {
      if (statement.kind === "function") {
        this.collectMemberIntents(statement.body, baseDir, visited);
      } else if (statement.kind === "call" && statement.name === "evenementMembre") {
        const rawName = statement.args[0]?.trim() ?? "";
        const eventName = rawName.length >= 2 && (rawName[0] === '"' || rawName[0] === "'")
          ? rawName.slice(1, -1)
          : rawName;
        if (["arrivee", "depart", "pseudo", "roles", "statut"].includes(eventName)) this.useGuildMembersIntent = true;
        if (eventName === "statut") this.useGuildPresencesIntent = true;
      } else if (statement.kind === "call" && statement.name === "evenementMessage") {
        this.useMessageContentIntent = true;
      } else if (statement.kind === "call" && statement.name === "evenementReaction") {
        this.useMessageReactionsIntent = true;
      } else if (statement.kind === "call" && statement.name === "evenementVocal") {
        this.useVoiceStatesIntent = true;
      } else if (statement.kind === "call" && statement.name === "evenementPrive") {
        this.useDirectMessagesIntent = true;
      } else if (statement.kind === "call" && ["vocalRejoindre", "vocalQuitter", "evenementVocal"].includes(statement.name)) {
        this.useVoiceStatesIntent = true;
      } else if (statement.kind === "call" && statement.name === "evenementServeur") {
        const eventName = statement.args[0]?.replace(/^["']|["']$/g, "") ?? "";
        if (["bannissement", "debannissement", "moderation"].includes(eventName)) this.useGuildModerationIntent = true;
      } else if (statement.kind === "import") {
        const importedPath = path.resolve(baseDir, statement.source);
        if (!visited.has(importedPath) && fs.existsSync(importedPath) && fs.statSync(importedPath).isFile()) {
          visited.add(importedPath);
          const importedStatements = parseFile(importedPath, fs.readFileSync(importedPath, "utf8"));
          this.collectMemberIntents(importedStatements, path.dirname(importedPath), visited);
        }
      }
    }
  }

  runFile(filePath: string): void {
    const absolute = path.resolve(filePath);
    if (!fs.existsSync(absolute)) throw new FbpError(`Fichier introuvable : ${absolute}`);
    if (!fs.statSync(absolute).isFile()) throw new FbpError(`Le chemin indiqué n'est pas un fichier : ${absolute}`);
    const statements = parseFile(absolute, fs.readFileSync(absolute, "utf8"));
    this.useGuildMembersIntent = false;
    this.useGuildPresencesIntent = false;
    this.useMessageContentIntent = false;
    this.useMessageReactionsIntent = false;
    this.useVoiceStatesIntent = false;
    this.useGuildModerationIntent = false;
    this.useDirectMessagesIntent = false;
    this.collectMemberIntents(statements, path.dirname(absolute), new Set([absolute]));
    this.execute(statements, path.dirname(absolute));
  }

  private execute(statements: Statement[], baseDir: string): void {
    for (const statement of statements) {
      if (statement.kind === "import") {
        const targetFile = path.resolve(baseDir, statement.source);
        if (!fs.existsSync(targetFile)) throw new FbpError(`Fichier importé introuvable : ${statement.source}`);
        const nested = parseFile(targetFile, fs.readFileSync(targetFile, "utf8"));
        for (const item of nested) {
          if (item.kind === "function") this.functions.set(item.name, item);
        }
        for (const name of statement.names) {
          if (!this.functions.has(name)) throw new FbpError(`La fonction « ${name} » n'existe pas dans ${statement.source}.`);
          this.imports.set(name, targetFile);
        }
      } else if (statement.kind === "function") {
        if (this.functions.has(statement.name)) throw new FbpError(`La fonction « ${statement.name} » est définie plusieurs fois.`, undefined, statement.line);
        this.functions.set(statement.name, statement);
      } else if (statement.kind === "assign") {
        const type = valueType(statement.value);
        const previous = this.variables.get(statement.name);
        if (previous && type !== "inconnu" && previous.type !== "inconnu" && previous.type !== type) {
          throw new FbpError(`Type incompatible pour « ${statement.name} » : attendu ${previous.type}, reçu ${type}.`, undefined, statement.line);
        }
        const value = this.evaluate(statement.value, statement.line);
        this.variables.set(statement.name, { type: previous?.type ?? type, value });
      } else {
        this.call(statement.name, statement.args, statement.line, baseDir);
      }
    }
  }

  private evaluate(expression: string, line: number): unknown {
    const value = expression.trim();
    if (value === "true") return true;
    if (value === "false") return false;
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\(["'\\])/g, "$1");
    }
    if (this.variables.has(value)) return this.variables.get(value)!.value;
    throw new FbpError(`Valeur inconnue « ${value} ». Utilise un texte, un nombre, true, false ou une variable déclarée.`, undefined, line);
  }

  private call(name: string, args: string[], line: number, baseDir: string): void {
    const values = args.map(arg => this.evaluate(arg, line));
    if (name === "affiche") {
      this.output(values.map(value => value === undefined ? "" : String(value)).join(" "));
      return;
    }
    if (name === "connexion") {
      if (this.discordClient) throw new FbpError("La connexion Discord est déjà initialisée.", undefined, line);
      if (this.connectDiscord === false) {
        this.discordClient = {} as Client;
        return;
      }
      dotenv.config();
      const token = process.env.DISCORD_TOKEN;
      if (!token) throw new FbpError("Token Discord manquant. Ajoute DISCORD_TOKEN dans le fichier .env.", undefined, line);

      const intents = [
        GatewayIntentBits.Guilds,
        ...(this.useGuildMembersIntent ? [GatewayIntentBits.GuildMembers] : []),
        ...(this.useGuildPresencesIntent ? [GatewayIntentBits.GuildPresences] : []),
        ...(this.useMessageContentIntent ? [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] : []),
        ...(this.useMessageReactionsIntent ? [GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions] : []),
        ...(this.useVoiceStatesIntent ? [GatewayIntentBits.GuildVoiceStates] : []),
        ...(this.useDirectMessagesIntent ? [GatewayIntentBits.DirectMessages] : []),
        ...(this.useGuildModerationIntent ? [GatewayIntentBits.GuildModeration] : [])
      ];
      const client = new Client({
        intents,
        partials: [...(this.useMessageReactionsIntent ? [Partials.Message, Partials.Reaction, Partials.User] : []), ...(this.useMessageReactionsIntent || this.useDirectMessagesIntent ? [Partials.Channel] : [])]
      });
      this.discordClient = client;

      const renderMemberEvent = (template: string, member: import("discord.js").GuildMember | import("discord.js").PartialGuildMember, extra: Record<string, string> = {}) =>
        template.replace(/\{\{([a-z0-9_-]{1,32})\}\}/g, (match, key: string) => {
          const values: Record<string, string> = {
            membre: member.user.username,
            pseudo: member.displayName,
            id: member.id,
            serveur: member.guild.name,
            roles: member.roles.cache.filter(role => role.id !== member.guild.id).map(role => role.name).join(", ") || "Aucun rôle",
            ...extra
          };
          return values[key] ?? match;
        });

      client.on("guildMemberAdd", member => {
        const template = this.discordMemberEvents.get("arrivee");
        if (template) this.output(renderMemberEvent(template, member));
      });
      client.on("guildMemberRemove", member => {
        const template = this.discordMemberEvents.get("depart");
        if (template) this.output(renderMemberEvent(template, member));
      });
      client.on("guildMemberUpdate", async (before, after) => {
        const previousMember = before.partial ? await before.fetch().catch(() => null) : before;
        const currentMember = after.partial ? await after.fetch().catch(() => null) : after;
        if (!previousMember || !currentMember) return;
        if (previousMember.nickname !== currentMember.nickname || previousMember.user.username !== currentMember.user.username) {
          const template = this.discordMemberEvents.get("pseudo");
          if (template) this.output(renderMemberEvent(template, currentMember, {
            ancien: previousMember.displayName,
            nouveau: currentMember.displayName
          }));
        }
        const beforeRoles = previousMember.roles.cache.map(role => role.id).sort().join(",");
        const afterRoles = currentMember.roles.cache.map(role => role.id).sort().join(",");
        if (beforeRoles !== afterRoles) {
          const template = this.discordMemberEvents.get("roles");
          if (template) this.output(renderMemberEvent(template, currentMember, {
            anciens_roles: previousMember.roles.cache.filter(role => role.id !== previousMember.guild.id).map(role => role.name).join(", ") || "Aucun rôle",
            nouveaux_roles: currentMember.roles.cache.filter(role => role.id !== currentMember.guild.id).map(role => role.name).join(", ") || "Aucun rôle"
          }));
        }
      });
      client.on("presenceUpdate", (before, after) => {
        if (!after) return;
        const template = this.discordMemberEvents.get("statut");
        if (!template) return;
        const member = after.member;
        if (!member) return;
        const status = (presence: typeof before) => presence?.status ?? "inconnu";
        if (status(before) !== status(after)) {
          this.output(renderMemberEvent(template, member, {
            ancien: status(before),
            nouveau: status(after)
          }));
        }
      });


      const renderDiscordEvent = (key: string, values: Record<string, string>) => {
        const template = this.discordEvents.get(key);
        if (!template) return;
        this.output(template.replace(/\{\{([a-z0-9_-]{1,32})\}\}/g, (match, name: string) => values[name] ?? match));
      };

      client.on("messageCreate", message => {
          if (message.author.bot || !message.guild) return;
          renderDiscordEvent("message:recu", {
            pseudo: message.member?.displayName ?? message.author.username,
            membre: message.author.username,
            id: message.author.id,
            serveur: message.guild.name,
            salon: " #" + ((message.channel.isTextBased() && "name" in message.channel ? message.channel.name : message.channelId) ?? "inconnu"),
            message: message.content || "[message sans texte]",
            message_id: message.id,
            lien: message.url
          });
        });

      client.on("messageReactionAdd", async (reaction, user) => {
          if (user.bot) return;
          const resolvedReaction = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
          if (!resolvedReaction) return;
          const guild = resolvedReaction.message.guild;
          if (!guild) return;
          renderDiscordEvent("reaction:ajout", {
            pseudo: user.username ?? "inconnu",
            membre: user.username ?? "inconnu",
            id: user.id,
            serveur: guild.name,
            salon: ("name" in resolvedReaction.message.channel ? resolvedReaction.message.channel.name : resolvedReaction.message.channelId) ?? "inconnu",
            reaction: resolvedReaction.emoji.toString(),
            message_id: resolvedReaction.message.id
          });
        });

      client.on("messageReactionRemove", async (reaction, user) => {
          if (user.bot) return;
          const resolvedReaction = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
          if (!resolvedReaction) return;
          const guild = resolvedReaction.message.guild;
          if (!guild) return;
          renderDiscordEvent("reaction:retrait", {
            pseudo: user.username ?? "inconnu",
            membre: user.username ?? "inconnu",
            id: user.id,
            serveur: guild.name,
            salon: ("name" in resolvedReaction.message.channel ? resolvedReaction.message.channel.name : resolvedReaction.message.channelId) ?? "inconnu",
            reaction: resolvedReaction.emoji.toString(),
            message_id: resolvedReaction.message.id
          });
        });

      for (const interactionType of ["bouton", "menu", "formulaire"] as const) {
        const key = "interaction:" + interactionType;
        client.on("interactionCreate", interaction => {
          if (interactionType === "bouton" && !interaction.isButton()) return;
          if (interactionType === "menu" && !interaction.isStringSelectMenu() && !interaction.isUserSelectMenu() &&
              !interaction.isRoleSelectMenu() && !interaction.isChannelSelectMenu() && !interaction.isMentionableSelectMenu()) return;
          if (interactionType === "formulaire" && !interaction.isModalSubmit()) return;
          const user = interaction.user;
          const values: Record<string, string> = {
            pseudo: user.username ?? "inconnu",
            membre: user.username ?? "inconnu",
            id: user.id,
            serveur: interaction.guild?.name ?? "Message privé",
            salon: (interaction.channel && "name" in interaction.channel ? interaction.channel.name : interaction.channelId) ?? "inconnu",
            custom_id: "customId" in interaction ? interaction.customId : "inconnu",
            valeurs: interaction.isAnySelectMenu() ? interaction.values.join(", ") : "",
            formulaire: interaction.isModalSubmit()
              ? interaction.fields.fields.map(field => field.customId + ": " + ("value" in field ? field.value : field.values.join(", "))).join(" | ")
              : ""
          };
          renderDiscordEvent(key, values);
        });
      }

      client.on("voiceStateUpdate", (before, after) => {
          const member = after.member ?? before.member;
          if (!member) return;
          const eventName = !before.channelId && after.channelId
            ? "arrivee"
            : before.channelId && !after.channelId
              ? "depart"
              : "changement";
          if (!this.discordEvents.has("vocal:" + eventName)) return;
          renderDiscordEvent("vocal:" + eventName, {
            pseudo: member.displayName,
            membre: member.user.username,
            id: member.id,
            serveur: after.guild.name,
            ancien: before.channel?.name ?? "Aucun salon vocal",
            nouveau: after.channel?.name ?? "Aucun salon vocal",
            salon: after.channel?.name ?? before.channel?.name ?? "Aucun salon vocal"
          });
        });

      const serverEvents: Array<[string, string]> = [
        ["channelCreate", "salon_cree"],
        ["channelDelete", "salon_supprime"],
        ["channelUpdate", "salon_modifie"],
        ["roleCreate", "role_cree"],
        ["roleDelete", "role_supprime"],
        ["roleUpdate", "role_modifie"],
        ["guildBanAdd", "bannissement"],
        ["guildBanRemove", "debannissement"],
        ["guildUpdate", "serveur_modifie"]
      ];
      for (const [discordEvent, fbpEvent] of serverEvents) {
        client.on(discordEvent as never, ((...args: unknown[]) => {
          const first = args[0] as { name?: string; id?: string; guild?: { name: string }; user?: { username: string; id: string }; reason?: string };
          const second = args[1] as { name?: string; id?: string; guild?: { name: string }; user?: { username: string; id: string }; reason?: string } | undefined;
          const target = second ?? first;
          renderDiscordEvent("serveur:" + fbpEvent, {
            evenement: fbpEvent,
            nom: target.name ?? first.name ?? "inconnu",
            id: target.id ?? first.id ?? "inconnu",
            serveur: target.guild?.name ?? first.guild?.name ?? "Serveur",
            pseudo: target.user?.username ?? first.user?.username ?? "inconnu",
            membre: target.user?.username ?? first.user?.username ?? "inconnu",
            raison: target.reason ?? first.reason ?? "Aucun motif"
          });
        }) as never);
      }

      client.on("guildAuditLogEntryCreate", (entry, guild) => {
          renderDiscordEvent("serveur:moderation", {
            evenement: entry.action.toString(),
            id: entry.id,
            serveur: guild.name,
            pseudo: entry.executor?.username ?? "inconnu",
            membre: entry.target?.toString() ?? "inconnu",
            raison: entry.reason ?? "Aucun motif"
          });
        });

      client.once("ready", async () => {
        try {
          const commands = [...this.discordCommands.entries()].map(([commandName, response]) => {
            const builder = new SlashCommandBuilder()
              .setName(commandName)
              .setDescription(`Commande ${commandName} du bot FBP`);
            if (response.type === "embed" && response.userOption) {
              builder.addUserOption(option =>
                option.setName(response.userOption!.name)
                  .setDescription(response.userOption!.description)
                  .setRequired(false)
              );
            }
            if (response.type === "text" && response.roleAction) {
              builder.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);
              builder.addUserOption(option => option.setName("membre").setDescription("Membre concerné").setRequired(true));
              builder.addRoleOption(option => option.setName("role").setDescription("Rôle à gérer ou vérifier").setRequired(true));
            }
            if (response.type === "text" && response.memberAction) {
              const action = response.memberAction;
              const permission = action === "ban" || action === "unban"
                ? PermissionFlagsBits.BanMembers
                : action === "kick"
                  ? PermissionFlagsBits.KickMembers
                  : action === "nickname"
                    ? PermissionFlagsBits.ManageNicknames
                    : PermissionFlagsBits.ModerateMembers;
              builder.setDefaultMemberPermissions(permission);
              if (action === "unban") {
                builder.addStringOption(option => option.setName("utilisateur_id").setDescription("Identifiant Discord de l'utilisateur").setRequired(true));
              } else {
                builder.addUserOption(option => option.setName("membre").setDescription("Membre concerné").setRequired(true));
              }
              if (action === "timeout") builder.addIntegerOption(option => option.setName("minutes").setDescription("Durée du timeout en minutes (1 à 40320)").setMinValue(1).setMaxValue(40320).setRequired(true));
              if (action === "ban") builder.addStringOption(option => option.setName("raison").setDescription("Motif du bannissement").setRequired(false));
              if (action === "kick") builder.addStringOption(option => option.setName("raison").setDescription("Motif de l'expulsion").setRequired(false));
              if (action === "nickname") builder.addStringOption(option => option.setName("surnom").setDescription("Nouveau surnom, vide pour le retirer").setRequired(true));
            }
            if (response.type === "text" && response.contentAction) {
              const action = response.contentAction;
              const channelAdmin = ["create-channel", "delete-channel", "rename-channel", "topic-channel", "create-category", "move-category", "delete-category", "channel-permission"].includes(action);
              const permission = channelAdmin ? PermissionFlagsBits.ManageChannels
                : ["pin", "unpin", "delete", "edit"].includes(action) ? PermissionFlagsBits.ManageMessages
                : action === "read" ? PermissionFlagsBits.ViewChannel
                : action === "react" ? PermissionFlagsBits.AddReactions
                : action === "attach" ? PermissionFlagsBits.AttachFiles
                : action === "create-thread" ? PermissionFlagsBits.CreatePublicThreads
                : action === "close-thread" ? PermissionFlagsBits.ManageThreads
                : action === "send-thread" ? PermissionFlagsBits.SendMessagesInThreads
                : PermissionFlagsBits.SendMessages;
              builder.setDefaultMemberPermissions(permission);
              if (action === "create-channel") {
                builder.addStringOption(option => option.setName("nom").setDescription("Nom du salon").setRequired(true));
                builder.addStringOption(option => option.setName("type").setDescription("Type de salon").addChoices({ name: "Texte", value: "texte" }, { name: "Vocal", value: "vocal" }).setRequired(true));
              } else if (action === "create-category") {
                builder.addStringOption(option => option.setName("nom").setDescription("Nom de la catégorie").setRequired(true));
              } else if (action === "delete-category") {
                builder.addChannelOption(option => option.setName("categorie").setDescription("Catégorie à supprimer").setRequired(true));
              } else if (action === "move-category") {
                builder.addChannelOption(option => option.setName("salon").setDescription("Salon à déplacer").setRequired(true));
                builder.addChannelOption(option => option.setName("categorie").setDescription("Catégorie de destination").setRequired(true));
              } else if (action === "channel-permission") {
                builder.addChannelOption(option => option.setName("salon").setDescription("Salon concerné").setRequired(true));
                builder.addRoleOption(option => option.setName("role").setDescription("Rôle concerné").setRequired(true));
                builder.addStringOption(option => option.setName("permission").setDescription("Permission à modifier").addChoices({name:"Voir le salon",value:"ViewChannel"},{name:"Envoyer des messages",value:"SendMessages"},{name:"Lire l'historique",value:"ReadMessageHistory"},{name:"Joindre des fichiers",value:"AttachFiles"},{name:"Ajouter des réactions",value:"AddReactions"}).setRequired(true));
                builder.addStringOption(option => option.setName("etat").setDescription("Autoriser ou refuser").addChoices({name:"Autoriser",value:"allow"},{name:"Refuser",value:"deny"},{name:"Réinitialiser",value:"reset"}).setRequired(true));
              } else if (action === "delete-channel" || action === "rename-channel" || action === "topic-channel") {
                builder.addChannelOption(option => option.setName("salon").setDescription("Salon concerné").setRequired(true));
                if (action === "rename-channel") builder.addStringOption(option => option.setName("nom").setDescription("Nouveau nom").setRequired(true));
                if (action === "topic-channel") builder.addStringOption(option => option.setName("sujet").setDescription("Nouveau sujet").setRequired(true));
              } else if (action === "send" || action === "attach" || action === "read") {
                builder.addChannelOption(option => option.setName("salon").setDescription("Salon concerné").setRequired(action !== "send"));
                if (action === "send") builder.addStringOption(option => option.setName("message").setDescription("Message à envoyer").setRequired(true));
                if (action === "attach") {
                  builder.addStringOption(option => option.setName("url").setDescription("URL HTTPS du fichier").setRequired(true));
                  builder.addStringOption(option => option.setName("message").setDescription("Texte facultatif").setRequired(false));
                }
                if (action === "read") builder.addIntegerOption(option => option.setName("nombre").setDescription("Nombre de messages (1 à 100)").setMinValue(1).setMaxValue(100).setRequired(true));
              } else if (action === "send-thread") {
                builder.addChannelOption(option => option.setName("fil").setDescription("Fil de discussion").setRequired(true));
                builder.addStringOption(option => option.setName("message").setDescription("Message à envoyer").setRequired(true));
              } else if (action === "close-thread") {
                builder.addChannelOption(option => option.setName("fil").setDescription("Fil à fermer").setRequired(true));
              } else {
                builder.addChannelOption(option => option.setName("salon").setDescription("Salon concerné").setRequired(true));
                builder.addStringOption(option => option.setName("message_id").setDescription("Identifiant du message").setRequired(true));
                if (action === "edit") builder.addStringOption(option => option.setName("contenu").setDescription("Nouveau contenu").setRequired(true));
                if (action === "react") builder.addStringOption(option => option.setName("emoji").setDescription("Emoji à ajouter").setRequired(true));
                if (action === "create-thread") builder.addStringOption(option => option.setName("nom").setDescription("Nom du fil").setRequired(true));
              }
            }
            if (response.type === "text" && response.adminOnly) {
              builder.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
            }
            for (const subcommand of response.subcommands ?? []) {
              builder.addSubcommand(item => item.setName(subcommand.name).setDescription(subcommand.description));
            }
            for (const group of response.groups ?? []) {
              builder.addSubcommandGroup(groupBuilder => {
                groupBuilder.setName(group.name).setDescription(group.description);
                for (const subcommand of group.subcommands) {
                  groupBuilder.addSubcommand(item => item.setName(subcommand.name).setDescription(subcommand.description));
                }
                return groupBuilder;
              });
            }
            if (!(response.subcommands?.length || response.groups?.length)) for (const option of response.options ?? []) {
              const add = {
                texte: () => builder.addStringOption(item => {
                  item.setName(option.name).setDescription(option.description).setRequired(option.required);
                  if (option.autocomplete) item.setAutocomplete(true);
                  if (!option.autocomplete) for (const choice of option.choices ?? []) if (typeof choice.value === "string") item.addChoices({ name: choice.name, value: choice.value });
                  return item;
                }),
                nombre: () => builder.addNumberOption(item => {
                  item.setName(option.name).setDescription(option.description).setRequired(option.required);
                  if (option.autocomplete) item.setAutocomplete(true);
                  if (option.minValue !== undefined) item.setMinValue(option.minValue);
                  if (option.maxValue !== undefined) item.setMaxValue(option.maxValue);
                  if (!option.autocomplete) for (const choice of option.choices ?? []) if (typeof choice.value === "number") item.addChoices({ name: choice.name, value: choice.value });
                  return item;
                }),
                entier: () => builder.addIntegerOption(item => {
                  item.setName(option.name).setDescription(option.description).setRequired(option.required);
                  if (option.minValue !== undefined) item.setMinValue(option.minValue);
                  if (option.maxValue !== undefined) item.setMaxValue(option.maxValue);
                  for (const choice of option.choices ?? []) if (typeof choice.value === "number") item.addChoices({ name: choice.name, value: choice.value });
                  return item;
                }),
                booleen: () => builder.addBooleanOption(item => item.setName(option.name).setDescription(option.description).setRequired(option.required)),
                salon: () => builder.addChannelOption(item => item.setName(option.name).setDescription(option.description).setRequired(option.required)),
                utilisateur: () => builder.addUserOption(item => item.setName(option.name).setDescription(option.description).setRequired(option.required)),
                role: () => builder.addRoleOption(item => item.setName(option.name).setDescription(option.description).setRequired(option.required))
              }[option.type];
              add();
            }
            return builder.toJSON();
          });
          const contextCommands = [...this.discordContextCommands.entries()].map(([commandName, target]) =>
            new ContextMenuCommandBuilder()
              .setName(commandName)
              .setType(target === "utilisateur" ? ApplicationCommandType.User : ApplicationCommandType.Message)
              .toJSON()
          );
          const manager = client.application?.commands;
          if (!manager) throw new Error("L'application Discord n'est pas disponible.");
          const existing = await manager.fetch();
          for (const command of [...commands, ...contextCommands]) {
            const commandType = command.type ?? ApplicationCommandType.ChatInput;
            const registered = existing.find(item => item.name === command.name && item.type === commandType);
            if (registered) await manager.edit(registered.id, command);
            else await manager.create(command);
          }
          this.output("Connecté à Discord en tant que " + (client.user?.tag ?? "bot") + ".");
          this.output("Commandes FBP enregistrées : " + (commands.length + contextCommands.length) + ".");
        } catch (error: unknown) {
          this.output("Enregistrement des commandes slash impossible : " + (error instanceof Error ? error.message : String(error)));
        }
      });

      client.on("interactionCreate", async interaction => {
        if (interaction.isUserContextMenuCommand()) {
          await interaction.reply({ content: "Utilisateur sélectionné : " + interaction.targetUser.username + " (" + interaction.targetUser.id + ")", ephemeral: true });
          return;
        }
        if (interaction.isMessageContextMenuCommand()) {
          await interaction.reply({ content: "Message sélectionné : " + interaction.targetMessage.content.slice(0, 1800) + "\nID : " + interaction.targetMessage.id, ephemeral: true });
          return;
        }
        if (interaction.isAutocomplete()) {
          const response = this.discordCommands.get(interaction.commandName);
          if (!response) return;
          const focused = interaction.options.getFocused(true);
          const option = response.options?.find(item => item.name === focused.name && item.autocomplete);
          const query = String(focused.value).toLocaleLowerCase();
          const suggestions = (option?.choices ?? [])
            .filter(choice => choice.name.toLocaleLowerCase().includes(query) || String(choice.value).toLocaleLowerCase().includes(query))
            .slice(0, 25)
            .map(choice => ({ name: choice.name, value: choice.value }));
          await interaction.respond(suggestions).catch(() => undefined);
          return;
        }
        if (!interaction.isChatInputCommand()) return;
        const rootResponse = this.discordCommands.get(interaction.commandName);
        if (rootResponse === undefined) return;
        let response: DiscordResponse = rootResponse;
        if (rootResponse.subcommands?.length || rootResponse.groups?.length) {
          const groupName = interaction.options.getSubcommandGroup(false);
          const subcommandName = interaction.options.getSubcommand(false);
          const nested = groupName
            ? rootResponse.groups?.find(group => group.name === groupName)?.subcommands.find(subcommand => subcommand.name === subcommandName)
            : rootResponse.subcommands?.find(subcommand => subcommand.name === subcommandName);
          if (!nested) {
            await interaction.reply({ content: "Cette sous-commande FBP n'est pas configurée.", ephemeral: true });
            return;
          }
          response = nested.response;
        }
        try {
          if (response.type === "text" && response.adminOnly &&
              !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: "Cette commande est réservée aux administrateurs.", ephemeral: true });
            return;
          }
          if (response.type === "text" && response.memberAction) {
            if (!interaction.inGuild() || !interaction.guild) {
              await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
              return;
            }
            const guild = interaction.guild;
            const action = response.memberAction;
            const actor = await guild.members.fetch(interaction.user.id).catch(() => null);
            const requiredPermission = action === "ban" || action === "unban"
              ? PermissionFlagsBits.BanMembers
              : action === "kick"
                ? PermissionFlagsBits.KickMembers
                : action === "nickname"
                  ? PermissionFlagsBits.ManageNicknames
                  : PermissionFlagsBits.ModerateMembers;
            if (!actor?.permissions.has(requiredPermission)) {
              await interaction.reply({ content: "Tu n'as pas la permission nécessaire pour cette action.", ephemeral: true });
              return;
            }
            const botMember = guild.members.me;
            if (!botMember || !botMember.permissions.has(requiredPermission)) {
              await interaction.reply({ content: "Le bot ne possède pas la permission nécessaire.", ephemeral: true });
              return;
            }
            const reason = action === "ban" || action === "kick" ? interaction.options.getString("raison") ?? undefined : undefined;
            if (action === "unban") {
              const userId = interaction.options.getString("utilisateur_id", true).trim();
              if (!/^\d{17,20}$/.test(userId)) {
                await interaction.reply({ content: "L'identifiant Discord fourni est invalide.", ephemeral: true });
                return;
              }
              await guild.bans.remove(userId, "Débannissement via FBP");
              await interaction.reply({ content: "L'utilisateur a été débanni.", ephemeral: true });
              return;
            }
            const user = interaction.options.getUser("membre", true);
            const member = await guild.members.fetch(user.id).catch(() => null);
            if (!member) {
              await interaction.reply({ content: "Ce membre n'est pas présent sur le serveur.", ephemeral: true });
              return;
            }
            if (member.id === guild.ownerId || member.id === interaction.user.id ||
                member.roles.highest.position >= actor.roles.highest.position && interaction.user.id !== guild.ownerId ||
                member.roles.highest.position >= botMember.roles.highest.position) {
              await interaction.reply({ content: "Cette action est bloquée par la hiérarchie des rôles du serveur.", ephemeral: true });
              return;
            }
            if (action === "ban") await member.ban({ reason });
            else if (action === "kick") await member.kick(reason);
            else if (action === "timeout") {
              const minutes = interaction.options.getInteger("minutes", true);
              await member.timeout(minutes * 60_000, "Timeout via FBP");
            } else if (action === "untimeout") await member.timeout(null, "Fin du timeout via FBP");
            else if (action === "nickname") {
              const nickname = interaction.options.getString("surnom", true).trim();
              if (nickname.length > 32) {
                await interaction.reply({ content: "Un surnom ne peut pas dépasser 32 caractères.", ephemeral: true });
                return;
              }
              await member.setNickname(nickname || null, "Modification via FBP");
            }
            const labels: Record<string, string> = {
              ban: "Membre banni.",
              kick: "Membre expulsé.",
              timeout: "Timeout appliqué.",
              untimeout: "Timeout retiré.",
              nickname: "Surnom mis à jour."
            };
            await interaction.reply({ content: labels[action] ?? "Action effectuée.", ephemeral: true });
            return;
          }
          if (response.type === "text" && response.contentAction) {
            if (!interaction.inGuild() || !interaction.guild) {
              await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
              return;
            }
            const action = response.contentAction;
            const guild = interaction.guild;
            const actor = await guild.members.fetch(interaction.user.id).catch(() => null);
            const requiredPermissions = action === "read"
              ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
              : action === "attach"
                ? [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
                : action === "react"
                  ? [PermissionFlagsBits.AddReactions]
                  : action === "create-thread"
                    ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads]
                    : action === "send-thread"
                      ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessagesInThreads]
                      : action === "close-thread"
                        ? [PermissionFlagsBits.ManageThreads]
                        : ["create-channel", "delete-channel", "rename-channel", "topic-channel", "create-category", "move-category", "delete-category", "channel-permission"].includes(action)
                          ? [PermissionFlagsBits.ManageChannels]
                          : ["pin", "unpin", "delete", "edit"].includes(action)
                            ? [PermissionFlagsBits.ManageMessages]
                            : [PermissionFlagsBits.SendMessages];
            if (!actor || !requiredPermissions.every(permission => actor.permissions.has(permission))) {
              await interaction.reply({ content: "Tu n'as pas la permission nécessaire pour cette action.", ephemeral: true });
              return;
            }
            const botMember = guild.members.me;
            if (!botMember || !requiredPermissions.every(permission => botMember.permissions.has(permission))) {
              await interaction.reply({ content: "Le bot ne possède pas toutes les permissions nécessaires.", ephemeral: true });
              return;
            }
            if (action === "create-category") {
              const name = interaction.options.getString("nom", true).trim();
              if (!name || name.length > 100) {
                await interaction.reply({ content: "Le nom de la catégorie doit contenir de 1 à 100 caractères.", ephemeral: true });
                return;
              }
              const category = await guild.channels.create({ name, type: 4, reason: "Création via FBP" });
              await interaction.reply({ content: "Catégorie créée : " + category.toString(), ephemeral: true });
              return;
            }
            if (action === "close-thread") {
              const thread = interaction.options.getChannel("fil", true);
              if (!("isThread" in thread) || typeof thread.isThread !== "function" || !thread.isThread() || !("setArchived" in thread) || typeof thread.setArchived !== "function") {
                await interaction.reply({ content: "Le salon sélectionné n'est pas un fil de discussion.", ephemeral: true });
                return;
              }
              await thread.setArchived(true, "Fermeture via FBP");
              await interaction.reply({ content: "Fil archivé.", ephemeral: true });
              return;
            }
            if (action === "send-thread") {
              const thread = interaction.options.getChannel("fil", true);
              const content = interaction.options.getString("message", true);
              if (!("isThread" in thread) || typeof thread.isThread !== "function" || !thread.isThread() || !("send" in thread) || typeof thread.send !== "function") {
                await interaction.reply({ content: "Le salon sélectionné n'est pas un fil de discussion.", ephemeral: true });
                return;
              }
              if (content.length > 2000) {
                await interaction.reply({ content: "Un message Discord ne peut pas dépasser 2 000 caractères.", ephemeral: true });
                return;
              }
              await thread.send({ content });
              await interaction.reply({ content: "Message envoyé dans le fil.", ephemeral: true });
              return;
            }
            if (action === "create-thread") {
              const channelForThread = interaction.options.getChannel("salon", true);
              const id = interaction.options.getString("message_id", true).trim();
              const threadName = interaction.options.getString("nom", true).trim();
              if (!/^\d{17,20}$/.test(id) || !threadName || threadName.length > 100 ||
                  !("messages" in channelForThread) || !channelForThread.messages || typeof channelForThread.messages.fetch !== "function") {
                await interaction.reply({ content: "Salon, identifiant du message ou nom du fil invalide.", ephemeral: true });
                return;
              }
              const starter = await channelForThread.messages.fetch(id).catch(() => null);
              if (!starter || !("startThread" in starter) || typeof starter.startThread !== "function") {
                await interaction.reply({ content: "Impossible de créer un fil à partir de ce message.", ephemeral: true });
                return;
              }
              const thread = await starter.startThread({ name: threadName, reason: "Création via FBP" });
              await interaction.reply({ content: "Fil créé : " + thread.toString(), ephemeral: true });
              return;
            }
            if (action === "create-channel") {
              const name = interaction.options.getString("nom", true).trim();
              const type = interaction.options.getString("type", true);
              if (!/^[a-z0-9-_]{1,100}$/.test(name)) {
                await interaction.reply({ content: "Le nom du salon est invalide.", ephemeral: true });
                return;
              }
              const channel = await guild.channels.create({ name, type: type === "vocal" ? 2 : 0, reason: "Création via FBP" });
              await interaction.reply({ content: "Salon créé : " + channel.toString(), ephemeral: true });
              return;
            }
            if (action === "delete-category") {
              const category = interaction.options.getChannel("categorie", true);
              if (!("type" in category) || category.type !== 4 || !("guild" in category) || category.guild.id !== guild.id) {
                await interaction.reply({ content: "La catégorie sélectionnée est invalide.", ephemeral: true });
                return;
              }
              await category.delete("Suppression via FBP");
              await interaction.reply({ content: "Catégorie supprimée.", ephemeral: true });
              return;
            }
            if (action === "move-category") {
              const channelToMove = interaction.options.getChannel("salon", true);
              const category = interaction.options.getChannel("categorie", true);
              if (!("guild" in channelToMove) || channelToMove.guild.id !== guild.id || !("type" in category) || category.type !== 4 || !("setParent" in channelToMove) || typeof channelToMove.setParent !== "function") {
                await interaction.reply({ content: "Le salon ou la catégorie est invalide.", ephemeral: true });
                return;
              }
              await channelToMove.setParent(category.id, { lockPermissions: false, reason: "Déplacement via FBP" });
              await interaction.reply({ content: "Salon déplacé dans la catégorie.", ephemeral: true });
              return;
            }
            if (action === "channel-permission") {
              const channelForPermission = interaction.options.getChannel("salon", true);
              const role = interaction.options.getRole("role", true);
              const permissionName = interaction.options.getString("permission", true);
              const state = interaction.options.getString("etat", true);
              if (!("guild" in channelForPermission) || channelForPermission.guild.id !== guild.id || !("permissionOverwrites" in channelForPermission) || !channelForPermission.permissionOverwrites || typeof channelForPermission.permissionOverwrites.edit !== "function") {
                await interaction.reply({ content: "Ce salon ne prend pas en charge les permissions.", ephemeral: true });
                return;
              }
              const allowed = ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles", "AddReactions"];
              if (!allowed.includes(permissionName)) {
                await interaction.reply({ content: "Permission non prise en charge.", ephemeral: true });
                return;
              }
              const overwrite = state === "reset" ? null : { [permissionName]: state === "allow" };
              if (overwrite === null) await channelForPermission.permissionOverwrites.delete(role.id, "Réinitialisation via FBP");
              else await channelForPermission.permissionOverwrites.edit(role.id, overwrite, { reason: "Modification des permissions via FBP" });
              await interaction.reply({ content: "Permissions du salon mises à jour.", ephemeral: true });
              return;
            }
            const selectedChannel = interaction.options.getChannel("salon", !["send"].includes(action));
            if (action === "delete-channel" || action === "rename-channel" || action === "topic-channel") {
              if (!selectedChannel || !("guild" in selectedChannel) || selectedChannel.guild.id !== guild.id) {
                await interaction.reply({ content: "Salon invalide.", ephemeral: true });
                return;
              }
              if (action === "delete-channel") {
                await selectedChannel.delete("Suppression via FBP");
                await interaction.reply({ content: "Salon supprimé.", ephemeral: true });
              } else if (action === "rename-channel") {
                const newName = interaction.options.getString("nom", true).trim();
                if (!/^[a-z0-9-_]{1,100}$/.test(newName)) {
                  await interaction.reply({ content: "Le nom du salon est invalide.", ephemeral: true });
                  return;
                }
                await selectedChannel.setName(newName, "Modification via FBP");
                await interaction.reply({ content: "Salon renommé.", ephemeral: true });
              } else {
                if (!("setTopic" in selectedChannel) || typeof selectedChannel.setTopic !== "function") {
                  await interaction.reply({ content: "Ce type de salon ne prend pas en charge de sujet.", ephemeral: true });
                  return;
                }
                await selectedChannel.setTopic(interaction.options.getString("sujet", true).slice(0, 1024));
                await interaction.reply({ content: "Sujet du salon mis à jour.", ephemeral: true });
              }
              return;
            }
            const channel = selectedChannel ?? interaction.channel;
            if (!channel || !("send" in channel) || typeof channel.send !== "function") {
              await interaction.reply({ content: "Ce salon ne permet pas d'envoyer des messages.", ephemeral: true });
              return;
            }
            if (action === "read") {
              if (!("messages" in channel) || !channel.messages || typeof channel.messages.fetch !== "function") {
                await interaction.reply({ content: "Ce salon ne permet pas de lire l'historique.", ephemeral: true });
                return;
              }
              const count = interaction.options.getInteger("nombre", true);
              const messages = await channel.messages.fetch({ limit: count });
              const entries = [...messages.values()].reverse().map(message => {
                const text = message.content || (message.attachments.size ? "[pièce jointe]" : "[message sans texte]");
                return "[" + message.createdAt.toISOString() + "] " + message.author.username + ": " + text.slice(0, 350);
              });
              const pages: string[] = [];
              let page = "";
              for (const entry of entries) {
                const parts = entry.match(/[\s\S]{1,1700}/g) ?? [entry];
                for (const part of parts) {
                  const next = page ? page + "\n" + part : part;
                  if (next.length > 1900) {
                    pages.push(page);
                    page = part;
                  } else {
                    page = next;
                  }
                }
              }
              if (page) pages.push(page);
              if (!pages.length) pages.push("Aucun message trouvé.");
              await interaction.reply({ content: pages[0], ephemeral: true });
              for (const nextPage of pages.slice(1)) {
                await interaction.followUp({ content: nextPage, ephemeral: true });
              }
              return;
            }
            if (action === "attach") {
              const url = interaction.options.getString("url", true).trim();
              const messageText = interaction.options.getString("message") ?? undefined;
              let parsedUrl: URL;
              try { parsedUrl = new URL(url); } catch {
                await interaction.reply({ content: "L'URL du fichier est invalide.", ephemeral: true });
                return;
              }
              if (parsedUrl.protocol !== "https:") {
                await interaction.reply({ content: "Le fichier doit être accessible via une URL HTTPS.", ephemeral: true });
                return;
              }
              await channel.send({ content: messageText, files: [url] });
              await interaction.reply({ content: "Fichier envoyé.", ephemeral: true });
              return;
            }
            if (action === "send") {
              const content = interaction.options.getString("message", true);
              if (content.length > 2000) {
                await interaction.reply({ content: "Un message Discord ne peut pas dépasser 2 000 caractères.", ephemeral: true });
                return;
              }
              const sent = await channel.send({ content });
              await interaction.reply({ content: "Message envoyé : " + sent.url, ephemeral: true });
              return;
            }
            const messageId = interaction.options.getString("message_id", true).trim();
            if (!/^\d{17,20}$/.test(messageId) || !("messages" in channel) || !channel.messages || typeof channel.messages.fetch !== "function") {
              await interaction.reply({ content: "Identifiant de message ou salon invalide.", ephemeral: true });
              return;
            }
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) {
              await interaction.reply({ content: "Message introuvable dans ce salon.", ephemeral: true });
              return;
            }
            if (action === "edit") {
              const content = interaction.options.getString("contenu", true);
              if (content.length > 2000) {
                await interaction.reply({ content: "Un message Discord ne peut pas dépasser 2 000 caractères.", ephemeral: true });
                return;
              }
              if (message.author.id !== interaction.client.user?.id) {
                await interaction.reply({ content: "Le bot ne peut modifier que ses propres messages.", ephemeral: true });
                return;
              }
              await message.edit({ content });
              await interaction.reply({ content: "Message modifié.", ephemeral: true });
            } else if (action === "delete") {
              await message.delete();
              await interaction.reply({ content: "Message supprimé.", ephemeral: true });
            } else if (action === "react") {
              await message.react(interaction.options.getString("emoji", true));
              await interaction.reply({ content: "Réaction ajoutée.", ephemeral: true });
            } else if (action === "pin") {
              await message.pin();
              await interaction.reply({ content: "Message épinglé.", ephemeral: true });
            } else if (action === "unpin") {
              await message.unpin();
              await interaction.reply({ content: "Message désépinglé.", ephemeral: true });
            }
            return;
          }
          if (response.type === "text" && response.roleAction) {
            if (!interaction.inGuild() || !interaction.guild) {
              await interaction.reply({ content: "Cette commande doit être utilisée sur un serveur.", ephemeral: true });
              return;
            }
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
              await interaction.reply({ content: "Tu dois disposer de la permission Gérer les rôles.", ephemeral: true });
              return;
            }
            const targetUser = interaction.options.getUser("membre", true);
            const selectedRole = interaction.options.getRole("role", true);
            const guild = interaction.guild;
            const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
            const role = await guild.roles.fetch(selectedRole.id).catch(() => null);
            const botMember = guild.members.me;
            if (!targetMember || !role || !botMember) {
              await interaction.reply({ content: "Impossible de récupérer le membre, le rôle ou le bot sur ce serveur.", ephemeral: true });
              return;
            }
            const actor = await guild.members.fetch(interaction.user.id).catch(() => null);
            if (!actor || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
              await interaction.reply({ content: "Le bot doit avoir la permission Gérer les rôles.", ephemeral: true });
              return;
            }
            if (role.id === guild.id || role.managed ||
                role.position >= botMember.roles.highest.position ||
                (interaction.user.id !== guild.ownerId && role.position >= actor.roles.highest.position)) {
              await interaction.reply({ content: "Ce rôle ne peut pas être géré : vérifie tes permissions et la hiérarchie des rôles.", ephemeral: true });
              return;
            }
            if (targetMember.id === interaction.user.id ||
                (targetMember.roles.highest.position >= actor.roles.highest.position && interaction.user.id !== guild.ownerId)) {
              await interaction.reply({ content: "Tu ne peux pas modifier les rôles de ce membre en raison de la hiérarchie du serveur.", ephemeral: true });
              return;
            }
            if (response.roleAction === "add") await targetMember.roles.add(role, "Commande FBP de gestion des rôles");
            else if (response.roleAction === "remove") await targetMember.roles.remove(role, "Commande FBP de gestion des rôles");
            const content = response.roleAction === "check"
              ? (targetMember.roles.cache.has(role.id) ? targetMember.user.username + " possède le rôle " + role.name + "." : targetMember.user.username + " ne possède pas le rôle " + role.name + ".")
              : response.content.replace(/\{\{membre\}\}/g, targetMember.user.username).replace(/\{\{role\}\}/g, role.name);
            await interaction.reply({ content, ephemeral: response.ephemeral ?? false });
            return;
          }
          const optionValues = new Map<string, string>();
          for (const option of response.options ?? []) {
            let value: string | null = null;
            if (option.type === "texte") value = interaction.options.getString(option.name);
            else if (option.type === "utilisateur") {
              const user = interaction.options.getUser(option.name);
              value = user === null ? null : user.username;
            } else if (option.type === "role") {
              const role = interaction.options.getRole(option.name);
              value = role === null ? null : "<@&" + role.id + ">";
            } else if (option.type === "nombre") {
              const number = interaction.options.getNumber(option.name);
              value = number === null ? null : String(number);
            } else if (option.type === "entier") {
              const number = interaction.options.getInteger(option.name);
              value = number === null ? null : String(number);
            } else if (option.type === "booleen") {
              const boolean = interaction.options.getBoolean(option.name);
              value = boolean === null ? null : String(boolean);
            } else {
              const channel = interaction.options.getChannel(option.name);
              value = channel === null ? null : "#" + channel.name;
            }
            if (value === null && option.required) {
              await interaction.reply({ content: "Option obligatoire indisponible : " + option.name, ephemeral: true });
              return;
            }
            if (value !== null) optionValues.set(option.name, value);
          }
          if (response.type === "text") {
            const content = response.content.replace(/\{\{([a-z0-9_-]{1,32})\}\}/g, (match, name: string) =>
              optionValues.has(name) ? optionValues.get(name)! : match
            );
            if (response.deferred) {
              await interaction.deferReply({ ephemeral: response.ephemeral ?? false });
              await interaction.editReply({ content });
            } else {
              await interaction.reply({ content, ephemeral: response.ephemeral ?? false });
            }
          } else {
            const embed = new EmbedBuilder()
              .setTitle(response.title)
              .setDescription(response.description)
              .setColor(Number.parseInt(response.color.slice(1), 16));
            const guild = interaction.guild;
            const selectedUser = response.userOption ? interaction.options.getUser(response.userOption.name) : null;
            const selectedMember = selectedUser && guild ? await guild.members.fetch(selectedUser.id).catch(() => null) : null;
            if (response.userOption && selectedUser) optionValues.set(response.userOption.name, selectedMember?.displayName ?? selectedUser.username);
            const fields = response.fields.map(field => ({
              name: field.name,
              value: field.dynamic ? this.resolveDiscordValue(field.value, interaction, selectedUser, selectedMember, optionValues) : field.value.replace(/\{\{([a-z0-9_-]{1,32})\}\}/g, (match, name: string) => optionValues.get(name) ?? match),
              inline: false
            }));
            if (fields.length) embed.addFields(fields);
            await interaction.reply({ embeds: [embed] });
          }
        } catch (error: unknown) {
          const message = "Une erreur est survenue pendant l'exécution de cette commande.";
          this.output("Erreur Discord : " + (error instanceof Error ? error.message : String(error)));
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: message, ephemeral: true }).catch(() => undefined);
          }
        }
      });

      void client.login(token).catch((error: unknown) => this.output("Connexion Discord impossible : " + (error instanceof Error ? error.message : String(error))));
      return;
    }
    if (name === "commande") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 2 || typeof values[0] !== "string" || typeof values[1] !== "string") {
        throw new FbpError("Utilisation : commande(\"ping\", \"Pong !\").", undefined, line);
      }
      const commandName = values[0];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) {
        throw new FbpError("Le nom d'une commande slash doit contenir 1 à 32 caractères : lettres minuscules, chiffres, tirets ou underscores.", undefined, line);
      }
      this.discordCommands.set(commandName, { type: "text", content: values[1], options: [] });
      return;
    }
    if (name === "commandeAdmin") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 2 || values.some(value => typeof value !== "string")) {
        throw new FbpError("Utilisation : commandeAdmin(\"nom\", \"Réponse réservée aux administrateurs\").", undefined, line);
      }
      const [commandName, response] = values as string[];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) throw new FbpError("Le nom d'une commande slash doit contenir 1 à 32 caractères : lettres minuscules, chiffres, tirets ou underscores.", undefined, line);
      this.discordCommands.set(commandName, { type: "text", content: response, adminOnly: true, ephemeral: true, options: [] });
      return;
    }
    if (name === "commandeAjouterRole" || name === "commandeRetirerRole") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 1 || typeof values[0] !== "string") {
        throw new FbpError("Utilisation : commandeAjouterRole(\"ajouter-role\") ou commandeRetirerRole(\"retirer-role\").", undefined, line);
      }
      const commandName = values[0];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) throw new FbpError("Le nom d'une commande slash doit contenir 1 à 32 caractères : lettres minuscules, chiffres, tirets ou underscores.", undefined, line);
      this.discordCommands.set(commandName, {
        type: "text",
        content: name === "commandeAjouterRole" ? "Le rôle {{role}} a été ajouté à {{membre}}." : "Le rôle {{role}} a été retiré à {{membre}}.",
        roleAction: name === "commandeAjouterRole" ? "add" : "remove",
        ephemeral: true,
        options: []
      });
      return;
    }
    if (["commandeEnvoyerMessage", "commandeLireMessages", "commandeModifierMessage", "commandeSupprimerMessage", "commandeReagirMessage", "commandeEpinglerMessage", "commandeDesepinglerMessage", "commandeJoindreFichier", "commandeCreerSalon", "commandeSupprimerSalon", "commandeRenommerSalon", "commandeSujetSalon", "commandeCreerCategorie", "commandeSupprimerCategorie", "commandeDeplacerSalon", "commandePermissionSalon", "commandeCreerFil", "commandeEnvoyerFil", "commandeFermerFil"].includes(name)) {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 1 || typeof values[0] !== "string") {
        throw new FbpError("Utilisation : commandeEnvoyerMessage/ModifierMessage/SupprimerMessage/ReagirMessage/EpinglerMessage/DesepinglerMessage/CreerSalon/SupprimerSalon/RenommerSalon/SujetSalon(\"nom-commande\").", undefined, line);
      }
      const commandName = values[0];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) throw new FbpError("Le nom de la commande slash est invalide.", undefined, line);
      const actions: Record<string, NonNullable<Extract<DiscordResponse, { type: "text" }>["contentAction"]>> = {
        commandeEnvoyerMessage: "send",
        commandeLireMessages: "read",
        commandeModifierMessage: "edit",
        commandeSupprimerMessage: "delete",
        commandeReagirMessage: "react",
        commandeEpinglerMessage: "pin",
        commandeDesepinglerMessage: "unpin",
        commandeJoindreFichier: "attach",
        commandeCreerSalon: "create-channel",
        commandeSupprimerSalon: "delete-channel",
        commandeRenommerSalon: "rename-channel",
        commandeSujetSalon: "topic-channel",
        commandeCreerCategorie: "create-category",
        commandeSupprimerCategorie: "delete-category",
        commandeDeplacerSalon: "move-category",
        commandePermissionSalon: "channel-permission",
        commandeCreerFil: "create-thread",
        commandeEnvoyerFil: "send-thread",
        commandeFermerFil: "close-thread"
      };
      this.discordCommands.set(commandName, {
        type: "text",
        content: "Action effectuée.",
        contentAction: actions[name],
        ephemeral: true,
        options: []
      });
      return;
    }
    if (name === "evenementMessage" || name === "evenementReaction" || name === "evenementInteraction" || name === "evenementVocal" || name === "evenementServeur") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer un événement Discord.", undefined, line);
      if (values.length !== 2 || values.some(value => typeof value !== "string")) {
        throw new FbpError("Utilisation : evenementMessage/evenementReaction/evenementInteraction/evenementVocal/evenementServeur(\"type\", \"message\").", undefined, line);
      }
      const [eventName, template] = values as string[];
      const eventTypes: Record<string, string[]> = {
        evenementMessage: ["recu"],
        evenementReaction: ["ajout", "retrait"],
        evenementInteraction: ["bouton", "menu", "formulaire"],
        evenementVocal: ["arrivee", "depart", "changement"],
        evenementServeur: ["salon_cree", "salon_supprime", "salon_modifie", "role_cree", "role_supprime", "role_modifie", "bannissement", "debannissement", "serveur_modifie", "moderation"]
      };
      if (!eventTypes[name].includes(eventName)) {
        throw new FbpError("Type d'événement inconnu pour " + name + " : " + eventName + ".", undefined, line);
      }
      const prefixes: Record<string, string> = {
        evenementMessage: "message",
        evenementReaction: "reaction",
        evenementInteraction: "interaction",
        evenementVocal: "vocal",
        evenementServeur: "serveur"
      };
      this.discordEvents.set(prefixes[name] + ":" + eventName, template);
      return;
    }
    if (name === "evenementMembre") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer un événement membre.", undefined, line);
      if (values.length !== 2 || values.some(value => typeof value !== "string")) {
        throw new FbpError('Utilisation : evenementMembre("arrivee|depart|pseudo|roles|statut", "message").', undefined, line);
      }
      const [eventName, message] = values as string[];
      if (!["arrivee", "depart", "pseudo", "roles", "statut"].includes(eventName)) {
        throw new FbpError("Événement inconnu. Choisis arrivee, depart, pseudo, roles ou statut.", undefined, line);
      }
      this.discordMemberEvents.set(eventName, message);
      return;
    }
    if (name === "commandeBannir" || name === "commandeExpulser" || name === "commandeTimeout" ||
        name === "commandeRetirerTimeout" || name === "commandeSurnom" || name === "commandeDebannir") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 1 || typeof values[0] !== "string") {
        throw new FbpError("Utilisation : commandeBannir/Expulser/Timeout/RetirerTimeout/Surnom/Debannir(\"nom\").", undefined, line);
      }
      const commandName = values[0];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) throw new FbpError("Le nom de la commande slash est invalide.", undefined, line);
      const actions: Record<string, NonNullable<Extract<DiscordResponse, { type: "text" }>["memberAction"]>> = {
        commandeBannir: "ban",
        commandeExpulser: "kick",
        commandeTimeout: "timeout",
        commandeRetirerTimeout: "untimeout",
        commandeSurnom: "nickname",
        commandeDebannir: "unban"
      };
      this.discordCommands.set(commandName, {
        type: "text",
        content: "Action de modération effectuée.",
        memberAction: actions[name],
        ephemeral: true,
        options: []
      });
      return;
    }
    if (name === "commandeVerifierRole") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 1 || typeof values[0] !== "string") throw new FbpError('Utilisation : commandeVerifierRole("verifier-role").', undefined, line);
      const commandName = values[0];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) throw new FbpError("Le nom de la commande slash est invalide.", undefined, line);
      this.discordCommands.set(commandName, {
        type: "text",
        content: "Vérification du rôle effectuée.",
        roleAction: "check",
        ephemeral: true,
        options: []
      });
      return;
    }
    if (name === "commandeDifferee" || name === "commandeModifiable") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 2 || values.some(value => typeof value !== "string")) {
        throw new FbpError('Utilisation : commandeDifferee("nom", "réponse") ou commandeModifiable("nom", "réponse").', undefined, line);
      }
      const [commandName, response] = values as string[];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) throw new FbpError("Le nom d'une commande slash doit contenir 1 à 32 caractères : lettres minuscules, chiffres, tirets ou underscores.", undefined, line);
      this.discordCommands.set(commandName, { type: "text", content: response, deferred: true, options: [] });
      return;
    }
    if (name === "sousCommande") {
      if (values.length !== 4 || values.some(value => typeof value !== "string")) {
        throw new FbpError('Utilisation : sousCommande("commande", "nom", "description", "réponse").', undefined, line);
      }
      const [commandName, subName, description, content] = values as string[];
      const root = this.discordCommands.get(commandName);
      if (!root || root.type !== "text") throw new FbpError("La commande parente doit être une commande texte déjà déclarée.", undefined, line);
      if (!/^[a-z0-9_-]{1,32}$/.test(subName) || !description.trim() || description.length > 100) throw new FbpError("Le nom de la sous-commande ou sa description est invalide.", undefined, line);
      if (root.options?.length || root.roleAction || root.adminOnly) throw new FbpError("Une commande avec sous-commandes ne peut pas avoir d'options ou de restrictions sur la commande parente.", undefined, line);
      root.subcommands ??= [];
      if (root.subcommands.some(item => item.name === subName) || root.groups?.length) throw new FbpError("Cette sous-commande existe déjà ou la commande utilise déjà des groupes.", undefined, line);
      if (root.subcommands.length >= 25) throw new FbpError("Une commande ne peut pas contenir plus de 25 sous-commandes.", undefined, line);
      root.subcommands.push({ name: subName, description, response: { type: "text", content, options: [] } });
      return;
    }
    if (name === "groupeSousCommandes") {
      if (values.length !== 3 || values.some(value => typeof value !== "string")) {
        throw new FbpError('Utilisation : groupeSousCommandes("commande", "groupe", "description").', undefined, line);
      }
      const [commandName, groupName, description] = values as string[];
      const root = this.discordCommands.get(commandName);
      if (!root || root.type !== "text") throw new FbpError("La commande parente doit être une commande texte déjà déclarée.", undefined, line);
      if (!/^[a-z0-9_-]{1,32}$/.test(groupName) || !description.trim() || description.length > 100) throw new FbpError("Le nom du groupe ou sa description est invalide.", undefined, line);
      if (root.options?.length || root.roleAction || root.adminOnly || root.subcommands?.length) throw new FbpError("Une commande avec groupes ne peut pas avoir d'options ou de sous-commandes simples sur la commande parente.", undefined, line);
      root.groups ??= [];
      if (root.groups.some(item => item.name === groupName)) throw new FbpError("Ce groupe de sous-commandes existe déjà.", undefined, line);
      if (root.groups.length >= 25) throw new FbpError("Une commande ne peut pas contenir plus de 25 groupes.", undefined, line);
      root.groups.push({ name: groupName, description, subcommands: [] });
      return;
    }
    if (name === "sousCommandeGroupe") {
      if (values.length !== 5 || values.some(value => typeof value !== "string")) {
        throw new FbpError('Utilisation : sousCommandeGroupe("commande", "groupe", "nom", "description", "réponse").', undefined, line);
      }
      const [commandName, groupName, subName, description, content] = values as string[];
      const root = this.discordCommands.get(commandName);
      const group = root?.groups?.find(item => item.name === groupName);
      if (!root || !group) throw new FbpError("Le groupe de sous-commandes n'existe pas.", undefined, line);
      if (!/^[a-z0-9_-]{1,32}$/.test(subName) || !description.trim() || description.length > 100) throw new FbpError("Le nom de la sous-commande ou sa description est invalide.", undefined, line);
      if (group.subcommands.some(item => item.name === subName)) throw new FbpError("Cette sous-commande existe déjà dans ce groupe.", undefined, line);
      if (group.subcommands.length >= 25) throw new FbpError("Un groupe ne peut pas contenir plus de 25 sous-commandes.", undefined, line);
      group.subcommands.push({ name: subName, description, response: { type: "text", content, options: [] } });
      return;
    }
    if (name === "commandePrivee") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 2 || typeof values[0] !== "string" || typeof values[1] !== "string") {
        throw new FbpError("Utilisation : commandePrivee(\"nom\", \"réponse visible uniquement par l'utilisateur\").", undefined, line);
      }
      const [commandName, response] = values as string[];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) throw new FbpError("Le nom d'une commande slash doit contenir 1 à 32 caractères : lettres minuscules, chiffres, tirets ou underscores.", undefined, line);
      this.discordCommands.set(commandName, { type: "text", content: response, ephemeral: true, options: [] });
      return;
    }
    if (name === "commandeEmbed") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer une commande.", undefined, line);
      if (values.length !== 4 || values.some(value => typeof value !== "string")) {
        throw new FbpError("Utilisation : commandeEmbed(nom, titre, description, couleur).", undefined, line);
      }
      const [commandName, title, description, color] = values as string[];
      if (!/^[a-z0-9_-]{1,32}$/.test(commandName)) throw new FbpError("Le nom d'une commande slash doit contenir 1 à 32 caractères : lettres minuscules, chiffres, tirets ou underscores.", undefined, line);
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new FbpError("La couleur d'un embed doit être au format hexadécimal, par exemple #5865F2.", undefined, line);
      this.discordCommands.set(commandName, { type: "embed", title, description, color, fields: [], options: [] });
      return;
    }
    if (name === "champDynamique") {
      if (values.length !== 3 || values.some(value => typeof value !== "string")) {
        throw new FbpError("Utilisation : champDynamique(nomCommande, nomChamp, source).", undefined, line);
      }
      const [commandName, fieldName, source] = values as string[];
      const command = this.discordCommands.get(commandName);
      if (!command || command.type !== "embed") throw new FbpError("La commande « " + commandName + " » n'est pas un embed déclaré.", undefined, line);
      if (command.fields.length >= 25) throw new FbpError("Un embed Discord ne peut pas contenir plus de 25 champs.", undefined, line);
      if (!fieldName.trim() || !source.trim() || fieldName.length > 256 || source.length > 1024) throw new FbpError("Un champ dynamique doit avoir un nom et une source valides.", undefined, line);
      command.fields.push({ name: fieldName, value: source, dynamic: true });
      return;
    }
    if (name === "choixTexte" || name === "choixEntier") {
      if (values.length !== 4 || values.some(value => typeof value !== "string" && typeof value !== "number")) {
        throw new FbpError("Utilisation : choixTexte(nomCommande, nomOption, nomChoix, valeur) ou choixEntier(...).", undefined, line);
      }
      const [commandName, optionName, choiceName, choiceValue] = values;
      if (typeof commandName !== "string" || typeof optionName !== "string" || typeof choiceName !== "string") {
        throw new FbpError("Le nom de la commande, de l'option et du choix doivent être du texte.", undefined, line);
      }
      const command = this.discordCommands.get(commandName);
      if (!command) throw new FbpError("La commande « " + commandName + " » n'est pas déclarée.", undefined, line);
      const option = (command.options ?? []).find(item => item.name === optionName);
      const expectedType: DiscordOptionType = name === "choixTexte" ? "texte" : "entier";
      if (!option || option.type !== expectedType) throw new FbpError("L'option « " + optionName + " » n'existe pas ou n'a pas le bon type.", undefined, line);
      if (!choiceName.trim() || choiceName.length > 100) throw new FbpError("Le nom d'un choix doit contenir de 1 à 100 caractères.", undefined, line);
      if (expectedType === "texte" && typeof choiceValue !== "string") throw new FbpError("La valeur d'un choix texte doit être du texte.", undefined, line);
      if (expectedType === "entier" && (typeof choiceValue !== "number" || !Number.isInteger(choiceValue))) throw new FbpError("La valeur d'un choix entier doit être un nombre entier.", undefined, line);
      if (option.minValue !== undefined || option.maxValue !== undefined) throw new FbpError("Une option avec des limites numériques ne peut pas recevoir de choix prédéfinis.", undefined, line);
      const choices = option.choices ?? (option.choices = []);
      if (choices.some(choice => choice.name === choiceName || choice.value === choiceValue)) throw new FbpError("Ce nom ou cette valeur de choix existe déjà.", undefined, line);
      if (choices.length >= 25) throw new FbpError("Une option Discord ne peut pas contenir plus de 25 choix.", undefined, line);
      choices.push({ name: choiceName, value: choiceValue as string | number });
      return;
    }
    if (name === "suggestionAutocomplete") {
      if (values.length !== 4 || values.some(value => typeof value !== "string")) {
        throw new FbpError('Utilisation : suggestionAutocomplete("commande", "option", "libellé", "valeur").', undefined, line);
      }
      const [commandName, optionName, label, value] = values as string[];
      const command = this.discordCommands.get(commandName);
      const option = command?.options?.find(item => item.name === optionName);
      if (!option || !option.autocomplete) throw new FbpError("L'option d'autocomplétion n'existe pas ou n'est pas déclarée avec optionAutocompleteTexte.", undefined, line);
      if (!label.trim() || label.length > 100 || value.length > 100) throw new FbpError("Le libellé doit contenir 1 à 100 caractères et la valeur au maximum 100.", undefined, line);
      if (option.choices?.some(choice => choice.name === label || choice.value === value)) throw new FbpError("Cette suggestion existe déjà.", undefined, line);
      if ((option.choices?.length ?? 0) >= 25) throw new FbpError("Une option ne peut pas contenir plus de 25 suggestions.", undefined, line);
      (option.choices ??= []).push({ name: label, value });
      return;
    }
    if (name === "optionNombreLimites" || name === "optionEntierLimites") {
      if (values.length !== 4 || typeof values[0] !== "string" || typeof values[1] !== "string" || typeof values[2] !== "number" || typeof values[3] !== "number") {
        throw new FbpError("Utilisation : optionNombreLimites(commande, option, minimum, maximum) ou optionEntierLimites(...).", undefined, line);
      }
      const [commandName, optionName, minimum, maximum] = values as [string, string, number, number];
      const command = this.discordCommands.get(commandName);
      if (!command) throw new FbpError("La commande « " + commandName + " » n'est pas déclarée.", undefined, line);
      const expectedType: DiscordOptionType = name === "optionNombreLimites" ? "nombre" : "entier";
      const option = (command.options ?? []).find(item => item.name === optionName);
      if (!option || option.type !== expectedType) throw new FbpError("L'option « " + optionName + " » n'existe pas ou n'a pas le type numérique attendu.", undefined, line);
      if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum || (expectedType === "entier" && (!Number.isInteger(minimum) || !Number.isInteger(maximum)))) {
        throw new FbpError("Les limites doivent être des nombres valides, minimum inférieur ou égal au maximum ; elles doivent être entières pour une option entière.", undefined, line);
      }
      if (option.choices?.length) throw new FbpError("Une option avec des choix prédéfinis ne peut pas recevoir de limites numériques.", undefined, line);
      option.minValue = minimum;
      option.maxValue = maximum;
      return;
    }
    if (name === "optionTexte" || name === "optionNombre" || name === "optionEntier" || name === "optionBooleen" || name === "optionSalon" || name === "optionUtilisateur" || name === "optionRole" || name === "optionAutocompleteTexte") {
      if (values.length < 3 || values.length > 4 || values.some(value => typeof value !== "string" && typeof value !== "boolean")) {
        throw new FbpError("Utilisation : optionTexte/Nombre/Entier/Booleen/Salon(nomCommande, nomOption, description, obligatoire).", undefined, line);
      }
      const [commandName, optionName, description] = values;
      const required = values.length === 4 ? values[3] : false;
      if (typeof commandName !== "string" || typeof optionName !== "string" || typeof description !== "string" || typeof required !== "boolean") {
        throw new FbpError("Les trois premiers arguments doivent être du texte et le quatrième, facultatif, doit être true ou false.", undefined, line);
      }
      const command = this.discordCommands.get(commandName);
      if (!command) throw new FbpError("La commande « " + commandName + " » n'est pas déclarée.", undefined, line);
      if (!/^[a-z0-9_-]{1,32}$/.test(optionName)) throw new FbpError("Le nom de l'option doit contenir 1 à 32 caractères minuscules, chiffres, tirets ou underscores.", undefined, line);
      if (!description.trim() || description.length > 100) throw new FbpError("La description de l'option doit contenir 1 à 100 caractères.", undefined, line);
      const options = command.options ?? (command.options = []);
      if (options.some(option => option.name === optionName) || (command.type === "embed" && command.userOption?.name === optionName)) throw new FbpError("L'option « " + optionName + " » existe déjà pour cette commande.", undefined, line);
      if (options.length + (command.type === "embed" && command.userOption ? 1 : 0) >= 25) throw new FbpError("Une commande slash Discord ne peut pas contenir plus de 25 options.", undefined, line);
      const type: DiscordOptionType = name === "optionTexte" || name === "optionAutocompleteTexte" ? "texte" : name === "optionNombre" ? "nombre" : name === "optionEntier" ? "entier" : name === "optionBooleen" ? "booleen" : name === "optionSalon" ? "salon" : name === "optionUtilisateur" ? "utilisateur" : "role";
      options.push({ name: optionName, description, type, required, autocomplete: name === "optionAutocompleteTexte" });
      return;
    }
    if (name === "optionUtilisateur") {
      if (values.length !== 3 || values.some(value => typeof value !== "string")) {
        throw new FbpError("Utilisation : optionUtilisateur(nomCommande, nomOption, description).", undefined, line);
      }
      const [commandName, optionName, description] = values as string[];
      const command = this.discordCommands.get(commandName);
      if (!command || command.type !== "embed") throw new FbpError("La commande « " + commandName + " » n'est pas un embed déclaré.", undefined, line);
      if (!/^[a-z0-9_-]{1,32}$/.test(optionName)) throw new FbpError("Le nom de l'option doit contenir 1 à 32 caractères minuscules, chiffres, tirets ou underscores.", undefined, line);
      if (!description.trim() || description.length > 100) throw new FbpError("La description de l'option doit contenir 1 à 100 caractères.", undefined, line);
      const options = command.options ?? (command.options = []);
      if (options.some(option => option.name === optionName) || command.userOption?.name === optionName) throw new FbpError("L'option « " + optionName + " » existe déjà pour cette commande.", undefined, line);
      if (options.length + 1 > 25) throw new FbpError("Une commande slash Discord ne peut pas contenir plus de 25 options.", undefined, line);
      command.userOption = { name: optionName, description };
      return;
    }
    if (name === "champ") {
      if (values.length !== 3 || values.some(value => typeof value !== "string")) {
        throw new FbpError("Utilisation : champ(nomCommande, nomChamp, valeur).", undefined, line);
      }
      const [commandName, fieldName, fieldValue] = values as string[];
      const command = this.discordCommands.get(commandName);
      if (!command || command.type !== "embed") throw new FbpError("La commande « " + commandName + " » n'est pas un embed déclaré.", undefined, line);
      if (command.fields.length >= 25) throw new FbpError("Un embed Discord ne peut pas contenir plus de 25 champs.", undefined, line);
      if (!fieldName.trim() || !fieldValue.trim() || fieldName.length > 256 || fieldValue.length > 1024) throw new FbpError("Un champ doit avoir un nom (1 à 256 caractères) et une valeur (1 à 1024 caractères).", undefined, line);
      command.fields.push({ name: fieldName, value: fieldValue });
      return;
    }

    if (name === "commandeContextuelleUtilisateur" || name === "commandeContextuelleMessage") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant de déclarer une commande contextuelle.", undefined, line);
      if (values.length !== 1 || typeof values[0] !== "string") throw new FbpError('Utilisation : commandeContextuelleUtilisateur("nom") ou commandeContextuelleMessage("nom").', undefined, line);
      const commandName = values[0].trim();
      if (!commandName || commandName.length > 32) throw new FbpError("Le nom d’une commande contextuelle doit contenir de 1 à 32 caractères.", undefined, line);
      if (this.discordCommands.has(commandName) || this.discordContextCommands.has(commandName)) throw new FbpError("Une commande nommée « " + commandName + " » existe déjà.", undefined, line);
      this.discordContextCommands.set(commandName, name === "commandeContextuelleUtilisateur" ? "utilisateur" : "message");
      return;
    }
    if (name === "evenementCreer") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant evenementCreer().", undefined, line);
      if (values.length < 3 || values.length > 4 || values.some(value => typeof value !== "string")) throw new FbpError('Utilisation : evenementCreer("ID_SALON_VOCAL", "Nom", "Date ISO", "Description").', undefined, line);
      const [channelId, eventName, startValue, description = ""] = values as string[];
      const start = new Date(startValue);
      if (!/^\d{17,20}$/.test(channelId) || !eventName.trim() || eventName.length > 100 || Number.isNaN(start.getTime()) || start.getTime() <= Date.now() || description.length > 1000) throw new FbpError("Salon, nom, date ou description d’événement invalide.", undefined, line);
      void this.discordClient.channels.fetch(channelId).then(async channel => {
        if (!channel || !channel.isVoiceBased() || !("guild" in channel) || !channel.guild) throw new Error("Le salon indiqué doit être un salon vocal de serveur.");
        const guild = channel.guild as import("discord.js").Guild;
        const options = { name: eventName, description: description || undefined, scheduledStartTime: start, privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly, entityType: GuildScheduledEventEntityType.Voice, channel: channel.id } as Parameters<typeof guild.scheduledEvents.create>[0];
        return guild.scheduledEvents.create(options) as any;
      }).then((event: { name: string; id: string }) => this.output("Événement créé : " + event.name + " (ID " + event.id + ").")).catch(error => this.output("Échec de la création de l’événement : " + (error instanceof Error ? error.message : String(error))));
      return;
    }
    if (name === "messagePrive") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant messagePrive().", undefined, line);
      if (values.length !== 2 || values.some(v => typeof v !== "string")) throw new FbpError('Utilisation : messagePrive("ID_MEMBRE", "message").', undefined, line);
      const [userId, content] = values as string[];
      if (!/^\d{17,20}$/.test(userId) || !content.trim() || content.length > 2000) throw new FbpError("Identifiant Discord ou message invalide.", undefined, line);
      void this.discordClient.users.fetch(userId).then(user => user.send({ content })).then(() => this.output("Message privé envoyé.")).catch(error => this.output("Échec du message privé : " + String(error)));
      return;
    }
    if (name === "invitationCreer") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant invitationCreer().", undefined, line);
      if (values.length < 1 || values.length > 2 || typeof values[0] !== "string" || values.length === 2 && typeof values[1] !== "number") throw new FbpError('Utilisation : invitationCreer("ID_SALON", dureeEnSecondes).', undefined, line);
      const channelId = values[0], duration = values[1] ?? 3600;
      if (!/^\d{17,20}$/.test(channelId) || !Number.isInteger(duration) || (duration as number) < 0 || (duration as number) > 604800) throw new FbpError("Salon ou durée d'invitation invalide.", undefined, line);
      void this.discordClient.channels.fetch(channelId).then(channel => {
        if (!channel || !("createInvite" in channel) || typeof channel.createInvite !== "function") throw new Error("Ce salon ne permet pas de créer une invitation.");
        return channel.createInvite({ maxAge: duration as number, unique: true });
      }).then(invite => this.output("Invitation créée : " + invite.url)).catch(error => this.output("Échec de l'invitation : " + String(error)));
      return;
    }
    if (name === "sondageCreer") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant sondageCreer().", undefined, line);
      if (values.length < 4 || values.length > 7 || values.some(v => typeof v !== "string")) throw new FbpError('Utilisation : sondageCreer("ID_SALON", "Question", "Choix 1", "Choix 2", ...).', undefined, line);
      const [channelId, question, ...answers] = values as string[];
      if (!/^\d{17,20}$/.test(channelId) || !question.trim() || question.length > 300 || answers.length < 2 || answers.length > 5 || answers.some(a => !a.trim() || a.length > 55)) throw new FbpError("Le sondage doit contenir une question et de 2 à 5 choix valides.", undefined, line);
      void this.discordClient.channels.fetch(channelId).then(async channel => {
        if (!channel || !("send" in channel) || typeof channel.send !== "function") throw new Error("Ce salon ne permet pas de publier un sondage.");
        await channel.send({ poll: { question: { text: question }, answers: answers.map(text => ({ text })), duration: 24, allowMultiselect: false } });
      }).then(() => this.output("Sondage publié.")).catch(error => this.output("Échec du sondage : " + String(error)));
      return;
    }
    if (name === "webhookCreer") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant webhookCreer().", undefined, line);
      if (values.length !== 2 || values.some(v => typeof v !== "string")) throw new FbpError('Utilisation : webhookCreer("ID_SALON", "Nom").', undefined, line);
      const [channelId, webhookName] = values as string[];
      if (!/^\d{17,20}$/.test(channelId) || !webhookName.trim() || webhookName.length > 80) throw new FbpError("Salon ou nom de webhook invalide.", undefined, line);
      void this.discordClient.channels.fetch(channelId).then(channel => {
        if (!channel || !("createWebhook" in channel) || typeof channel.createWebhook !== "function") throw new Error("Ce salon ne permet pas de créer un webhook.");
        return channel.createWebhook({ name: webhookName });
      }).then(webhook => this.output("Webhook créé : " + webhook.url)).catch(error => this.output("Échec du webhook : " + String(error)));
      return;
    }
    if (name === "webhookEnvoyer") {
      if (values.length !== 2 || values.some(v => typeof v !== "string")) throw new FbpError('Utilisation : webhookEnvoyer("URL_WEBHOOK", "message").', undefined, line);
      const [webhookUrl, content] = values as string[];
      let parsed: URL;
      try { parsed = new URL(webhookUrl); } catch { throw new FbpError("URL de webhook invalide.", undefined, line); }
      if (parsed.protocol !== "https:" || !["discord.com", "discordapp.com"].includes(parsed.hostname) || !parsed.pathname.startsWith("/api/webhooks/") || !content.trim() || content.length > 2000) throw new FbpError("URL Discord ou message de webhook invalide.", undefined, line);
      void import("discord.js").then(({ WebhookClient }) => new WebhookClient({ url: webhookUrl }).send({ content })).then(() => this.output("Message envoyé par webhook.")).catch(error => this.output("Échec du webhook : " + String(error)));
      return;
    }
    if (name === "evenementPrive") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant evenementPrive().", undefined, line);
      if (values.length !== 1 || typeof values[0] !== "string") throw new FbpError('Utilisation : evenementPrive("message").', undefined, line);
      const template = values[0];
      this.discordClient.on("messageCreate", message => {
        if (message.guild || message.author.bot) return;
        this.output(template.replace(/\{\{([a-z0-9_-]{1,32})\}\}/g, (match, key: string) => ({ pseudo: message.author.username, id: message.author.id, message: message.content, message_id: message.id }[key] ?? match)));
      });
      return;
    }
    if (name === "vocalRejoindre") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant vocalRejoindre().", undefined, line);
      if (values.length !== 1 || typeof values[0] !== "string" || !/^\d{17,20}$/.test(values[0])) throw new FbpError('Utilisation : vocalRejoindre("ID_SALON_VOCAL").', undefined, line);
      const channelId = values[0];
      void this.discordClient.channels.fetch(channelId).then(async channel => {
        if (!channel || !channel.isVoiceBased() || !("guild" in channel) || !channel.guild) throw new Error("Le salon indiqué n'est pas un salon vocal valide.");
        const voice = await import("@discordjs/voice");
        const connection = voice.joinVoiceChannel({ channelId: channel.id, guildId: channel.guild.id, adapterCreator: channel.guild.voiceAdapterCreator, selfDeaf: true });
        await voice.entersState(connection, voice.VoiceConnectionStatus.Ready, 15_000);
        this.output("Connecté au salon vocal : " + ("name" in channel ? channel.name : channel.id));
      }).catch(error => this.output("Échec de la connexion vocale : " + (error instanceof Error ? error.message : String(error))));
      return;
    }
    if (name === "vocalQuitter") {
      if (!this.discordClient) throw new FbpError("Appelle connexion() avant vocalQuitter().", undefined, line);
      if (values.length > 1 || values.length === 1 && typeof values[0] !== "string") throw new FbpError('Utilisation : vocalQuitter("ID_SERVEUR").', undefined, line);
      const guildId = values[0] as string | undefined;
      if (guildId && !/^\d{17,20}$/.test(guildId)) throw new FbpError("Identifiant de serveur invalide.", undefined, line);
      void import("@discordjs/voice").then(({ getVoiceConnection }) => {
        const connection = guildId ? getVoiceConnection(guildId) : [...this.discordClient!.guilds.cache.keys()].map(id => getVoiceConnection(id)).find(Boolean);
        if (!connection) throw new Error("Le bot n'est connecté à aucun salon vocal correspondant.");
        connection.destroy();
        this.output("Connexion vocale fermée.");
      }).catch(error => this.output("Échec de la déconnexion vocale : " + (error instanceof Error ? error.message : String(error))));
      return;
    }
    if (name === "ping") {
      this.output("FBP fonctionne. Cette commande ne vérifie pas à elle seule une connexion Discord.");
      return;
    }
    const fn = this.functions.get(name);
    if (!fn) throw new FbpError(`Fonction « ${name} » inconnue. Vérifie son nom ou son import.`, undefined, line);
    this.execute(fn.body, this.imports.has(name) ? path.dirname(this.imports.get(name)!) : baseDir);
  }
}
