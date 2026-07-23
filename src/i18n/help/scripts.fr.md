# Blocs de script

Un bloc de code avec le tag de langue `perspective-script` exécute du **JavaScript** et intègre le résultat dans le document rendu. Les scripts lisent les données de l'espace de recherche (fichiers avec champs de frontmatter et de fichier, propriétés de bloc) via l'**API pq** et produisent des listes, des tableaux, des éléments ou du Markdown. Cela permet des évaluations libres au-delà de la [Requête Perspective](frontmatter-query.md) déclarative — par exemple des structures récursives ou des synthèses calculées.

Les exemples de cette page sont volontairement présentés comme blocs de code ; la page de manuel elle-même n'exécute aucun script.

## Activation et modèle de confiance

L'exécution des scripts est **désactivée par défaut**. Sans activation, un bloc de script affiche son code source avec un bandeau d'information ; aucun environnement d'exécution n'est créé.

Elle s'active sous **Paramètres → Comportement → Exécuter les blocs de script**. L'activation est une décision de confiance délibérée : les scripts proviennent des documents ouverts. N'activez cette option que si vos propres documents sont dignes de confiance. Le basculement agit immédiatement dans toutes les fenêtres, sans redémarrage.

## Limites d'exécution

Les scripts s'exécutent **confinés** dans un bac à sable isolé, jamais dans le contexte de l'application :

- **Pas d'accès aux fichiers, pas d'accès au réseau, pas d'import de modules.** Le bac à sable n'a accès ni au système de fichiers, ni aux interfaces de l'application, ni à des adresses externes.
- **Pas d'accès au DOM du document.** Les scripts n'écrivent jamais directement dans l'affichage ; la sortie transite comme description structurée via l'API pq et est traduite de manière contrôlée (sont autorisés les éléments de structure et de texte, les attributs `class`, `title` ainsi que `colspan`/`rowspan` sur les cellules).
- **Lecture seule.** L'API pq fournit un instantané des données ; les fichiers et métadonnées ne peuvent pas être modifiés depuis les scripts.
- **Limite de temps.** Une exécution est interrompue après 5 secondes ; le bloc affiche alors un avis d'interruption. Les blocs d'une fenêtre s'exécutent l'un après l'autre : un script trop long ne retarde les blocs suivants que jusqu'à son interruption, et l'application reste utilisable pendant ce temps.
- **Plafond de sortie.** Les sorties très volumineuses sont tronquées et signalées par un avis.

## Structure de base

Le script est le contenu du bloc de code ; `pq` est le seul objet prédéfini. Ce qui est affiché est ce que rapportent les fonctions de sortie ; la valeur de retour du script n'est pas affichée. Si le script retourne une promesse, le bloc attend sa résolution.

````markdown
```perspective-script
pq.out('Résultat : ' + (6 * 7));
```
````

## Lire les données

Toutes les fonctions de données sont en lecture seule et travaillent sur un instantané de l'index pris au démarrage de l'exécution. Si l'ensemble des fichiers change, le bloc se relance automatiquement.

- `pq.pages([source])` — tous les fichiers de l'espace de recherche comme objets de page, éventuellement filtrés par une source.
- `pq.current()` — l'objet de page du document courant (ou `null`).
- `pq.file(ref)` — une page par chemin absolu, chemin relatif à la racine ou nom logique (insensible à la casse) ; `null` si rien ne correspond.
- `pq.blocks([source])` — les propriétés de bloc de l'espace de recherche (voir [Propriétés de bloc](block-properties.md)) ; seules les ancres actives comptent.
- `pq.indexStatus` — état de la base de données (`ready` ; `none` sans base interrogeable).
- `pq.version` — numéro de version de l'API pq (actuellement `1`).

### Objets de page

Un objet de page porte les **champs de frontmatter à plat** (noms de champs en minuscules, p. ex. `page.status`) plus l'objet `file` avec les champs de fichier implicites :

| Champ | Contenu |
|---|---|
| `file.name` | nom logique (nom de fichier sans extension) |
| `file.folder` | dossier relatif à la racine de l'espace de recherche (`''` à la racine) |
| `file.path` | chemin relatif à la racine |
| `file.absPath` | chemin absolu (identité pour `pq.link` et `pq.file`) |
| `file.ext` | extension du fichier (minuscules, sans point) |
| `file.size` | taille en octets |
| `file.ctimeMs`, `file.mtimeMs` | date de création/modification en millisecondes |
| `file.tags` | tags du fichier |
| `file.aliases` | alias du frontmatter |
| `file.inlinks`, `file.outlinks` | références entrantes et sortantes, chacune `{ path, name }` |

### Sources

Le paramètre facultatif `source` filtre comme la sélection de sources de la requête, sous forme simplifiée :

- `'#tag'` — fichiers portant le tag, hiérarchie incluse (`#projet` couvre aussi `projet/alpha`).
- `'[[Nom]]'` — fichiers qui référencent la cible (lien sortant).
- `'Dossier'` ou `'Dossier/Sous-dossier'` — fichiers sous le chemin du dossier.

### Propriétés de bloc

`pq.blocks()` retourne par entrée `{ file: { path, absPath, name }, anchor, values, updatedMs }` ; `values` sont les valeurs de propriétés du bloc. Le filtre de source agit via le fichier porteur.

## Produire une sortie

Les fonctions de sortie rapportent du contenu au bloc (dans l'ordre d'appel) :

- `pq.out(...contenus)` — produit des valeurs, des nœuds constructeurs ou des tableaux de ceux-ci ; les valeurs simples deviennent du texte.
- `pq.list(entrées)` — liste à puces. Une entrée est un contenu ou `{ content, children }` pour des structures arborescentes (imbrication libre).
- `pq.table(entête, lignes)` — tableau ; `entête` est un tableau de contenus de cellules, `lignes` un tableau de tableaux de lignes.

Les fonctions constructeurs créent des nœuds **sans** sortie propre ; elles s'utilisent comme contenu dans `pq.out`, les entrées de liste et les cellules de tableau :

- `pq.el(tag, contenu, attributs)` — un élément de la liste d'éléments autorisés (p. ex. `p`, `span`, `strong`, `code`, `ul`, `table`, `h1`–`h6`) ; les éléments et attributs non autorisés sont écartés.
- `pq.link(cible, libellé, ancre)` — référence interne cliquable. `cible` est un objet de page, `file` ou de bloc, ou un chemin/nom ; les cibles de bloc sautent automatiquement à leur ancre. Sans `libellé`, le nom logique est affiché.
- `pq.md(texte)` — Markdown via le pipeline de rendu normal (emphase, listes, liens, etc.) ; les blocs de requête et de script intégrés n'y sont pas exécutés.

## Aides

- `pq.date(valeur)` — date à partir de chaînes de type ISO (`2026-07-09`, `2026-07-09 14:30`), de millisecondes ou d'objets date ; interprétée localement, `null` si illisible.
- `pq.dur(texte)` — durée en millisecondes à partir d'expressions d'unités comme `'7 days'` ou `'1h 30min'` (unités comme dans le littéral `dur(…)` de la requête ; mois/années comme approximations de 30/365 jours).
- `pq.sort(liste, sélecteur, décroissant)` — copie triée ; `sélecteur` est une fonction ou un chemin de champ comme `'file.name'`. Comparaison adaptée au type : dates chronologiques, nombres numériques, sinon texte sans distinction de casse.

## Exemple : arbre de liens récursif

À partir du document courant, un arbre est construit sur les références sortantes ; chaque cible est cliquable, les pages déjà visitées ne sont pas répétées :

````markdown
```perspective-script
function arbre(page, vues) {
  return {
    content: pq.link(page),
    children: page.file.outlinks
      .map(function (l) { return pq.file(l.path); })
      .filter(function (p) { return p && vues.indexOf(p.file.absPath) < 0; })
      .map(function (p) { return arbre(p, vues.concat([p.file.absPath])); }),
  };
}
var depart = pq.current();
pq.list([arbre(depart, [depart.file.absPath])]);
```
````

## Exemple : tableau sur une source de tag

````markdown
```perspective-script
var pages = pq.sort(pq.pages('#projet'), 'prio');
pq.table(['Fichier', 'Prio'], pages.map(function (p) {
  return [pq.link(p), p.prio];
}));
```
````

## Erreurs et interruptions

Une erreur de syntaxe ou d'exécution apparaît localisée au bloc, avec le message original du script et, si déterminable, la ligne du script. Une exécution dépassant la limite de temps est interrompue et signalée comme telle. Les scripts s'exécutent en mode strict : les affectations à des variables non déclarées sont des erreurs.

## Export

L'export PDF imprime l'état visible : avec le paramètre actif, le résultat du script (l'export attend les scripts en cours), sinon l'affichage du code source. Lors de la transmission du fichier Markdown, le bloc de script reste du code source inchangé ; son exécution chez le destinataire dépend du paramètre de celui-ci.
