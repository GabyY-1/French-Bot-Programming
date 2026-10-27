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
    "fbp-language": "^1.1.6"
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
discordCommande("ping", "Pong !")
discordCommande("bonjour", "Salut !")
discordCommandeEmbed("serveur-info", "Informations du serveur", "Voici les informations disponibles.", "#5865F2")
discordChamp("serveur-info", "Nom", "Mon serveur")
discordChamp("serveur-info", "Membres", "42")
```

Associe `lancer` à `scripts/main.fbp` dans `commandes.fbp`, puis exécute `npx fbp run lancer`. Dans le portail développeur Discord, vérifie que le bot est invité sur ton serveur avec les scopes `bot` et `applications.commands`. Seul l'intent serveur (`Guilds`) est nécessaire.

FBP enregistre les commandes déclarées comme commandes slash globales de l'application Discord. Leur apparition peut prendre un peu de temps après le premier enregistrement. Les noms doivent contenir de 1 à 32 caractères parmi les lettres minuscules, chiffres, tirets et underscores.

## Limites actuelles

FBP est encore un interpréteur de base. Les paramètres de fonction, les conditions, les boucles, les valeurs de retour et les expressions arithmétiques ne sont pas encore implémentés. La connexion Discord utilise un token stocké dans `.env`. Les commandes slash peuvent répondre avec un texte fixe ou un embed défini avec `discordCommandeEmbed(nom, titre, description, couleur)`. Ajoute des champs avec `discordChamp(nomCommande, nomChamp, valeur)`. Les valeurs des embeds sont actuellement fixes : la récupération dynamique des informations du serveur, les options, paramètres, permissions avancées et conditions ne sont pas encore implémentés.

## Développement du dépôt

```bash
npm install
npm test
```

Les fichiers d'essai internes se trouvent dans `tests/fixtures`. Ils ne font pas partie du paquet publié.


## Informations Discord dynamiques (v1.1.6)

Les champs d'un embed peuvent récupérer les informations accessibles au moment où la commande est utilisée. Exemple :

```fbp
discordConnexion()
discordCommandeEmbed("serveur-info", "Informations du serveur", "Données actuelles", "#5865F2")
discordChampDynamique("serveur-info", "Nom", "discordServeur.nom")
discordChampDynamique("serveur-info", "Identifiant", "discordServeur.id")
discordChampDynamique("serveur-info", "Création", "discordServeur.creation")
discordChampDynamique("serveur-info", "Membres", "discordMembres.nombre")
discordChampDynamique("serveur-info", "Rôles", "discordRoles.nombre")
discordChampDynamique("serveur-info", "Salons", "discordSalons.nombre")
discordChampDynamique("serveur-info", "Latence", "discordLatence")
discordOptionUtilisateur("serveur-info", "membre", "Membre à afficher")
discordChampDynamique("serveur-info", "Profil", "discordProfil.nom")
discordChampDynamique("serveur-info", "Avatar", "discordAvatar")
```

Sources disponibles : `discordServeur.nom`, `discordServeur.id`, `discordServeur.creation`, `discordMembres.nombre`, `discordProfil.nom`, `discordProfil.id`, `discordProfil.avatar`, `discordRoles.nombre`, `discordSalons.nombre`, `discordStatistiques.membres`, `discordStatistiques.roles`, `discordStatistiques.salons`, `discordLatence` et `discordAvatar`. `discordOptionUtilisateur(nomCommande, nomOption, description)` ajoute un sélecteur facultatif de membre à une commande embed. Les données accessibles dépendent des permissions et du cache Discord du bot.


## Options des commandes slash (v1.1.6)

Les commandes slash peuvent maintenant recevoir des options texte, nombre, entier ou booléen. Le dernier argument indique si l'option est obligatoire ; il est facultatif et vaut `false` par défaut.

```fbp
discordConnexion()
discordCommande("bonjour", "Salut {{prenom}} !")
discordOptionTexte("bonjour", "prenom", "Ton prénom", true)
discordOptionEntier("bonjour", "age", "Ton âge")
discordOptionNombre("bonjour", "note", "Une valeur décimale")
discordOptionBooleen("bonjour", "confirme", "Confirmer ?")
```

Dans une réponse texte, `{{prenom}}` est remplacé par la valeur saisie. Pour les embeds, les champs dynamiques peuvent lire une option avec `discordChampDynamique("commande", "Champ", "option.prenom")` (ou `discordOption.prenom`). Les options absentes ne sont pas remplacées et une option obligatoire inaccessible produit une réponse d'erreur.

Fonctions disponibles :

- `discordOptionTexte(commande, nom, description, obligatoire)`
- `discordOptionNombre(commande, nom, description, obligatoire)`
- `discordOptionEntier(commande, nom, description, obligatoire)`
- `discordOptionBooleen(commande, nom, description, obligatoire)`
- `discordOptionUtilisateur(commande, nom, description)` pour le sélecteur de membre existant des commandes embed.

Les noms d'options doivent respecter les règles Discord (minuscules, chiffres, tirets et underscores, 1 à 32 caractères). Une commande peut avoir jusqu'à 25 options. Les types d'options sont déclarés lors de l'enregistrement des commandes ; redémarre le bot après avoir modifié leur définition. Le bot a besoin du scope `applications.commands` et de l'accès au serveur concerné. Aucun intent privilégié supplémentaire n'est requis pour ces options.


## Choix prédéfinis des options (v1.1.6)

Pour limiter les réponses possibles d'une option, ajoute des choix après avoir déclaré l'option :

```fbp
discordConnexion()
discordCommande("couleur", "Couleur choisie : {{couleur}}")
discordOptionTexte("couleur", "couleur", "Choisis une couleur", true)
discordChoixTexte("couleur", "couleur", "Bleu", "bleu")
discordChoixTexte("couleur", "couleur", "Rouge", "rouge")

discordCommande("difficulte", "Niveau choisi : {{niveau}}")
discordOptionEntier("difficulte", "niveau", "Choisis un niveau", true)
discordChoixEntier("difficulte", "niveau", "Facile", 1)
discordChoixEntier("difficulte", "niveau", "Normal", 2)
discordChoixEntier("difficulte", "niveau", "Difficile", 3)
```

- `discordChoixTexte(commande, option, nomChoix, valeur)` ajoute un choix à une option texte.
- `discordChoixEntier(commande, option, nomChoix, valeur)` ajoute un choix à une option entière.
- Déclare toujours l'option avant ses choix.
- Une option peut avoir jusqu'à 25 choix. Les noms de choix sont limités à 100 caractères.
- Les choix sont présentés par Discord sous forme de liste et la valeur choisie est récupérable comme les autres options.


## Limites numériques des options (v1.1.7)

Les options slash de type nombre et entier peuvent imposer une valeur minimale et maximale. Déclare l'option d'abord, puis ses limites :

```fbp
discordConnexion()
discordCommande("age", "Âge sélectionné : {{age}}")
discordOptionEntier("age", "age", "Choisis un âge", true)
discordOptionEntierLimites("age", "age", 13, 99)

discordCommande("note", "Note sélectionnée : {{note}}")
discordOptionNombre("note", "note", "Choisis une note", true)
discordOptionNombreLimites("note", "note", 0, 20)
```

- `discordOptionEntierLimites(commande, option, minimum, maximum)` accepte uniquement des bornes entières.
- `discordOptionNombreLimites(commande, option, minimum, maximum)` accepte des bornes numériques, y compris décimales.
- Le minimum doit être inférieur ou égal au maximum.
- Les limites s'appliquent à l'interface Discord. Une option avec des choix prédéfinis ne peut pas recevoir de limites.
