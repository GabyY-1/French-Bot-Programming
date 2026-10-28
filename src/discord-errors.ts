type DiscordErrorShape = {
  code?: string | number;
  status?: number;
  rawError?: { code?: string | number; message?: string };
  retryAfter?: number;
  message?: string;
};

export function formatDiscordError(error: unknown): string {
  const value = error && typeof error === "object" ? error as DiscordErrorShape : {};
  const code = String(value.code ?? value.rawError?.code ?? "");
  const status = value.status;
  const message = String(value.message ?? "");

  if (status === 429 || code === "429" || /rate.?limit/i.test(message)) {
    const retryAfter = typeof value.retryAfter === "number" && Number.isFinite(value.retryAfter)
      ? Math.max(1, Math.ceil(value.retryAfter / 1000))
      : undefined;
    return retryAfter
      ? `Discord limite temporairement les requêtes. Réessaie dans environ ${retryAfter} seconde(s).`
      : "Discord limite temporairement les requêtes. Réessaie dans quelques instants.";
  }

  if (code === "50001" || code === "MISSING_ACCESS") {
    return "Le bot n'a pas accès à cette ressource. Vérifie qu'il est toujours sur le serveur et qu'il peut voir le salon.";
  }
  if (code === "50013" || code === "MISSING_PERMISSIONS") {
    return "Le bot n'a pas les permissions nécessaires pour cette action.";
  }
  if (code === "10003" || code === "UNKNOWN_CHANNEL") {
    return "Ce salon n'existe pas ou n'est pas accessible au bot.";
  }
  if (code === "10007" || code === "UNKNOWN_MEMBER") {
    return "Ce membre est introuvable sur le serveur.";
  }
  if (code === "10013" || code === "UNKNOWN_USER") {
    return "Cet utilisateur est introuvable.";
  }
  if (status === 401 || status === 403) {
    return "Discord a refusé la requête. Vérifie le token du bot et ses permissions.";
  }
  if (status === 400 || code === "50035" || code === "INVALID_FORM_BODY") {
    return "Discord a refusé les données envoyées. Vérifie les valeurs et les limites de cette commande.";
  }
  if (status !== undefined && status >= 500) {
    return "Le service Discord rencontre un problème temporaire. Réessaie plus tard.";
  }
  if (/\b(?:token|authorization)\s*[:=]/i.test(message)) {
    return "Une erreur Discord est survenue. Les détails sensibles ont été masqués.";
  }

  const safeMessage = message
    .replace(/(Bot\s+)[A-Za-z0-9._-]{20,}/gi, "$1[masqué]")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{20,}/gi, "$1[masqué]")
    .replace(/(discord(?:app)?\.com\/api\/webhooks\/\d+\/)[^\s/]+/gi, "$1[masqué]")
    .trim();

  return safeMessage || "Une erreur Discord inconnue est survenue.";
}
