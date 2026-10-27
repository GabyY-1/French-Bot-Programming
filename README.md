# FBP — French Bot Programming

FBP est un petit langage interprété par Node.js. Les fichiers source utilisent l'extension `.fbp`. Le projet fournit un CLI pour lancer les fichiers et les commandes définies dans `commandes.fbp`.

## Prérequis

- Node.js 20 ou plus récent
- npm

## Utiliser FBP dans un Codespace

Dans le terminal du Codespace qui contient ce dépôt :

```bash
npm install
npm test
npm link
fbp help
fbp ping
```

`npm test` compile le moteur TypeScript et lance les tests de fonctionnement. `npm link` ajoute la commande `fbp` à l'environnement npm de ce Codespace.

Pour utiliser FBP dans un autre Codespace, clone ce dépôt dans ce Codespace, puis exécute les mêmes commandes. Le lien npm n'est pas partagé automatiquement entre deux Codespaces.

## Commandes

```bash
fbp help
fbp version
fbp info
fbp ping
fbp run lancer
fbp run test
fbp run-file exemples/bot/main.fbp
```

- `fbp run <nom>` lance une commande définie dans le fichier `commandes.fbp` du dossier courant.
- `fbp run-file <fichier>` lance directement un fichier FBP.
- `fbp ping` vérifie que le CLI répond ; il ne se connecte pas à Discord.

Si la commande `fbp` n'est pas reconnue, vérifie que `npm link` a été exécuté dans ce Codespace après `npm run build`.

## Définir les commandes

`commandes.fbp` est actuellement un fichier JSON qui associe un nom de commande à un fichier :

```json
{
  "lancer": "exemples/bot/main.fbp",
  "test": "exemples/test.fbp"
}
```

Pour ajouter une commande, ajoute une entrée dont la valeur est le chemin d'un fichier FBP, relatif à la racine du projet qui contient `commandes.fbp`.

## Syntaxe prise en charge

```fbp
nom = "Gab"
niveau = 15
actif = true

lance() {
  affiche("Bonjour", nom)
}

lance()
```

- Les variables déduisent leur type à partir des valeurs littérales. Il ne faut pas déclarer explicitement leur type.
- Les types actuellement reconnus sont texte, nombre et booléen.
- Les fonctions sans paramètres se déclarent avec `nom() {` puis se ferment avec `}`.
- `affiche(...)` affiche les valeurs dans le terminal.
- `import { fonction } de "./fichier.fbp"` permet d'importer des fonctions.
- Les commentaires commencent par `//` ou `#`.

## État du langage

Cette version fournit un interpréteur de base, pas encore un langage complet. Les paramètres de fonction, les conditions, les boucles, les valeurs de retour, les expressions arithmétiques et la connexion à Discord ne sont pas encore implémentés. Le moteur doit être compilé avec `npm test` avant d'être utilisé via le CLI.
