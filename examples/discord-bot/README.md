# Bot Discord de test FBP

Ce bot est un exemple de pont entre FBP et JavaScript : la connexion Discord est gérée par discord.js, tandis que la commande `/ping` exécute la fonction `ping()` écrite en FBP.

## Lancer le bot

1. À la racine du dépôt, installe les dépendances :

   ```bash
   npm install
   ```

2. Copie `.env.example` vers un fichier `.env` à la racine du dépôt et renseigne `DISCORD_TOKEN`.

3. Dans le portail développeur Discord, active une application avec un bot et invite-le sur ton serveur avec les scopes `bot` et `applications.commands`.

4. Compile FBP et lance le bot :

   ```bash
   npm run build
   npm run test:bot
   ```

La commande globale `/ping` peut mettre un peu de temps à apparaître après son enregistrement. Ne publie jamais ton fichier `.env` ni ton token.
