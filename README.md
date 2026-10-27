# FBP — French Bot Programming

![Logo FBP](https://raw.githubusercontent.com/GabyY-1/French-Bot-Programming/main/assets/fbp-logo.svg)

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
    "fbp-language": "^1.2.4"
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

## Initialiser un projet et installer le support VS Code

Dans le dossier de ton projet, exécute :

```bash
fbp -init
```

La commande crée `commandes.fbp` et `scripts/main.fbp` sans écraser les fichiers existants. Elle installe également le support FBP fourni avec le package dans le dossier des extensions VS Code de l’utilisateur. Si le dossier de cette version de l’extension existe déjà, il est conservé et n’est pas remplacé. Si tu utilises une instance distante ou un environnement sans dossier d’extensions accessible, l’installation peut nécessiter une configuration manuelle. Recharge ensuite VS Code. Pour l’icône FBP, sélectionne `FBP File Icons` dans **Préférences : Thème d’icônes de fichiers**.

Le support VS Code contient la reconnaissance des fichiers `.fbp`, la coloration syntaxique et le thème d’icônes. Il est livré dans le même dépôt et le même package npm ; aucune extension séparée à rechercher n’est nécessaire.

## Commandes CLI

```bash
fbp help
fbp version
fbp info
fbp ping
fbp -init
fbp run lancer
fbp run-file scripts/main.fbp
```

- `fbp run <nom>` exécute la commande correspondante dans le fichier `commandes.fbp` du dossier courant.
- `fbp run-file <fichier>` exécute directement un fichier FBP.
- `fbp ping` vérifie que le CLI répond ; il ne se connecte pas à Discord.

## Réponses privées Discord (v1.2.1)

Pour envoyer une réponse slash visible uniquement par la personne qui utilise la commande, utilise `commandePrivee` :

```fbp
connexion()
commandePrivee("profil", "Ces informations sont visibles uniquement par toi.")
```

La fonction prend le nom de la commande puis le texte de réponse. La commande reste une commande slash Discord classique, mais sa réponse est éphémère et n’est visible que par l’utilisateur qui l’a déclenchée.

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
connexion()
commande("ping", "Pong !")
commande("bonjour", "Salut !")
commandeEmbed("serveur-info", "Informations du serveur", "Voici les informations disponibles.", "#5865F2")
champ("serveur-info", "Nom", "Mon serveur")
champ("serveur-info", "Membres", "42")
```

Associe `lancer` à `scripts/main.fbp` dans `commandes.fbp`, puis exécute `npx fbp run lancer`. Dans le portail développeur Discord, vérifie que le bot est invité sur ton serveur avec les scopes `bot` et `applications.commands`. Seul l'intent serveur (`Guilds`) est nécessaire.

FBP enregistre les commandes déclarées comme commandes slash globales de l'application Discord. Leur apparition peut prendre un peu de temps après le premier enregistrement. Les noms doivent contenir de 1 à 32 caractères parmi les lettres minuscules, chiffres, tirets et underscores.

## Sélecteur de salon Discord (v1.1.8)

Une commande slash peut proposer un sélecteur de salon Discord. La valeur choisie est réutilisable dans la réponse avec `{{salon}}` :

```fbp
connexion()
commande("configurer", "Salon sélectionné : {{salon}}")
optionSalon("configurer", "salon", "Choisis un salon", true)
```

Le dernier argument indique si l'option est obligatoire. La réponse affiche le nom du salon précédé de `#`. Cette option peut être ajoutée aux commandes texte ou aux commandes embed, comme les autres options slash.

## Nouveautés de FBP 1.2.4

- `fbp -init` conserve les fichiers déjà présents dans le projet et dans le dossier de l’extension VS Code.
- La résolution des champs dynamiques `option.nom` utilise une règle de reconnaissance simplifiée.

## Limites actuelles

FBP est encore un interpréteur de base. Les paramètres de fonction, les conditions, les boucles, les valeurs de retour et les expressions arithmétiques ne sont pas encore implémentés. La connexion Discord utilise un token stocké dans `.env`. Les commandes slash peuvent répondre avec un texte fixe ou un embed défini avec `commandeEmbed(nom, titre, description, couleur)`. Ajoute des champs avec `champ(nomCommande, nomChamp, valeur)`. Les valeurs des embeds sont actuellement fixes : la récupération dynamique des informations du serveur, les options, paramètres, permissions avancées et conditions ne sont pas encore implémentés.

## Développement du dépôt

```bash
npm install
npm test
```

Les fichiers d'essai internes se trouvent dans `tests/fixtures`. Ils ne font pas partie du paquet publié.


## Informations Discord dynamiques (v1.1.6)

Les champs d'un embed peuvent récupérer les informations accessibles au moment où la commande est utilisée. Exemple :

```fbp
connexion()
commandeEmbed("serveur-info", "Informations du serveur", "Données actuelles", "#5865F2")
champDynamique("serveur-info", "Nom", "serveur.nom")
champDynamique("serveur-info", "Identifiant", "serveur.id")
champDynamique("serveur-info", "Création", "serveur.creation")
champDynamique("serveur-info", "Membres", "membres.nombre")
champDynamique("serveur-info", "Rôles", "roles.nombre")
champDynamique("serveur-info", "Salons", "salons.nombre")
champDynamique("serveur-info", "Latence", "latence")
optionUtilisateur("serveur-info", "membre", "Membre à afficher")
champDynamique("serveur-info", "Profil", "profil.nom")
champDynamique("serveur-info", "Avatar", "avatar")
```

Sources disponibles : `serveur.nom`, `serveur.id`, `serveur.creation`, `membres.nombre`, `profil.nom`, `profil.id`, `profil.avatar`, `roles.nombre`, `salons.nombre`, `statistiques.membres`, `statistiques.roles`, `statistiques.salons`, `latence` et `avatar`. `optionUtilisateur(nomCommande, nomOption, description)` ajoute un sélecteur facultatif de membre à une commande embed. Les données accessibles dépendent des permissions et du cache Discord du bot.


## Options des commandes slash (v1.1.6)

Les commandes slash peuvent maintenant recevoir des options texte, nombre, entier ou booléen. Le dernier argument indique si l'option est obligatoire ; il est facultatif et vaut `false` par défaut.

```fbp
connexion()
commande("bonjour", "Salut {{prenom}} !")
optionTexte("bonjour", "prenom", "Ton prénom", true)
optionEntier("bonjour", "age", "Ton âge")
optionNombre("bonjour", "note", "Une valeur décimale")
optionBooleen("bonjour", "confirme", "Confirmer ?")
```

Dans une réponse texte, `{{prenom}}` est remplacé par la valeur saisie. Pour les embeds, les champs dynamiques peuvent lire une option avec `champDynamique("commande", "Champ", "option.prenom")` (ou `option.prenom`). Les options absentes ne sont pas remplacées et une option obligatoire inaccessible produit une réponse d'erreur.

Fonctions disponibles :

- `optionTexte(commande, nom, description, obligatoire)`
- `optionNombre(commande, nom, description, obligatoire)`
- `optionEntier(commande, nom, description, obligatoire)`
- `optionBooleen(commande, nom, description, obligatoire)`
- `optionUtilisateur(commande, nom, description)` pour le sélecteur de membre existant des commandes embed.

Les noms d'options doivent respecter les règles Discord (minuscules, chiffres, tirets et underscores, 1 à 32 caractères). Une commande peut avoir jusqu'à 25 options. Les types d'options sont déclarés lors de l'enregistrement des commandes ; redémarre le bot après avoir modifié leur définition. Le bot a besoin du scope `applications.commands` et de l'accès au serveur concerné. Aucun intent privilégié supplémentaire n'est requis pour ces options.


## Choix prédéfinis des options (v1.1.6)

Pour limiter les réponses possibles d'une option, ajoute des choix après avoir déclaré l'option :

```fbp
connexion()
commande("couleur", "Couleur choisie : {{couleur}}")
optionTexte("couleur", "couleur", "Choisis une couleur", true)
choixTexte("couleur", "couleur", "Bleu", "bleu")
choixTexte("couleur", "couleur", "Rouge", "rouge")

commande("difficulte", "Niveau choisi : {{niveau}}")
optionEntier("difficulte", "niveau", "Choisis un niveau", true)
choixEntier("difficulte", "niveau", "Facile", 1)
choixEntier("difficulte", "niveau", "Normal", 2)
choixEntier("difficulte", "niveau", "Difficile", 3)
```

- `choixTexte(commande, option, nomChoix, valeur)` ajoute un choix à une option texte.
- `choixEntier(commande, option, nomChoix, valeur)` ajoute un choix à une option entière.
- Déclare toujours l'option avant ses choix.
- Une option peut avoir jusqu'à 25 choix. Les noms de choix sont limités à 100 caractères.
- Les choix sont présentés par Discord sous forme de liste et la valeur choisie est récupérable comme les autres options.


## Limites numériques des options (v1.1.7)

Les options slash de type nombre et entier peuvent imposer une valeur minimale et maximale. Déclare l'option d'abord, puis ses limites :

```fbp
connexion()
commande("age", "Âge sélectionné : {{age}}")
optionEntier("age", "age", "Choisis un âge", true)
optionEntierLimites("age", "age", 13, 99)

commande("note", "Note sélectionnée : {{note}}")
optionNombre("note", "note", "Choisis une note", true)
optionNombreLimites("note", "note", 0, 20)
```

- `optionEntierLimites(commande, option, minimum, maximum)` accepte uniquement des bornes entières.
- `optionNombreLimites(commande, option, minimum, maximum)` accepte des bornes numériques, y compris décimales.
- Le minimum doit être inférieur ou égal au maximum.
- Les limites s'appliquent à l'interface Discord. Une option avec des choix prédéfinis ne peut pas recevoir de limites.


## Support VS Code

Le dossier `vscode-extension/` contient le manifeste d’extension, la grammaire TextMate, la configuration de langage et le thème d’icônes FBP. La commande `fbp -init` copie ce support dans le dossier d’extensions de VS Code. La version 1.2.0 ajoute l’autocomplétion des fonctions intégrées et des symboles du fichier, ainsi que les diagnostics de syntaxe dans l’éditeur. Le logo du thème d’icônes se trouve dans `vscode-extension/assets/fbp-logo.svg`.
