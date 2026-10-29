const test = require("node:test");
const assert = require("node:assert/strict");
const { formatDiscordError } = require("../dist/discord-errors.js");

test("les limites de requêtes Discord ont un message français", () => {
  assert.match(formatDiscordError({ status: 429, retryAfter: 2500 }), /limite temporairement les requêtes/);
  assert.match(formatDiscordError({ status: 429, retryAfter: 2500 }), /3 seconde/);
});

test("les permissions manquantes sont expliquées clairement", () => {
  assert.match(formatDiscordError({ code: 50013 }), /permissions nécessaires/);
  assert.match(formatDiscordError({ code: 50001 }), /n'a pas accès/);
});

test("les erreurs Discord courantes ont une explication compréhensible", () => {
  assert.match(formatDiscordError({ code: 10003 }), /salon n'existe pas/);
  assert.match(formatDiscordError({ status: 500 }), /problème temporaire/);
  assert.match(formatDiscordError(new Error("échec inconnu")), /échec inconnu/);
});

test("les intents Gateway refusés ont une explication utile", () => {
  assert.match(formatDiscordError({ code: 4014 }), /intention Gateway/);
});

test("les tokens de bot ne sont pas reproduits dans les messages", () => {
  const token = "A".repeat(24) + "." + "B".repeat(6) + "." + "C".repeat(25);
  const result = formatDiscordError(new Error("Échec avec " + token));
  assert.doesNotMatch(result, /C{20,}/);
  assert.match(result, /token masqué/);
});

test("les secrets des URL de webhook sont masqués", () => {
  const webhook = "https://discord.com/api/webhooks/12345678901234567/" + "x".repeat(32);
  const result = formatDiscordError(new Error("Échec pour " + webhook));
  assert.doesNotMatch(result, /x{20,}/);
  assert.match(result, /masqué/);
});
