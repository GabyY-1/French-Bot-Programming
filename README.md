# FBP — French Bot Programming

FBP est un langage interprété par Node.js. Les fichiers source utilisent l'extension `.fbp`. Le paquet fournit le moteur et la commande `fbp`.

## Prérequis

- Node.js 20 ou plus récent
- npm

## Installation depuis npm

Quand le paquet sera publié sur npm :

```bash
npm install fbp-language
```

Puis, dans le `package.json` de ton projet :

```json
{
  "scripts": {
    "start": "fbp run lancer"
  },
  "dependencies": {
    "fbp-language": "^1.1.1"
  }
}
```

Lance le script avec `npm start`. npm rend la commande `fbp` disponible dans les scripts du projet.

## Créer un projet FBP

Crée un fichier `commandes.fbp` à la racine de ton projet. Malgré son extension, ce fichier est actuellement du JSON :

```json
{
  "lancer": "scripts/main.fbp"
}
```

Crée ensuite le fichier `scripts/main.fbp` :

```fbp
nom = "Mon projet"

lance() {
  affiche("FBP fonctionne !")
  affiche("Projet :", nom)
}

lance()
```

Les chemins déclarés dans `commandes.fbp` sont relatifs à la racine du projet.

## Commandes CLI

```bash
fbp help
fbp version
fbp info
fbp ping
fbp run lancer
fbp run-file scripts/main.fbp
```

- `fbp run <nom>` exécute la commande correspondante dans le fichier `commandes.fbp` du dossier courant.
- `fbp run-file <fichier>` exécute directement un fichier FBP.
- `fbp ping` vérifie que le CLI répond ; il ne se connecte pas à Discord.

## Syntaxe actuelle

```fbp
nom = "Gab"
niveau = 15
actif = true

lance() {
  affiche("Bonjour", nom)
}

lance()
```

- Types reconnus : texte, nombre et booléen.
- Les fonctions ne prennent pas encore de paramètres.
- `affiche(...)` écrit dans le terminal.
- `import { fonction } de "./fichier.fbp"` importe des fonctions.
- Les commentaires commencent par `//` ou `#`.

## Créer un bot Discord

Installe FBP dans le projet du bot, puis crée un fichier `.env` à la racine :

```env
DISCORD_TOKEN=ton_token_discord
```

Ne partage jamais ce fichier et ajoute `.env` à `.gitignore`.

Dans `scripts/main.fbp` :

```fbp
discordConnexion()
discordCommande("!ping", "Pong !")
discordCommande("!bonjour", "Salut !")
```

Associe `lancer` à `scripts/main.fbp` dans `commandes.fbp`, puis exécute `npx fbp run lancer`. Dans le portail développeur Discord, active **Message Content Intent**.

Les commandes texte exactes sont prises en charge pour l'instant. Les commandes slash ne le sont pas encore.

## Limites actuelles

FBP est encore un interpréteur de base. Les paramètres de fonction, les conditions, les boucles, les valeurs de retour et les expressions arithmétiques ne sont pas encore implémentés. La connexion Discord utilise un token stocké dans `.env`. Les commandes slash, les paramètres et les conditions ne sont pas encore implémentés.

## Développement du dépôt

```bash
npm install
npm test
```

Les fichiers d'essai internes se trouvent dans `tests/fixtures`. Ils ne font pas partie du paquet publié.
