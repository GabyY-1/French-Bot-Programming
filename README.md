# FBP — French Bot Programming

FBP est un langage en cours de construction, avec un CLI et une syntaxe pensée pour rester simple.

## Prérequis

- Node.js 20 ou plus récent
- npm

## Installation dans le Codespace

```bash
npm install
npm run build
```

## Commandes du CLI

```bash
node dist/cli.js help
node dist/cli.js version
node dist/cli.js info
node dist/cli.js ping
node dist/cli.js run lancer
node dist/cli.js run test
node dist/cli.js run-file exemples/bot/main.fbp
```

Après compilation, `npm link` peut rendre la commande `fbp` disponible dans l'environnement Node local.

## Définir les commandes

Le fichier `commandes.fbp` est un objet JSON associant un nom de commande à un fichier :

```json
{
  "lancer": "exemples/bot/main.fbp",
  "test": "exemples/test.fbp"
}
```

Puis lance `node dist/cli.js run lancer`.

## Syntaxe prise en charge actuellement

```fbp
nom = "Gab"
niveau = 15
actif = true

lance() {
  affiche("Bonjour", nom)
}

lance()
```

- Les variables infèrent leur type à partir des valeurs littérales.
- Les fonctions sont déclarées avec `nom() {` puis fermées par `}`.
- `affiche(...)` affiche les valeurs dans le terminal.
- `import { fonction } de "./fichier.fbp"` est reconnu pour importer des fonctions.

## Limites actuelles

Cette version est un premier interpréteur, pas encore un compilateur complet. Les expressions arithmétiques, les paramètres de fonction, les conditions, les boucles, les valeurs de retour, la résolution complète des imports et la connexion réelle à Discord ne sont pas encore implémentés. `fbp ping` vérifie que le CLI répond ; il ne mesure pas la latence d'un bot Discord connecté.
