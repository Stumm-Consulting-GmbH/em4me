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

La forme complète se compose de **clauses** : d'abord le type de sortie optionnel (`LIST` ou `TABLE`), puis, dans un ordre libre et chacune au plus une fois, `FROM` (sources), `WHERE` (condition), `GROUP BY` (regroupement), `HAVING` (condition sur le groupe), `SORT` (tri), `LIMIT` (plafond), `COLUMNS` (disposition en colonnes de la liste) et `DISPLAY` (forme de présentation). Les sauts de ligne comptent comme des espaces ; les mots-clés ignorent la casse.

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

**Regroupement (`GROUP BY`) :** `GROUP BY expression, …` structure la sortie des tâches sous des titres de groupe ; chaque expression supplémentaire crée un niveau d'imbrication, et les résultats sans valeur forment le dernier groupe. Le regroupement, les agrégats et la condition sur le groupe valent à tous les niveaux ; la section « Regroupement et agrégation » les décrit.

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

## Niveau enregistrement (`RECORDS`)

L'ajout de portée `RECORDS` directement après `LIST` ou `TABLE` évalue la requête sur les **enregistrements** des tables de base de données (page [Base de données](database.md)). Les résultats sont des enregistrements isolés : chacun apparaît avec sa forme d'affichage, à défaut avec son identifiant interne, et un clic ouvre son **formulaire** au lieu du fichier de table.

````markdown
```perspective-query
TABLE RECORDS auteur, pages
FROM "Livres"
WHERE pages > 500
SORT auteur
```
````

- **Source** : `FROM` nomme la table sous forme de chaîne, par le nom de son fichier sans extension et sans tenir compte de la casse (`"Livres"`) ou comme chemin relatif à la racine de la zone, extension comprise (`"Archives/Livres.md"`), comme l'indication `table` d'une colonne de lien. Plusieurs tables se combinent avec `OR`, `AND`, des parenthèses et `-` comme d'habitude. Au moins une table ou une hiérarchie (section « Hiérarchies » ci-dessous) doit être nommée sans négation ; un mot-clé, un lien wiki, `outgoing(…)` et le lien wiki vide produisent à ce niveau un message d'erreur. Une table qui n'existe pas ne donne aucun résultat. Une table dont le fichier se trouve dans le dossier de modèles n'en donne pas non plus, sauf si `FROM` la nomme par son chemin à travers ce dossier, par exemple `"Modèles/Livres.md"` ; son nom seul n'y suffit pas (section « Sources »).
- **Champs et valeurs** : les noms nus sont les champs de la table, sans tenir compte de la casse. Chaque valeur a le type de sa colonne, si bien que la condition et le tri traitent les nombres comme des nombres et les dates chronologiquement ; un booléen se vérifie avec `champ = "true"` ou `champ = "false"`. Si le contenu d'une cellule ne correspond pas à son type, la valeur est considérée comme manquante. Un nom que la table ne porte pas reste vide et ne retombe pas sur le frontmatter du fichier de table.
- **Indications propres** : `record.id` est l'identifiant interne de l'enregistrement, `record.table` le nom de sa table ; tous deux priment sur un champ qui porte littéralement ce nom. `file.*` désigne le fichier de table, `this.` le fichier porteur de la requête.
- **Tableaux** : `TABLE RECORDS …` affiche le résultat dans la première colonne « Enregistrement » ; `WITHOUT ID` vient après `RECORDS`. Le titre d'une colonne est l'alias, sinon l'étiquette du champ dans la langue du programme choisie, selon la chaîne de repli de la page [Base de données](database.md), sinon l'expression elle-même, par exemple pour un chemin.
- **Valeurs de lien** : un champ de référence affiche la forme d'affichage de sa cible, à défaut son identifiant, et un clic ouvre le formulaire de la cible. Un lien vide et un lien qui ne mène nulle part restent une cellule vide.
- **Ordre** : sans `SORT`, les résultats suivent leur forme d'affichage sans tenir compte de la casse, à forme d'affichage égale l'identifiant, et les enregistrements sans forme d'affichage viennent à la fin.
- **Deux cibles de clic** : un enregistrement dans le résultat d'une requête ouvre le formulaire, tandis qu'un lien dans le texte courant comme `[[Livres#^r-00042]]` ouvre le fichier de table à la ligne de l'enregistrement. Le formulaire montre l'état enregistré.
- **État non enregistré** : les modifications d'une table ouverte sont prises en compte immédiatement dans le résultat, sans enregistrer.
- **Pas à ce niveau** : `bold()` dans une colonne ou dans une expression de `GROUP BY` produit un message d'erreur, car une valeur de base de données ne porte aucune mise en forme ; dans la condition et le tri, il reste permis. `HIDE`, `SHOW` et `SHORT` ne valent que pour `LIST TASKS` et se signalent ici comme aux niveaux fichier et bloc.
- **Résultat vide et base de données désactivée** : sans résultat, « Aucun enregistrement ne correspond à cette requête » apparaît. Si l'extension « Base de données » est désactivée, la liste reste vide, une remarque s'affiche au-dessus, et aucun message d'erreur n'apparaît.

### Liaison par les champs de référence

Un **chemin** passant par un champ de référence lit les champs de l'enregistrement vers lequel il pointe : dans un prêt, `livre.titre` est le titre du livre référencé, et `livre.editeur.ville` va un niveau plus loin, dans une troisième table. Les chemins agissent dans les colonnes, dans `WHERE` et dans `SORT` :

````markdown
```perspective-query
TABLE RECORDS livre.titre AS "Titre", livre.auteur AS "Auteur", retour
FROM "Prêts"
WHERE livre.pages > 300
SORT livre.titre
```
````

- Un champ qui porte littéralement le nom du chemin, par exemple `livre.titre`, prime.
- Un lien vide, un lien qui ne mène nulle part et un lien dont la valeur de clé correspond à plusieurs enregistrements donnent une valeur vide ; pour le lien ambigu, une remarque apparaît en plus au-dessus du résultat. Un chemin passant par un champ qui n'est pas un lien reste également vide.
- Si un chemin se termine sur un champ de référence, la cellule affiche de nouveau un lien qui ouvre le formulaire.

La **direction inverse** n'a pas besoin d'une notation propre. Une condition sur le champ de référence indique quels prêts pointent vers un livre :

````markdown
```perspective-query
LIST RECORDS FROM "Prêts" WHERE livre = "r-00005"
```
````

La comparaison suit la lecture d'une cellule de lien : un identifiant correspond dans les deux écritures (`r-5` et `r-00005`), tout autre texte est comparé à la clé fonctionnelle à un seul élément de la cible, caractère par caractère. La forme d'affichage ne compte que si elle est en même temps la clé. `!=`, `IN` et `NOT IN` suivent la même règle, et `SORT` sur un champ de référence trie selon la forme d'affichage de la cible.

### Hiérarchies (`ancestors`, `descendants`)

Deux sources rassemblent des enregistrements sur un **nombre quelconque de niveaux** d'un champ de référence, par exemple le personnel d'une organisation par le champ `chef` :

````markdown
```perspective-query
LIST RECORDS FROM descendants([[Équipe#^r-00001]], chef) WHERE depuis > 2015
```
````

- `descendants(cible, champ, …)` renvoie tous les enregistrements qui pointent vers la cible par les champs nommés, directement ou par des niveaux intermédiaires ; `ancestors(cible, champ, …)` la direction inverse, c'est-à-dire la chaîne des enregistrements vers lesquels la cible pointe, jusqu'en haut.
- La **cible** est un lien d'enregistrement dans l'écriture du texte courant. La table est donnée par son nom ou comme chemin, même sans extension ; après `#` suit l'identifiant, avec ou sans `^` et aussi sous sa forme courte, ou la valeur de la clé fonctionnelle à un seul élément, par exemple `[[Équipe#Clara]]`. Un alias après `|` ne compte pas.
- **Champs** : un ou plusieurs champs de référence, séparés par des virgules, par exemple `pere, mere` ; un nom contenant des espaces se met entre guillemets. La hiérarchie suit tous les champs nommés, y compris au-delà des limites de table.
- La **cible elle-même ne fait pas partie** du résultat, et chaque enregistrement y figure au plus une fois. Il n'y a pas de limite de profondeur. Si les liens forment un cycle, la recherche se termine tout de même, et une remarque apparaît au-dessus du résultat au lieu d'un message d'erreur.
- L'ensemble agit comme toute source : `WHERE`, `SORT`, `LIMIT` et les colonnes s'appliquent, `AND "Table"` le restreint à une table, `-` l'exclut. Nommée seule, une hiérarchie est une source complète ; seulement niée, elle produit un message d'erreur, car elle ne restreint alors aucune table.
- Une cible qui n'existe pas ne donne aucun résultat. Si la valeur de clé de la cible correspond à plusieurs enregistrements, le résultat reste vide et la remarque sur le lien ambigu apparaît au-dessus.
- Les deux sources n'existent qu'au niveau enregistrement ; aux autres niveaux, elles produisent un message d'erreur.

Une hiérarchie apparaît comme arbre en retrait avec l'indication `DISPLAY tree BY champ` (section « Forme de présentation »).

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
| `descendants([[Table#^r-00001]], champ)` | enregistrements qui pointent vers l'enregistrement cible par `champ`, sur tous les niveaux (niveau enregistrement uniquement, section « Hiérarchies ») |
| `ancestors([[Table#^r-00001]], champ)` | enregistrements vers lesquels l'enregistrement cible pointe par `champ`, sur tous les niveaux (niveau enregistrement uniquement) |

Au niveau enregistrement, une chaîne désigne une table au lieu d'un dossier (section « Niveau enregistrement »).

**Les modèles ne sont pas des résultats.** Ce qui se trouve dans le dossier de modèles de la page [Modèles](templates.md), sous-dossiers compris, n'apparaît à aucun niveau dans le résultat : ni le fichier, ni ses blocs et tâches, ni les enregistrements d'une table qui s'y trouve. Si `FROM` nomme expressément le dossier de modèles ou l'un de ses sous-dossiers, la requête montre exactement le contenu du dossier nommé : `FROM "Modèles"` tous les modèles, `FROM "Projets" OR "Modèles"` les projets et les modèles. Ne valent pas comme mention un dossier parent tel que la racine de la zone `""`, un dossier nié tel que `-"Modèles"`, un mot-clé et un lien. Si l'extension « Modèles » est désactivée, l'exclusion ne s'applique pas.

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

- **Même sens à tous les niveaux** : dans les requêtes `BLOCKS`, `TASKS` et `RECORDS` aussi, `this.` désigne le fichier porteur du bloc, jamais le bloc isolé, la ligne de tâche ni l'enregistrement.
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
| `sum(l)`, `min(l)`, `max(l)`, `average(l)` | `sum(valeurs) = 6` | agrégats sur des listes de nombres ; sur un groupe, ils réunissent les valeurs de tous ses résultats (section « Regroupement et agrégation ») |
| `count(x)` | `count(tags) > 2` | nombre de valeurs présentes : pour une liste ses éléments, pour une valeur simple 1, sans valeur 0 ; `count()` sans champ compte les résultats d'un groupe |
| `bold(x)` | `bold(statut)` | présenter une valeur en évidence (section « Mise en évidence ») |

Une fonction inconnue ou un nombre d'arguments incorrect affiche un avis d'erreur au bloc.

**Langue des formateurs :** `dateformat`, `numberformat` et `currencyformat` suivent la langue du programme choisie dans les paramètres, et non celle du système d'exploitation. Là où aucun document ne se trouve derrière, comme dans les colonnes calculées des tableaux de données et dans les calculs en ligne, la langue de l'environnement continue de s'appliquer.

## Mise en évidence

`bold(valeur)` présente une valeur en évidence, aussi bien dans les cellules de tableau que dans le complément d'une entrée de liste et dans la valeur d'un groupe. Le marquage survit à la concaténation : `bold` peut n'entourer qu'une **partie** d'une expression composée, le reste reste normal.

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

`SORT champ [ASC|DESC], champ2 …` trie le résultat sur plusieurs clés, selon le type (nombres numériquement, dates chronologiquement, texte alphabétiquement selon les règles de la langue) ; les valeurs manquantes vont à la fin quelle que soit la direction. Sans `SORT`, l'ordre alphabétique demeure ; les tâches et les enregistrements suivent l'ordre par défaut de leur section. `LIMIT n` plafonne le résultat après le tri. Dans un tableau regroupé, `SORT` et `LIMIT` trient et plafonnent les groupes au lieu des résultats (section « Regroupement et agrégation »).

## Regroupement et agrégation (`GROUP BY`, `HAVING`)

`GROUP BY expression, …` réunit les résultats en groupes selon la valeur d'une expression, à tous les niveaux : fichiers, blocs, tâches et enregistrements. Chaque expression supplémentaire forme un palier sous le précédent. Les groupes sont classés selon leur valeur, et les résultats sans valeur viennent en dernier dans le groupe « (sans valeur) ». Une valeur de liste comme `file.tags` forme un groupe par combinaison, `[rouge, bleu]` et `[bleu, rouge]` en font donc deux ; il n'y a pas de répartition par élément de liste. Un champ de référence au niveau enregistrement regroupe selon l'enregistrement qu'il désigne : deux livres de même titre donnent deux groupes, chacun montre la forme d'affichage de son livre, et un clic sur lui ouvre le formulaire de ce livre.

- **Liste** : `LIST … GROUP BY …` montre pour chaque groupe un titre et ses résultats en dessous, chaque palier décalé d'un cran. Un résultat apparaît et réagit au clic comme dans la liste sans regroupement.
- **Tableau** : `TABLE … GROUP BY …` montre une ligne par groupe, avec plusieurs paliers une par groupe du palier le plus bas ; les résultats individuels n'apparaissent pas. En tête figure, pour chaque expression de `GROUP BY`, une colonne avec la valeur du groupe, à la place de la colonne « Fichier » ou « Enregistrement ». Son titre est le libellé du champ au niveau enregistrement, sinon l'expression elle-même ; `WITHOUT ID` masque ces colonnes. Les autres colonnes montrent des valeurs sur le groupe.

````markdown
```perspective-query
TABLE RECORDS count() AS "Livres", sum(pages) AS "Pages"
FROM "Livres"
GROUP BY auteur
HAVING count() > 1
SORT count() DESC, auteur
```
````

**Ligne ou groupe.** Une fonction d'agrégation tient son sens de l'endroit où elle se trouve. Les **places d'agrégation** sont les colonnes et le `SORT` d'un tableau regroupé ainsi que `HAVING` ; elle y calcule sur tous les résultats du groupe. Partout ailleurs, elle calcule sur la valeur du résultat individuel, c'est-à-dire dans `WHERE`, dans les expressions de `GROUP BY`, dans les colonnes d'un tableau sans `GROUP BY`, dans le complément de la liste et dans le `SORT` d'une liste regroupée. Trois exemples :

| Requête | Signification |
|---|---|
| `TABLE sum(valeurs)` | pour chaque fichier la somme de sa liste `valeurs` (ligne) |
| `TABLE sum(valeurs) GROUP BY statut` | pour chaque statut la somme de toutes les valeurs de tous les fichiers de ce statut (groupe) |
| `LIST GROUP BY statut HAVING count() > 2` | seulement les statuts de plus de deux fichiers, avec leurs fichiers en dessous (condition sur le groupe) |

**Sur le groupe**, `count()` compte les résultats et `count(x)` les résultats dans lesquels `x` a une valeur. `sum`, `average`, `min` et `max` réunissent les valeurs de tous les résultats, une liste avec tous ses éléments ; `min` et `max` y acceptent aussi des dates et renvoient alors une date. Le calcul sur des agrégats est permis, par exemple `sum(pages) / count()`. L'agrégat sur la liste d'un résultat individuel n'est pas accessible à une place d'agrégation. Dans la ligne d'agrégats de la [Perspective Datatable](datatable.md), la moyenne s'appelle `avg`, dans la requête `average`.

**Sont permis à une place d'agrégation** une expression égale à une expression de `GROUP BY` (la casse des noms de champ ne compte pas), des littéraux, des agrégats et tout calcul ou toute fonction sur eux, par exemple `upper(auteur) + ": " + count()`. Produisent en revanche un message d'erreur :

- un autre champ dans une colonne ou dans le `SORT` d'un tableau regroupé, y compris une auto-référence avec `this.` ; le message nomme la colonne et renvoie à `LIST`, qui montre les résultats individuels ;
- un autre champ dans `HAVING` ; le message nomme le champ et renvoie à `WHERE`, qui filtre les résultats individuels ;
- un agrégat dans un agrégat, par exemple `sum(count(x))` ;
- `count()` sans champ à une place de ligne, par exemple dans `WHERE` ou dans un tableau sans `GROUP BY` ;
- `HAVING` sans `GROUP BY`.

**Condition sur le groupe (`HAVING`).** `HAVING` teste les groupes comme `WHERE` teste les résultats : c'est une expression de vérité comme après `WHERE`, elle ne figure qu'avec `GROUP BY`, à n'importe quelle place parmi les clauses, et agit dans la liste comme dans le tableau. Avec plusieurs paliers, elle teste les groupes du palier le plus bas. Un groupe supérieur sous lequel il ne reste aucun sous-groupe disparaît, et les autres ne gardent que les résultats de leurs sous-groupes restants.

**Ordre.** Dans le tableau regroupé, `WHERE` filtre les résultats, puis les groupes se forment, `HAVING` les teste, `SORT` les trie (sans `SORT` selon leur valeur) et `LIMIT` plafonne le nombre de lignes. Avec plusieurs paliers, `SORT` trie les groupes de chaque palier entre eux. Dans la liste regroupée en revanche, `SORT` et `LIMIT` trient et plafonnent les résultats avant que les groupes ne se forment, et `HAVING` agit ensuite ; les groupes eux-mêmes y sont classés selon leur valeur.

**Limites.** Un tableau sans `GROUP BY` calcule par résultat ; il n'existe pas de total général sur tous les résultats sans regroupement. `HIDE`, `SHOW` et `SHORT` restent réservés à la liste de tâches. L'arbre (`DISPLAY tree`) ne convient à aucune requête regroupée. Comme source d'un réservoir de valeurs ou d'un champ collecte, une requête regroupée fournit les mêmes résultats que sans regroupement (page [Profils de propriétés](property-profiles.md)).

## Listes multi-colonnes

`COLUMNS n` (1 à 8) fait couler la liste de résultats sur plusieurs colonnes — pure présentation, aucune modification des données. Avec `TABLE`, `COLUMNS` est ignoré et signalé par une remarque au bloc.

````markdown
```perspective-query
LIST FROM #favoris COLUMNS 3
```
````

## Forme de présentation (`DISPLAY`)

L'indication `DISPLAY` suivie du nom d'une forme choisit la forme sous laquelle le résultat apparaît. C'est une clause comme les autres et elle se place d'ordinaire à la fin ; sans elle, le résultat apparaît comme liste ou comme tableau, selon le type de sortie. La liste et le tableau eux-mêmes se choisissent par `LIST` et `TABLE`, non par `DISPLAY` ; `DISPLAY list` et `DISPLAY table` comptent donc comme des formes inconnues.

````markdown
```perspective-query
LIST RECORDS FROM "Équipe" DISPLAY tree BY chef
```
````

La forme disponible est l'**arbre** (`DISPLAY tree BY champ`). Il affiche les enregistrements d'une requête d'enregistrements en retrait le long du champ de référence nommé :

- Un enregistrement se place sous l'enregistrement vers lequel pointe son champ, si celui-ci figure dans le résultat. Sinon, c'est une **racine**, tout à gauche : sans lien, avec un lien qui ne mène nulle part ou vers un enregistrement que la condition écarte. Avec `descendants(…)`, les racines sont donc les enregistrements placés directement sous la cible, car la cible elle-même ne fait pas partie du résultat.
- Les racines et les éléments frères suivent l'ordre du résultat, que `SORT` détermine.
- Chaque enregistrement apparaît exactement une fois, même si les liens forment un cycle. Un cycle sans racine suit les autres racines et commence par son premier enregistrement dans l'ordre du résultat.
- Seul le champ après `BY` agit. Si une table porte deux champs parents comme père et mère, l'arbre suit celui qui est nommé ; quels enregistrements figurent dans le résultat reste déterminé par la source.
- Un nœud affiche la forme d'affichage comme une entrée de liste, avec `LIST` suivie du champ supplémentaire ; avec `TABLE`, l'arbre n'affiche pas de colonnes. Un clic ouvre le formulaire.
- Au-delà de 32 niveaux, le retrait n'augmente plus ; les nœuds plus profonds figurent au complet au 32e niveau.

**Repli** : si une forme est inconnue ou ne convient pas à la requête, le résultat apparaît sans elle, donc comme liste ou tableau, avec au-dessus une remarque nommant la forme et sans message d'erreur. L'arbre ne convient qu'au niveau enregistrement et seulement avec un champ après `BY` qui est un champ de référence dans au moins une table du résultat. Il ne convient jamais à une requête regroupée ; la sortie regroupée apparaît alors avec la remarque. Un résultat vide affiche son avis de résultat vide et aucune forme. S'il manque le nom de la forme après `DISPLAY` ou le champ après `BY`, la requête est invalide.

## Affichage et interaction

- **Correspondances cliquables** : chaque correspondance apparaît avec son nom de fichier logique ; le chemin complet figure dans l'infobulle. Un clic ouvre le fichier cible dans un onglet, exactement comme un lien wiki — y compris les valeurs de lien dans les cellules de tableau. Au niveau enregistrement, une correspondance porte le nom de sa forme d'affichage, et un clic ouvre son formulaire.
- **Mise à jour en direct** : les fichiers nouveaux, modifiés et supprimés se répercutent sur les résultats visibles sans rechargement manuel, dès que l'index les a pris en compte.
- **Résultat vide** : si la requête ne trouve aucun fichier ni aucun enregistrement, un court avis apparaît au lieu d'une zone vide.
- **Requête invalide** : une erreur de syntaxe affiche un avis d'erreur avec la position au lieu d'un résultat.

Les trois vues Rendu, Partagé et Direct montrent le même résultat. Dans la vue source pure, le bloc reste visible comme code.

## Périmètre de recherche

Le périmètre de recherche est le même que pour l'index de fichiers :

- **Avec une zone active**, il couvre toute la zone ; les relations de liens (`FROM [[…]]`, `file.inlinks`) y sont complètes.
- **Sans zone**, il couvre le dossier du fichier plus deux sous-niveaux.

Les fichiers hors du périmètre n'apparaissent pas dans le résultat, pas plus que ce qui se trouve dans le dossier de modèles, sauf si la requête le nomme (section « Sources »). Un fichier non encore enregistré n'a pas de périmètre de recherche ; la requête affiche alors un avis indiquant qu'elle sera disponible après l'enregistrement. En revanche, les modifications non enregistrées d'un fichier ouvert, y compris d'une table de base de données, sont prises en compte immédiatement dans le résultat ; rien n'a besoin d'être enregistré pour cela.

## Export

- **Export PDF** : le résultat est imprimé comme un état statique du moment du rendu, y compris la disposition en tableau et en colonnes. Les entrées apparaissent comme du texte ; elles ne sont pas cliquables dans le PDF.
- **Markdown portable** : l'export laisse le bloc `perspective-query` inchangé comme source. À la réouverture dans ce programme, il est de nouveau évalué dynamiquement ; les autres programmes Markdown l'affichent comme bloc de code.

Pour des évaluations libres au-delà du langage à clauses — par exemple des structures récursives ou des synthèses calculées — les [blocs de script](scripts.md) sont disponibles ; leur API pq utilise le même modèle de champs et de blocs que la requête.
