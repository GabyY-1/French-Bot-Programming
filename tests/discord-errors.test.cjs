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

test("les tokens de bot ne sont pas reproduits dans les messages", () => {
  const result = formatDiscordError(new Error("Bot abcdefghijklmnopqrstuvwxyz1234567890"));
  assert.doesNotMatch(result, /abcdefghijklmnopqrstuvwxyz1234567890/);
  assert.match(result, /masqué/);
});
