# FBP — French Bot Programming

French Bot Programming (FBP) est un langage de programmation conçu pour créer et gérer des bots Discord avec une syntaxe en français, plus simple à lire que du JavaScript Discord.js classique. Les fichiers source utilisent l’extension `.fbp`. FBP fournit un compilateur, une commande en ligne de commande (`fbp`) et un support de coloration syntaxique pour VS Code.

Le langage permet de déclarer des commandes slash, des réponses simples ou intégrant des embeds, des options utilisateur/rôle/salon, ainsi que des événements de membres et des actions de modération. FBP est basé sur Node.js et s’appuie sur Discord.js pour communiquer avec l’API Discord. Certaines fonctionnalités nécessitent d’activer les intents et permissions correspondants dans le portail développeur Discord.

## Version actuelle

La version actuelle est FBP 1.3.3. La version 1.3.1 ajoute les commandes de gestion des messages, salons, catégories et fils de discussion. La version 1.3.2 étend le langage avec les événements Discord : messages, réactions, interactions, salons vocaux et événements du serveur. La version 1.3.3 ajoute les connexions vocales, les invitations, les sondages, les événements planifiés, les webhooks, les messages privés et les commandes contextuelles utilisateur/message. La disponibilité sur npm dépend de la publication de la version.

## Fonctionnalités

- Langage en français avec fichiers `.fbp`
- Compilateur et CLI `fbp`
- Commandes slash Discord et réponses privées
- Réponses enrichies avec embeds et champs
- Options slash pour utilisateurs, rôles et salons
- Événements de membres, modération et gestion des messages/salons
- Support VS Code intégré au package

## Fonctionnalités avancées de Discord (1.3.3)

Ces appels se placent après `connexion()`. Le bot doit avoir les permissions Discord nécessaires, et les intents privilégiés doivent être activés dans le portail développeur lorsqu'ils sont requis.

```fbp
connexion()

// Connexion et déconnexion vocale
vocalRejoindre("ID_SALON_VOCAL")
vocalQuitter("ID_SERVEUR")

// Créer une invitation valable une heure
invitationCreer("ID_SALON", 3600)

// Publier un sondage Discord avec 2 à 5 réponses
sondageCreer("ID_SALON", "Quel jour ?", "Samedi", "Dimanche")

// Créer un événement planifié dans un salon vocal.
// La date doit être une date ISO future, avec son fuseau horaire.
evenementCreer("ID_SALON_VOCAL", "Réunion", "2027-06-11T18:00:00+02:00", "Réunion de la communauté")

// Envoyer un message privé à un utilisateur
messagePrive("ID_UTILISATEUR", "Bonjour !")

// Créer un webhook, puis envoyer un message avec son URL
webhookCreer("ID_SALON", "Annonce FBP")
webhookEnvoyer("URL_WEBHOOK", "Nouvelle annonce")

// Ajouter des commandes contextuelles au menu clic droit.
// Elles répondent avec les informations de la cible sélectionnée.
commandeContextuelleUtilisateur("Voir l'utilisateur")
commandeContextuelleMessage("Voir le message")

// Écouter les messages privés reçus par le bot
evenementPrive("DM de {{pseudo}} : {{message}}")
```

Les connexions vocales nécessitent `@discordjs/voice`. Les commandes contextuelles sont enregistrées au démarrage comme les commandes slash. Les réponses contextuelles sont privées et affichent l'utilisateur ou le message sélectionné.

## Prérequis

- Node.js 20 ou plus récent
- npm

## Installation depuis npm

Quand la version sera publiée sur npm :

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
    "fbp-language": "^1.3.3"
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

## Messages et salons (développement v1.3.1)

Les commandes ci-dessous sont dans la branche de développement et ne sont pas encore publiées sur npm.

```fbp
connexion()

commandeEnvoyerMessage("envoyer")
commandeLireMessages("lire-messages")
commandeModifierMessage("modifier")
commandeSupprimerMessage("supprimer")
commandeReagirMessage("reagir")
commandeJoindreFichier("joindre-fichier")
commandeEpinglerMessage("epingler")
commandeDesepinglerMessage("desepingler")

commandeCreerSalon("creer-salon")
commandeSupprimerSalon("supprimer-salon")
commandeRenommerSalon("renommer-salon")
commandeSujetSalon("sujet-salon")
commandeCreerCategorie("creer-categorie")
commandeSupprimerCategorie("supprimer-categorie")
commandeDeplacerSalon("deplacer-salon")
commandePermissionSalon("permission-salon")

commandeCreerFil("creer-fil")
commandeEnvoyerFil("envoyer-fil")
commandeFermerFil("fermer-fil")
```

### Messages et fichiers

- `commandeEnvoyerMessage` envoie un message dans un salon.
- `commandeLireMessages` affiche les derniers messages (de 1 à 10) en réponse privée.
- `commandeModifierMessage` modifie uniquement les messages envoyés par le bot.
- `commandeSupprimerMessage`, `commandeReagirMessage`, `commandeEpinglerMessage` et `commandeDesepinglerMessage` gèrent les messages par identifiant.
- `commandeJoindreFichier` envoie un fichier accessible via une URL HTTPS, avec un texte facultatif.

### Salons, catégories et permissions

- Créer des salons texte ou vocaux, les supprimer, les renommer et modifier leur sujet.
- Créer et supprimer des catégories, déplacer un salon dans une catégorie.
- `commandePermissionSalon` permet d'autoriser, de refuser ou de réinitialiser certaines permissions d'un rôle sur un salon : visibilité, envoi de messages, historique, pièces jointes et réactions.

### Fils de discussion

- `commandeCreerFil` crée un fil à partir d'un message existant.
- `commandeEnvoyerFil` envoie un message dans un fil.
- `commandeFermerFil` archive un fil.

Les commandes vérifient les permissions Discord requises pour l'action. Le bot doit aussi disposer des permissions correspondantes et des intents nécessaires dans le portail développeur Discord. La lecture des messages dépend notamment de **Voir le salon** et **Lire l'historique des messages**.

Cette API est en cours de validation. La version npm publiée reste distincte de la branche de développement.
## Commandes Discord avancées (v1.2.9)

Les commandes texte peuvent recevoir des options utilisateur et rôle, ainsi que des suggestions d'autocomplétion. Les commandes différées répondent d'abord avec un accusé de réception Discord, puis modifient cette réponse.

```fbp
connexion()
commande("profil", "Membre sélectionné : {{membre}}")
optionUtilisateur("profil", "membre", "Choisis un membre", true)

commande("choisir", "Tu as choisi : {{modele}}")
optionAutocompleteTexte("choisir", "modele", "Recherche un modèle", true)
suggestionAutocomplete("choisir", "modele", "Modèle A", "modele-a")
suggestionAutocomplete("choisir", "modele", "Modèle B", "modele-b")

commandeDifferee("traitement", "Traitement terminé.")
```

Les suggestions d'autocomplétion sont définies avec `suggestionAutocomplete` et filtrées pendant la saisie. Les réponses différées utilisent `deferReply` puis `editReply`.

Les sous-commandes et groupes peuvent être déclarés ainsi :

```fbp
connexion()
commande("outils", "Commandes outils")
sousCommande("outils", "ping", "Vérifier le bot", "Pong !")

commande("config", "Commandes de configuration")
groupeSousCommandes("config", "salons", "Gestion des salons")
sousCommandeGroupe("config", "salons", "aide", "Afficher l'aide", "Utilise les commandes de configuration.")
```

Les options utilisateur et rôle sont également disponibles avec `optionUtilisateur` et `optionRole`. Pour un rôle, la réponse contient une mention Discord.

## Membres, rôles et modération (v1.3.0)

Les événements de membres se déclarent après `connexion()`. Les messages utilisent les variables `{{membre}}`, `{{pseudo}}`, `{{id}}`, `{{serveur}}`, `{{roles}}`, `{{ancien}}`, `{{nouveau}}`, `{{anciens_roles}}` et `{{nouveaux_roles}}`, selon l'événement.

```fbp
connexion()
evenementMembre("arrivee", "{{pseudo}} a rejoint {{serveur}}.")
evenementMembre("depart", "{{membre}} a quitté le serveur.")
evenementMembre("pseudo", "Pseudo modifié : {{ancien}} → {{nouveau}}.")
evenementMembre("roles", "Rôles de {{membre}} : {{anciens_roles}} → {{nouveaux_roles}}.")
evenementMembre("statut", "Statut de {{membre}} : {{ancien}} → {{nouveau}}.")
```

Commandes de modération :

```fbp
connexion()
commandeBannir("bannir")
commandeExpulser("expulser")
commandeTimeout("timeout")
commandeRetirerTimeout("retirer-timeout")
commandeSurnom("surnom")
commandeDebannir("debannir")
commandeAjouterRole("ajouter-role")
commandeRetirerRole("retirer-role")
commandeVerifierRole("verifier-role")
```

Les commandes de modération sont limitées par les permissions Discord, la hiérarchie des rôles et les limites de Discord. `timeout` accepte une durée de 1 à 40 320 minutes. `surnom` accepte un surnom vide pour le retirer. `debannir` demande l'identifiant Discord de l'utilisateur. Le bot doit disposer des permissions correspondantes et son rôle doit être suffisamment haut.

**Configuration obligatoire :** les événements d'arrivée, départ et changements de membre nécessitent l'intent privilégié **Server Members Intent**. Le suivi des statuts nécessite également **Presence Intent**. Active-les dans le Discord Developer Portal, section *Bot → Privileged Gateway Intents*. Sans ces intents, Discord ne transmettra pas tous ces événements.

## Événements Discord (v1.3.2)

Les événements se déclarent après `connexion()`. Lorsqu'un événement correspondant se produit, FBP affiche le modèle dans le terminal. Les variables disponibles dépendent de l'événement.

```fbp
connexion()

evenementMessage("recu", "{{pseudo}} dans {{salon}} : {{message}}")
evenementReaction("ajout", "{{pseudo}} a réagi avec {{reaction}}")
evenementReaction("retrait", "{{pseudo}} a retiré {{reaction}}")

evenementInteraction("bouton", "{{pseudo}} a cliqué sur {{custom_id}}")
evenementInteraction("menu", "{{pseudo}} a choisi {{valeurs}}")
evenementInteraction("formulaire", "{{pseudo}} a envoyé : {{formulaire}}")

evenementVocal("arrivee", "{{pseudo}} rejoint {{nouveau}}")
evenementVocal("depart", "{{pseudo}} quitte {{ancien}}")
evenementVocal("changement", "{{pseudo}} passe de {{ancien}} à {{nouveau}}")

evenementServeur("salon_cree", "Nouveau salon : {{nom}}")
evenementServeur("role_modifie", "Rôle modifié : {{nom}}")
evenementServeur("bannissement", "{{pseudo}} a été banni du serveur {{serveur}}")
evenementServeur("moderation", "Action {{evenement}} par {{pseudo}} : {{raison}}")
```

Événements disponibles :

- `evenementMessage("recu", message)` : messages texte reçus dans les serveurs.
- `evenementReaction("ajout" | "retrait", message)` : ajout et retrait de réactions.
- `evenementInteraction("bouton" | "menu" | "formulaire", message)` : clics sur boutons, sélections de menus et envois de modals.
- `evenementVocal("arrivee" | "depart" | "changement", message)` : changements de salon vocal.
- `evenementServeur(...)` : création, suppression ou modification de salons et rôles, modifications du serveur, bannissements, débannissements et entrées de journal de modération.

Variables courantes : `{{pseudo}}`, `{{membre}}`, `{{id}}`, `{{serveur}}`, `{{salon}}`, `{{message}}`, `{{message_id}}`, `{{lien}}`, `{{reaction}}`, `{{custom_id}}`, `{{valeurs}}`, `{{formulaire}}`, `{{ancien}}`, `{{nouveau}}`, `{{nom}}`, `{{raison}}` et `{{evenement}}`.

**Intents Discord :** les messages nécessitent les intents serveur `Guilds`, `GuildMessages` et l'intent privilégié `Message Content Intent`. Les réactions nécessitent `GuildMessageReactions`, les événements vocaux `GuildVoiceStates`, les événements de membres `GuildMembers`, et les événements de modération `GuildModeration`. Active les intents privilégiés nécessaires dans le portail développeur Discord et accorde au bot les permissions adaptées. Les événements de journal d'audit nécessitent également la permission **Voir les journaux d'audit**. Les interactions détectées sont celles envoyées à l'application du bot ; ces déclarations observent les interactions et n'en créent pas.

## Nouveautés de FBP 1.2.4

- `fbp -init` conserve les fichiers déjà présents dans le projet et dans le dossier de l’extension VS Code.
- La résolution des champs dynamiques `option.nom` utilise une règle de reconnaissance simplifiée.

## Nouveautés de FBP 1.2.5

- `fbp version` lit automatiquement la version installée depuis `package.json`.
- La commande consulte le registre npm pour afficher la dernière version publiée de `fbp-language`.
- Si une version plus récente existe, elle affiche la commande de mise à jour. Si npm est inaccessible, elle affiche la version locale sans échouer.

## Nouveautés de FBP 1.2.6

- Correction des diagnostics de fonctions dans VS Code : une fonction n’est plus signalée à tort comme doublon dès sa première déclaration.
- Correction de la reconnaissance des noms de fonctions Unicode dans l’analyse du document.

## Limites actuelles

FBP ne prend pas encore en charge les paramètres de fonction, les conditions, les boucles, les valeurs de retour ni les expressions arithmétiques. Les commandes Discord prennent en charge les options texte, nombre, entier, booléen, salon, utilisateur et rôle, ainsi que les choix prédéfinis, l'autocomplétion à suggestions statiques, les sous-commandes et les groupes. Les réponses différées sont modifiées après leur acquittement initial. Les réponses de sous-commandes sont actuellement fixes et les options ne sont pas encore configurables individuellement sur chaque sous-commande. La connexion Discord utilise un token stocké dans `.env`.

## Tests

Lance les tests du projet avec :

```bash
npm install
npm test
```

Cette commande exécute uniquement la suite de tests normale. Les tests de simulation ne sont pas configurés pour le moment et seront ajoutés plus tard avec une commande séparée.

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

## Licence

FBP est distribué sous la licence **Apache License 2.0**. Elle autorise l'utilisation, la modification et la redistribution, y compris à des fins commerciales, sous réserve de ses conditions. Consulte le fichier [LICENSE](./LICENSE) pour le texte complet et le fichier [NOTICE](./NOTICE), s'il est présent, pour les mentions applicables.

## Administration et gestion des rôles (v1.2.8)

FBP permet de déclarer des commandes réservées aux administrateurs et des commandes dédiées à la gestion des rôles. Elles doivent être déclarées après `connexion()`.

### Commandes réservées aux administrateurs

```fbp
connexion()
commandeAdmin("annonce-admin", "Commande réservée aux administrateurs.")
```

La commande slash `/annonce-admin` n'est accessible qu'aux membres ayant la permission Administrateur. La permission est également vérifiée à l'exécution.

### Ajouter ou retirer un rôle

```fbp
connexion()
commandeAjouterRole("ajouter-role")
commandeRetirerRole("retirer-role")
```

Ces déclarations créent les commandes slash `/ajouter-role` et `/retirer-role`, chacune avec un sélecteur de membre et de rôle. Elles nécessitent la permission **Gérer les rôles**. Le bot vérifie également la hiérarchie des rôles et refuse les rôles gérés par une intégration ou placés trop haut. Dans le portail Discord, donne au bot la permission **Gérer les rôles** et place son rôle au-dessus des rôles qu'il doit gérer.

Les réponses sont privées à l'utilisateur qui lance la commande. Discord reste l'autorité finale : le bot ne peut pas dépasser les permissions de son serveur ni sa propre position dans la hiérarchie.
\n\n## Fonctionnalités avancées (v1.3.3)\n\n```fbp\nconnexion()\n\ninvitationCreer("ID_SALON", 3600)\nsondageCreer("ID_SALON", "Quelle option ?", "Option A", "Option B")\nmessagePrive("ID_MEMBRE", "Bonjour !")\nwebhookCreer("ID_SALON", "Mon webhook")\nwebhookEnvoyer("URL_WEBHOOK", "Message envoyé via webhook")\nevenementPrive("DM de {{pseudo}} : {{message}}")\n```\n\nLes actions Discord sont exécutées de manière asynchrone. Le bot doit disposer des permissions nécessaires pour le salon et l’action demandée. Les sondages nécessitent une version de Discord.js et une API Discord qui prennent en charge les sondages. Les fonctionnalités vocales utilisent `@discordjs/voice`.\n