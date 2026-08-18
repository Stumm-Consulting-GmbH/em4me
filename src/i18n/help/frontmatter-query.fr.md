# Requête Perspective

La requête Perspective intègre une **liste ou un tableau de fichiers dynamique et cliquable** directement dans le document. Un bloc de code portant l'étiquette de langue `perspective-query` contient une requête sur les propriétés de frontmatter et les champs de fichier ; au rendu, le résultat sur l'ensemble des fichiers du périmètre de recherche apparaît à cet endroit. Chaque correspondance est cliquable et ouvre le fichier cible. Le résultat reste à jour avec l'ensemble des fichiers.

Les propriétés deviennent ainsi des aperçus navigables : une page d'accueil thématique qui liste tous les fichiers associés reste à jour sans intervention manuelle.

## Structure d'une requête

La forme la plus simple est une condition nue ; elle produit la liste alphabétique des résultats :

````markdown
```perspective-query
zone = "Privé"
```
````

La forme complète se compose de **clauses** : d'abord le type de sortie optionnel (`LIST` ou `TABLE`), puis, dans un ordre libre et chacune au plus une fois, `FROM` (sources), `WHERE` (condition), `SORT` (tri), `LIMIT` (plafond) et `COLUMNS` (disposition en colonnes de la liste). Les sauts de ligne comptent comme des espaces ; les mots-clés ignorent la casse.

````markdown
```perspective-query
TABLE statut AS "Statut", file.mtime
FROM "Projets" AND #actif
WHERE file.mtime >= date(today) - dur(30 days)
SORT file.mtime DESC, file.name
LIMIT 20
```
````

Une condition nue sans mot-clé de clause est lue comme `LIST WHERE condition` ; les requêtes existantes continuent de fonctionner sans changement. Les noms de champs identiques à des mots-clés de clause (par exemple `limit`) restent utilisables dans cette forme courte.

## Types de sortie

- **`LIST`** — liste de fichiers cliquable (par défaut). Une expression optionnelle à sa suite (`LIST statut WHERE …`) apparaît en suffixe atténué derrière chaque correspondance.
- **`TABLE colonne [AS "Titre"], …`** — tableau avec des colonnes librement définies à partir de champs ou d'expressions. Sans alias, l'expression elle-même sert de titre de colonne. La première colonne est le lien de fichier cliquable ; `TABLE WITHOUT ID …` la masque. Les valeurs de liste apparaissent séparées par des virgules, les dates au format ISO, les valeurs de lien restent cliquables.

## Niveau bloc (`BLOCKS`)

L'ajout de portée `BLOCKS` directement après `LIST` ou `TABLE` évalue la requête sur les **propriétés de bloc** — les propriétés par ancre de bloc de la page [Propriétés de bloc](block-properties.md). Les résultats sont alors des blocs et non des fichiers : chaque résultat apparaît comme une cible cliquable de la forme `Fichier#^ancre` ; le clic ouvre le fichier et saute au bloc.

````markdown
```perspective-query
LIST BLOCKS WHERE status = "offen" SORT updated DESC
```
````

- **Résolution des champs** : Les noms de champ nus correspondent d'abord aux propriétés de bloc et retombent sinon sur les propriétés du frontmatter du document porteur — un bloc «hérite» de son contexte de fichier. Les champs `file.*` et les sources `FROM` se rapportent toujours au document porteur.
- **`updated`** : Moment de la dernière modification des propriétés de bloc, comme valeur de date pour les comparaisons et le tri (sauf si le bloc porte sa propre propriété `updated`).
- **Tableaux** : `TABLE BLOCKS colonne, …` affiche la cible de bloc cliquable dans la première colonne ; `WITHOUT ID` vient après `BLOCKS`. Les autres colonnes proviennent typiquement des propriétés de bloc.
- **Ensemble des résultats** : Seuls comptent les blocs dont l'ancre existe dans le document ; les entrées orphelines (propriétés sans ancre dans le texte) ne sont pas des résultats. Les documents sans propriétés de bloc ne livrent simplement aucun résultat.

````markdown
```perspective-query
TABLE BLOCKS status AS "Status", updated
FROM "Projets"
WHERE prio > 2
```
````

## Niveau tâche (`TASKS`)

L'ajout de portée `TASKS` directement après `LIST` ou `TABLE` évalue la requête sur les **tâches** du périmètre de recherche (lignes à case cocher comme sur la page [Listes de tâches](tasks.md) ; le Filtre global de l'extension s'applique aussi ici). Les résultats sont des lignes de tâche individuelles avec case de statut, description, badges de marqueur et provenance de fichier ; le clic sur la description ouvre le fichier source à la ligne. La case de statut, le bouton de report et le bouton d'édition réécrivent directement dans le fichier source — détails sur la page Listes de tâches.

````markdown
```perspective-query
LIST TASKS
FROM "Projets"
WHERE status.type = "TODO" AND due <= date(eow)
```
````

Les noms de champ nus correspondent d'abord aux champs de tâche fixes et retombent sinon sur les propriétés du frontmatter du document porteur ; les champs `file.*` et les sources `FROM` se rapportent toujours au document porteur.

| Champ | Contenu |
|---|---|
| `due`, `scheduled`, `start` | échéances manuelles comme valeurs de date (absente ou invalide : vide) |
| `created`, `done`, `cancelled` | dates automatiques comme valeurs de date |
| `due.set`, `due.invalid`, … | par champ d'échéance : marqueur présent ou invalide au calendrier (`"true"`/`"false"`) |
| `happens` | valeur la plus précoce parmi échéance, planifié et début |
| `priority`, `priority.rank` | niveau de priorité comme nom ou comme numéro de rang (0 = la plus haute) |
| `status`, `status.type` | caractère de statut ou type de statut (`TODO`, `IN_PROGRESS`, `ON_HOLD`, `DONE`, `CANCELLED`, `NON_TASK`) |
| `description`, `heading`, `tags` | texte de description, titre de la section environnante, mots-clés de la ligne |
| `recurrence` | règle de récurrence comme texte |
| `id`, `dependson`, `id.set`, `id.duplicate` | ID de tâche, liste des prédécesseurs, « a un ID », « ID attribué plusieurs fois » |
| `blocked`, `blocking` | bloquée par des prédécesseurs ouverts, ou en bloque d'autres (`WHERE blocked = "true"`) |
| `urgency` | score d'urgence (formule sur la page Listes de tâches) |
| `line` | numéro de ligne dans le fichier source |

Les champs de tâche booléens se filtrent par comparaison de chaîne (`blocked = "true"`), comme les valeurs booléennes du frontmatter.

**Confort de dates :** outre `today`, `now` et les dates fixes, les littéraux `date(...)` connaissent les mots relatifs `tomorrow`, `yesterday` ainsi que les bornes de période `sow`/`eow` (début de semaine lundi, fin de semaine), `som`/`eom` (mois) et `soy`/`eoy` (année). Les mots de début valent pour 00:00 du jour, les mots de fin pour la fin de journée — `due <= date(eow)` inclut entièrement le dimanche.

**Tri :** sans `SORT`, la liste de tâches s'ordonne par type de statut (en cours d'abord, terminé et abandonné à la fin), puis urgence décroissante, échéance, priorité et chemin. `SORT` (par exemple `SORT urgency DESC` ou `SORT due`) prime sur ce réglage par défaut.

**Regroupement (`GROUP BY`) :** `GROUP BY expression, …` structure la sortie des tâches sous des titres de groupe ; chaque expression supplémentaire crée un niveau d'imbrication. Les résultats sans valeur forment le dernier groupe. Sous cette forme, la clause ne s'applique qu'à `LIST TASKS`.

````markdown
```perspective-query
LIST TASKS GROUP BY heading, priority
```
````

**Disposition (`HIDE`/`SHOW`/`SHORT`) :** `HIDE élément, …` masque des blocs de sortie, `SHOW` révèle ceux masqués par défaut, `SHORT` affiche les badges de marqueur uniquement comme symbole (valeur complète dans l'infobulle). Éléments : les six sortes d'échéances, `priority`, `recurrence`, `id`, `dependson`, `tags`, `backlink` (provenance de fichier), `count` (compteur de résultats), `urgency` (badge de score, uniquement via `SHOW`), `edit` et `postpone` (les deux boutons d'action).

````markdown
```perspective-query
LIST TASKS SHOW urgency HIDE backlink, created SHORT
```
````

**Requête globale :** la section de paramètres **Tâches** peut mémoriser des parties `FROM`/`WHERE` implicitement placées en tête de chaque requête `TASKS` (par exemple un filtre de dossier ou de statut pour toute la section). Une requête globale erronée se signale au bloc avec son propre avis.

## Sources (`FROM`)

`FROM` restreint l'espace de résultat avant la vérification de la condition :

| Source | Signification |
|---|---|
| `"Dossier/Sous-dossier"` | fichiers de ce dossier (relatif à la racine de la requête), sous-dossiers compris |
| `#tag` | fichiers portant ce mot-clé ; couvre aussi les sous-mots-clés comme `#tag/sous` |
| `[[Fichier]]` | fichiers pointant vers `Fichier` |
| `outgoing([[Fichier]])` | fichiers vers lesquels `Fichier` pointe |
| `[[]]` | fichiers qui pointent vers le fichier porteur (section « Auto-référence ») |
| `outgoing([[]])` | fichiers vers lesquels le fichier porteur pointe |

Les sources se combinent avec `AND`, `OR`, des parenthèses et le préfixe de négation `-` :

````markdown
```perspective-query
FROM ("Projets" OR #important) AND -#archives
```
````

## Conditions (`WHERE`)

| Catégorie | Syntaxe | Signification |
|---|---|---|
| Comparaison | `champ = "valeur"`, `champ != "valeur"` | égal, différent (sans tenir compte de la casse) |
| Ordre | `champ < valeur`, `<=`, `>`, `>=` | selon le type : nombres numériquement, dates chronologiquement, texte alphabétiquement |
| Ensemble | `champ IN ("a", "b")`, `champ NOT IN (…)` | correspond à l'une des valeurs, ou à aucune |
| Logique | `AND`, `OR`, `NOT` | et, ou, non (précédence : `NOT` avant `AND` avant `OR`) |
| Groupement | `( … )` | les parenthèses regroupent les sous-expressions |
| Fonction | `contains(tags, "rouge")` | les appels de fonction sont permis comme condition |

Sémantique des valeurs : un champ scalaire se compare directement ; pour un **champ de liste** (p. ex. `tags`), `=` vérifie l'appartenance et `IN` une intersection non vide. Pour un **champ absent**, `=` et `IN` sont faux, `!=` et `NOT IN` sont vrais. Seuls les champs de premier niveau du frontmatter sont interrogeables ; les valeurs numériques se comparent numériquement dans les comparaisons d'ordre (`10` est au-dessus de `5`).

## Champs

Outre les propriétés de frontmatter (nom nu, p. ex. `statut`), des champs de fichier implicites sont disponibles sous l'espace de noms `file.` :

| Champ | Contenu |
|---|---|
| `file.name` | nom de fichier logique (sans extension) |
| `file.day` | date issue du préfixe ISO du nom (`2026-04-18 Réunion`), vide sinon |
| `file.folder`, `file.path` | dossier ou chemin, relatif à la racine de la requête |
| `file.ext` | extension du fichier |
| `file.size` | taille en octets |
| `file.ctime`, `file.mtime` | date de création et de modification |
| `file.tags`, `file.aliases` | mots-clés et alias sous forme de listes |
| `file.inlinks`, `file.outlinks` | fichiers pointant ici, et fichiers liés |
| `file.link` | le fichier lui-même comme lien cliquable (pour les colonnes de tableau) |

## Auto-référence (`this.`)

Le préfixe `this.` se rapporte au **fichier porteur** de la requête, c'est-à-dire au document qui contient le bloc, et non au fichier trouvé. Il vaut aussi bien pour les champs de fichier que pour les propriétés de frontmatter : `this.X` est ce que `X` donnerait dans le fichier porteur.

````markdown
```perspective-query
LIST WHERE domaine = this.domaine AND file.path != this.file.path
```
````

- **Même sens à tous les niveaux** : dans les requêtes `BLOCKS` et `TASKS` aussi, `this.` désigne le fichier porteur du bloc, jamais le bloc isolé ni la ligne de tâche.
- **Précédence** : la règle `this.` l'emporte sur une propriété de frontmatter du même nom, exactement comme l'espace de noms `file.`.
- **Sans fichier porteur** : s'il ne peut être résolu, tout accès `this.` donne une valeur vide ; un `this` nu sans point reste vide comme tout nom de champ inconnu.

Comme **source**, le lien wiki vide désigne ce même fichier : `FROM [[]]` rassemble les fichiers qui pointent vers lui, `FROM outgoing([[]])` la direction inverse. Le fichier porteur n'est jamais son propre résultat ; sans fichier porteur résoluble, l'ensemble reste vide au lieu de couvrir tous les fichiers.

## Littéraux et calcul

- **Les nombres** s'écrivent sans guillemets (`prio > 2`) ; **les chaînes** vont entre guillemets doubles ou simples.
- **Date** : `date(today)` (début de journée), `date(now)`, `date(2026-12-31)` ou avec une heure `date(2026-12-31 14:30)`.
- **Durée** : `dur(7 days)`, `dur(1 day 2 hours)`, en abrégé `dur(2w)`. Unités : `s`, `min`, `h`, `d`, `w`, `mo`, `y` plus les formes longues ; un mois compte pour 30 jours, une année pour 365 jours.
- **Arithmétique** : `+`, `-`, `*`, `/` avec la précédence usuelle ; date ± durée donne une date, date − date une durée. Les opérateurs entre noms de champs exigent des espaces (`a - 1`, pas `a-1` — ce dernier est un nom de champ).
- **Concaténation de texte** : si `+` ne se résout pas numériquement et qu'un côté est une chaîne, il relie les formes d'affichage des deux côtés ; c'est ainsi que naissent des colonnes composées comme `file.day + " — " + statut`. Les additions purement numériques restent numériques (`5 + "3"` donne 8), et une valeur absente reste absente et laisse la cellule vide.

Un motif typique — « modifié dans les 7 derniers jours » :

````markdown
```perspective-query
WHERE file.mtime >= date(today) - dur(7 days)
```
````

## Fonctions

| Fonction | Exemple | Signification |
|---|---|---|
| `contains(x, w)` | `contains(titre, "Plan")` | sous-chaîne dans une chaîne ou élément dans une liste (sensible à la casse) |
| `icontains(x, w)` | `icontains(titre, "plan")` | comme `contains`, sans tenir compte de la casse |
| `length(x)` | `length(tags) > 2` | longueur d'une chaîne ou d'une liste |
| `lower(s)`, `upper(s)` | `lower(statut) = "ouvert"` | minuscules ou majuscules |
| `startswith(s, p)`, `endswith(s, p)` | `startswith(file.name, "Projet")` | début ou fin d'une chaîne |
| `default(x, d)` | `default(prio, 0) > 2` | valeur de repli quand le champ manque |
| `choice(b, a, c)` | `choice(prio > 5, "haut", "normal")` | si-alors-sinon |
| `number(x)`, `string(x)` | `number(valeur) * 2` | conversion en nombre ou en texte |
| `dateformat(d, f)` | `dateformat(file.mtime, "yyyy-MM-dd")` | formater une date (jetons `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `ww`, `kkkk`, `q` ainsi que `MMMM`/`MMM`, `EEEE`/`EEE` pour les noms de mois et de jours dans la langue réglée du programme et `d`, `M` sans zéro initial ; les crochets protègent le texte littéral : `"[semaine] ww"`) |
| `days(x)` | `days(date(today) - file.day)` | une durée en nombre de jours entiers ; arrondi, pour qu'un changement d'heure ne décale pas d'un jour |
| `numberformat(x[, n])` | `numberformat(montant, 2)` | présenter un nombre localisé : sans second argument selon la langue, sinon avec exactement n décimales |
| `currencyformat(x[, d])` | `currencyformat(montant, "CHF")` | présenter un montant localisé : en euros sans indication, et le nombre non formaté pour un code de devise inconnu |
| `infolder(l, "Dossier")` | `length(infolder(file.inlinks, "Projets")) = 0` | la sous-liste des valeurs de lien dont la cible se trouve dans le dossier ou en dessous |
| `sum(l)`, `min(l)`, `max(l)`, `average(l)` | `sum(valeurs) = 6` | agrégats sur des listes de nombres |
| `bold(x)` | `bold(statut)` | présenter une valeur en évidence (section « Mise en évidence ») |

Une fonction inconnue ou un nombre d'arguments incorrect affiche un avis d'erreur au bloc.

**Langue des formateurs :** `dateformat`, `numberformat` et `currencyformat` suivent la langue du programme choisie dans les paramètres, et non celle du système d'exploitation. Là où aucun document ne se trouve derrière, comme dans les colonnes calculées des tableaux de données et dans les calculs en ligne, la langue de l'environnement continue de s'appliquer.

## Mise en évidence

`bold(valeur)` présente une valeur en évidence, aussi bien dans les cellules de tableau que dans le complément d'une entrée de liste et dans un titre de groupe. Le marquage survit à la concaténation : `bold` peut n'entourer qu'une **partie** d'une expression composée, le reste reste normal.

````markdown
```perspective-query
TABLE bold(statut) AS "Statut", file.mtime
```
````

Le contenu des cellules n'évalue aucun Markdown : un astérisque dans le texte apparaît littéralement, et une mise en évidence ne naît que de cet appel. Comparaison, tri et regroupement travaillent sur le texte pur et se comportent donc exactement comme sans marquage ; une valeur absente reste vide au lieu de produire une mise en évidence vide.

## Exemple : le dernier contact

Ensemble, les briques de cette page donnent un aperçu qui montre, sur la note d'une personne, quand celle-ci est apparue pour la dernière fois dans une note datée et depuis combien de temps :

````markdown
```perspective-query
TABLE WITHOUT ID file.link AS "Note",
  file.day + " — " + bold(days(date(today) - file.day) + " jours") AS "Dernier contact"
FROM [[]]
SORT file.day DESC
LIMIT 1
```
````

`FROM [[]]` rassemble les notes qui pointent vers ce fichier. `file.day` lit leur date dans le nom de fichier, `date(today) - file.day` donne la durée jusqu'à aujourd'hui et `days(…)` le nombre de jours entiers. Le signe plus assemble la date, le tiret et le nombre de jours en une cellule, et `bold(…)` met l'écart en évidence : « 2026-04-18 — **48 jours** ». Les notes sans date dans le nom se placent en fin de tri quelle que soit la direction et ne délogent pas le résultat.

## Tri et limite

`SORT champ [ASC|DESC], champ2 …` trie le résultat sur plusieurs clés, selon le type (nombres numériquement, dates chronologiquement, texte alphabétiquement selon les règles de la langue) ; les valeurs manquantes vont à la fin quelle que soit la direction. Sans `SORT`, l'ordre alphabétique demeure. `LIMIT n` plafonne le résultat après le tri.

## Listes multi-colonnes

`COLUMNS n` (1 à 8) fait couler la liste de résultats sur plusieurs colonnes — pure présentation, aucune modification des données. Avec `TABLE`, `COLUMNS` est ignoré et signalé par une remarque au bloc.

````markdown
```perspective-query
LIST FROM #favoris COLUMNS 3
```
````

## Affichage et interaction

- **Correspondances cliquables** : chaque correspondance apparaît avec son nom de fichier logique ; le chemin complet figure dans l'infobulle. Un clic ouvre le fichier cible dans un onglet, exactement comme un lien wiki — y compris les valeurs de lien dans les cellules de tableau.
- **Mise à jour en direct** : les fichiers nouveaux, modifiés et supprimés se répercutent sur les résultats visibles sans rechargement manuel, dès que l'index les a pris en compte.
- **Résultat vide** : si la requête ne trouve aucun fichier, un court avis apparaît au lieu d'une zone vide.
- **Requête invalide** : une erreur de syntaxe affiche un avis d'erreur avec la position au lieu d'un résultat.

Les trois vues Rendu, Partagé et Direct montrent le même résultat. Dans la vue source pure, le bloc reste visible comme code.

## Périmètre de recherche

Le périmètre de recherche est le même que pour l'index de fichiers :

- **Avec une zone active**, il couvre toute la zone ; les relations de liens (`FROM [[…]]`, `file.inlinks`) y sont complètes.
- **Sans zone**, il couvre le dossier du fichier plus deux sous-niveaux.

Les fichiers hors du périmètre n'apparaissent pas dans le résultat. Un fichier non encore enregistré n'a pas de périmètre de recherche ; la requête affiche alors un avis indiquant qu'elle sera disponible après l'enregistrement. En revanche, les modifications non enregistrées d'un fichier ouvert sont prises en compte immédiatement dans le résultat ; rien n'a besoin d'être enregistré pour cela.

## Export

- **Export PDF** : le résultat est imprimé comme un état statique du moment du rendu, y compris la disposition en tableau et en colonnes. Les entrées apparaissent comme du texte ; elles ne sont pas cliquables dans le PDF.
- **Markdown portable** : l'export laisse le bloc `perspective-query` inchangé comme source. À la réouverture dans ce programme, il est de nouveau évalué dynamiquement ; les autres programmes Markdown l'affichent comme bloc de code.

Pour des évaluations libres au-delà du langage à clauses — par exemple des structures récursives ou des synthèses calculées — les [blocs de script](scripts.md) sont disponibles ; leur API pq utilise le même modèle de champs et de blocs que la requête.
