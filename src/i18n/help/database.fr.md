# Base de données

Un fichier Markdown peut déclarer qu'il est une **table de base de données** et nommer les champs que cette table possède. La définition figure dans le frontmatter du fichier même qui porte les enregistrements ; la table est ainsi complète dans un seul fichier et survit à toute opération de fichier, y compris le renommage et le déplacement en dehors de l'application.

Distinction : la [Perspective Datatable](datatable.md) est une table typée **à l'intérieur d'un document**, destinée à de petits ensembles calculables, tandis que la table de base de données est une table nommée **avec son propre fichier**, dont les enregistrements sont référencés depuis d'autres fichiers.

Le format de définition est le même que pour les [Profils de propriétés](property-profiles.md) : les mêmes indications par champ, la même souplesse en cas d'erreur. Une définition de table n'est pourtant **pas** un profil de propriétés, et un fichier de table n'apparaît pas dans la liste des profils des paramètres.

## Le fichier de table

Le conteneur `db-table` dans le frontmatter désigne le fichier comme table et porte sous `fields` une entrée par colonne :

```yaml
---
db-table:
  fields:
    - name: titre
      type: string
      label: Titre
      required: true
      options:
        maxLength: 120
    - name: pages
      type: number
      options:
        decimals: 0
    - name: statut
      type: string
      values: [disponible, emprunté, manquant]
      default: disponible
    - name: auteur
      type: record
      options:
        table: Auteurs
  key: titre
  display: titre
  lastId: 42
---
```

La seule **présence** de la clé fait du fichier une table, indépendamment du fait que son contenu soit utilisable. Une table comportant une faute de frappe dans sa définition ne disparaît donc pas discrètement de la base de données, elle reste une table qui signale une erreur.

## Indications par colonne

| Indication | Signification |
| --- | --- |
| `name` | **Obligatoire.** Le nom technique de la colonne. Il reste neutre du point de vue de la langue, car il figure dans les références et dans l'ordre des enregistrements |
| `type` | l'un des huit types de colonne ci-dessous ; sans indication, `string` s'applique |
| `label` | l'étiquette pour l'affichage, sous forme de texte ou de correspondance de langue à texte |
| `required` | `true` si la colonne exige une valeur |
| `values` | plage de valeurs fixe sous forme de liste |
| `default` | valeur par défaut de la colonne |
| `options` | indications propres au type, voir ci-dessous |

Le nom est la **seule indication obligatoire** ; toute autre indication est omissible individuellement.

## Types de colonne

| Type | Signification |
| --- | --- |
| `string` | texte, le type par défaut |
| `multiline` | texte multiligne |
| `number` | nombre |
| `boolean` | vrai/faux |
| `date` | date |
| `time` | heure |
| `link` | lien vers un **fichier** |
| `record` | lien vers un **enregistrement** d'une autre table |

Le lien vers un enregistrement est le type par lequel deux tables entrent en relation : un `link` pointe vers un fichier, mais un enregistrement n'est pas un fichier, c'est une ligne dans une table.

**Un état intermédiaire vaut pour les deux types de lien.** L'affichage montre la valeur d'une colonne de type `link` ou `record` sous forme de texte et ne résout pas le lien ; il n'y est donc pas cliquable. La résolution viendra avec une étape ultérieure. Le lien vers un enregistrement isolé n'est pas concerné : il s'écrit dans le texte courant et dispose plus bas d'une section propre.

**Trois choses sont exclues dans une colonne de table**, et le message nomme chaque fois la raison au lieu du seul fait :

- **les champs calculés** (`formula`, `lookup`) — une table ne porte pas de colonnes calculées ; le calcul a lieu dans des requêtes sur les données.
- **les valeurs structurées** (`object`, `objectlist`) — ce qu'un objet exprime dans une cellule s'exprime autrement par une table dépendante au moyen d'une relation.
- **les colonnes à valeurs multiples** (`multistring` comme type, `multiple: true` sur un autre type) — une colonne multiple est une relation déguisée en colonne.

Comme indications d'un **champ de document**, les trois restent admises sans changement ; elles ne sont exclues que dans une colonne de table.

## Indications propres au type

Le sous-objet `options` porte les indications qui ne valent que pour un type donné. Ce sont les mêmes que pour les [Profils de propriétés](property-profiles.md), augmentées d'une indication qui n'existe que sur une colonne :

| Type | Indication | Signification |
| --- | --- | --- |
| `string` | `maxLength` | longueur maximale en caractères. Une valeur plus longue est signalée et **non tronquée** |
| `number` | `decimals` | nombre de décimales attendu, de zéro à dix. Une valeur comportant davantage de décimales est signalée et **non arrondie** |
| `record` | `table` | nom de la table vers laquelle pointe le lien vers l'enregistrement |

La longueur maximale et les décimales font partie du fonds commun d'indications et valent donc de la même manière pour les propriétés ordinaires d'un document. Toutes deux sont une **remarque sur le champ** et ne modifient jamais la valeur enregistrée.

## Relations entre tables

Une colonne de type `record` est une **colonne de lien**. Son indication `table` nomme la table cible par le nom de son fichier sans extension, sans tenir compte des majuscules et des minuscules, et chaque cellule de la colonne pointe vers un enregistrement de cette table :

```yaml
- name: auteur
  type: record
  options:
    table: Auteurs
```

Une cellule peut contenir l'une de deux choses :

- l'**identifiant** de la cible, y compris sous sa forme courte : `r-00007` et `r-7` pointent vers le même enregistrement ;
- la **valeur de la clé fonctionnelle** de la cible, si cette clé se compose d'un seul champ, par exemple `Umberto Eco`. La comparaison se fait caractère par caractère, comme pour la clé elle-même.

Un texte ayant la forme d'un identifiant est toujours lu comme un identifiant. L'écriture `[[Auteurs#^r-00007]]` d'un lien dans le texte courant n'a pas sa place dans la cellule ; elle y compte comme une valeur de clé ordinaire. Une cellule vide n'est pas un lien et n'est pas vérifiée ; c'est `required` qui dit si elle doit être remplie.

**Lors de la sauvegarde par l'application, chaque lien est vérifié et écrit sous forme d'identifiant.** La table cible doit exister dans la zone, et le contenu de la cellule doit toucher exactement un enregistrement qui existe après la modification ; un enregistrement créé dans la même modification compte, un enregistrement supprimé dans celle-ci ne compte pas. S'il n'en touche aucun ou plusieurs, la modification est refusée. La résolution par la valeur de clé ne fonctionne que si la table cible a une clé fonctionnelle à un seul élément ; avec une clé à plusieurs éléments, l'identifiant est le seul moyen. Ce qui a été résolu, l'application l'écrit dans la cellule sous forme d'identifiant complété, que la valeur de clé ou la forme courte y ait figuré ; si la valeur de clé de la cible change plus tard, le lien reste valable. Un enregistrement peut aussi renvoyer à lui-même.

**Un enregistrement vers lequel un lien pointe encore ne peut pas être supprimé.** Cela vaut pour chaque colonne de lien de la zone qui pointe vers sa table, y compris une colonne de la même table, et pour les liens par l'identifiant comme par la valeur d'une clé à un seul élément. Le message nomme la table qui renvoie, ses colonnes de lien, le nombre d'enregistrements qui renvoient et le premier d'entre eux. L'application ne supprime rien avec lui et ne vide aucun lien. Qui veut supprimer un en-tête avec ses lignes supprime les deux en **une seule** modification ; de même, un lien ne compte plus si la même modification le fait pointer vers une autre cible ou le vide. Un lien dans le texte courant, par exemple `[[Auteurs#^r-00007]]`, ne protège pas en revanche : il peut se rompre comme un lien vers un fichier supprimé.

Les deux vérifications ont besoin de la vue d'ensemble des tables de la zone. Si les tables ne sont pas encore entièrement lues, l'application refuse une modification qui pose un lien ou supprime un enregistrement, et le message invite à réessayer dans un instant.

Les relations s'exploitent avec une requête d'enregistrements : un chemin comme `auteur.nom` lit le champ de l'enregistrement référencé, une condition sur le champ de référence trouve la direction inverse, et `ancestors(…)` et `descendants(…)` suivent les liens sur un nombre quelconque de niveaux. Combien d'enregistrements renvoient à un enregistrement, une requête regroupée le compte, par exemple `TABLE RECORDS count() FROM "Prêts" GROUP BY livre`. La page [Requête Perspective](frontmatter-query.md) décrit les deux dans les sections « Niveau enregistrement » et « Regroupement et agrégation ».

## Étiquettes en plusieurs langues

L'étiquette figure à la clé `label`, soit comme simple texte, soit comme correspondance de langue à texte :

```yaml
- name: titre
  label:
    de: Titel
    en: Title
    fr: Titre
```

Le **nom** du champ n'en est pas affecté : s'il était traduisible, une base de données transmise se disloquerait au premier changement de langue. Si une correspondance est défectueuse en elle-même, l'étiquette tout entière disparaît et l'affichage se rabat sur le nom technique, au lieu de montrer certaines langues et d'en laisser d'autres s'effacer discrètement.

## Identifiant d'enregistrement, clé fonctionnelle et forme d'affichage

Chaque enregistrement porte un **identifiant interne** de la forme `r-00042` : la marque `r-` pour record et un nombre d'au moins cinq chiffres. La largeur est une largeur minimale et non une limite ; après `r-99999` vient `r-100000`. Les deux écritures sont lues, `r-42` et `r-00042` désignent le même enregistrement.

Un lien vers un enregistrement nomme la table et l'identifiant, écrit comme une ancre de bloc : `[[Personen#^r-00042]]`. Ce qu'un tel lien produit et quand il vaut est décrit plus bas, dans la section sur la trouvabilité.

Trois indications de la définition s'y rattachent :

| Indication | Signification |
| --- | --- |
| `lastId` | niveau de crue : le plus grand numéro jamais attribué par la table. L'identifiant suivant se situe au-dessus de lui et au-dessus du plus grand identifiant de l'existant, afin que le numéro d'un enregistrement supprimé ne soit jamais attribué une seconde fois et qu'aucun identifiant ne soit attribué deux fois, même sans niveau de crue ou avec un niveau trop bas |
| `key` | la clé fonctionnelle : un nom de champ ou une liste de noms de champs. Facultative, car une table de mouvements ou de mesures n'a pas de clé lisible par l'humain qui ait du sens |
| `display` | le champ par lequel un enregistrement est désigné. Sans indication, une clé fonctionnelle à un seul élément s'applique, sans l'une ni l'autre, l'identifiant interne |

Si la clé fonctionnelle nomme un champ que la définition ne connaît pas, la clé **entière** disparaît : une demi-clé serait une fausse promesse d'unicité.

**Lors de la sauvegarde par l'application, la clé fonctionnelle reste unique.** L'application la vérifie par rapport à tous les enregistrements de la table, y compris ceux de ses fichiers suivants, et refuse une modification après laquelle deux enregistrements porteraient la même clé ; rien n'est alors écrit. Le message distingue trois situations :

- La même clé figure **deux fois dans la même modification**.
- La clé est **déjà attribuée à un enregistrement**. Le message nomme celui-ci avec son identifiant et sa forme d'affichage.
- La clé est **déjà attribuée plusieurs fois dans les enregistrements existants**. Il faut alors d'abord corriger les enregistrements existants ; le message nomme les enregistrements qui la portent.

Une clé à plusieurs éléments ne compte comme doublon que si tous ses éléments concordent. Si un élément est vide, la clé n'est pas vérifiée ; c'est l'indication `required` qui dit si le champ doit être rempli. La comparaison se fait caractère par caractère : `Müller` et `MÜLLER` sont deux clés différentes, et une espace en tête compte. Une modification qui laisse inchangée la clé d'un enregistrement ne la vérifie pas ; un enregistrement faisant partie d'un doublon existant reste ainsi modifiable dans ses autres champs. Supprimer et recréer la même clé en une seule modification est admis, tout comme l'échange des clés de deux enregistrements.

## Les enregistrements dans le fichier

Les enregistrements se trouvent dans le corps du même fichier, dans un bloc qui leur est propre :

````markdown
```perspective-records
|- id="r-00001"
| Le Nom de la rose
| 640
| disponible
|- id="r-00002"
| Le Pendule de Foucault
| 880
| emprunté
```
````

Les règles sont volontairement brèves, car le fichier est un stockage technique :

- Une ligne commençant par `|-` en **colonne 0** ouvre un enregistrement. Son identifiant interne suit.
- Une ligne commençant par `| ` en colonne 0 ouvre une cellule. Toute ligne suivante appartient à la cellule en cours, une valeur peut donc s'étendre sur plusieurs lignes.
- Il n'y a **pas de ligne d'en-tête**. Les cellules correspondent aux champs de la définition, dans l'ordre ; cet ordre est le contrat.
- Seule la colonne 0 compte. Une ligne indentée est toujours du contenu, même si elle ressemble à un marqueur.
- Si une ligne doit elle-même commencer par `|` ou `!`, elle est précédée d'une barre oblique inverse : `\| voici comment une valeur commence par une barre`.

**Aucun caractère n'est jamais perdu.** Si un enregistrement a trop peu de cellules, les champs restants demeurent vides ; s'il en a trop, les cellules excédentaires restent intactes. Les deux cas sont signalés, mais rien n'est écrit en silence — c'est la seule faute qu'un magasin de données ne doit pas commettre.

## Règles de contrôle

Une règle de contrôle fixe les valeurs qu'une table accepte. Elle figure dans la définition, à l'un de deux endroits selon sa portée :

- **`check` sur l'entrée d'une colonne** vérifie la seule valeur de cette colonne.
- **`checks` au niveau supérieur du conteneur** est une liste de conditions portant sur plusieurs champs d'un enregistrement.

```yaml
db-table:
  fields:
    - name: npa
      check: '/^\d{4}$/'
    - name: quantite
      type: number
      check:
        - value > 0
        - rule: value <= 100
          message: Au plus 100 pièces par ligne.
    - name: debut
      type: date
    - name: fin
      type: date
  checks:
    - rule: fin >= debut
      message: La fin se situe avant le début.
```

Une règle est un texte ou un objet `{ rule, message }` avec un message propre ; sur un champ, une liste des deux formes est également admise. Le texte d'une règle de champ prend l'une de trois formes :

- Une **expression régulière** figure entre barres obliques, suivie éventuellement de drapeaux, par exemple `/^\d{4}$/` ou `/^[a-z]+$/i`. Les drapeaux `g` et `y` sont exclus. Une barre oblique dans le motif n'a pas besoin de barre oblique inverse, car le motif s'étend jusqu'à la dernière barre oblique.
- Un **mot isolé** est le nom d'une règle fournie. L'application n'en connaît encore aucune ; un nom inconnu disparaît avec une remarque.
- **Tout autre texte** est une condition du langage de requête dans laquelle la valeur propre s'appelle `value`, par exemple `value > 0 AND value <= 100`. Elle ne doit pas nommer un autre champ ; une condition portant sur plusieurs champs se place sous `checks`.

Une règle sous `checks` est toujours une condition du langage de requête. Elle nomme les champs par leur nom, sans tenir compte des majuscules et des minuscules.

La comparaison se fait comme dans toute requête : un nombre comme un nombre, une date et une heure chronologiquement, y compris par rapport à une date de la forme `date(2026-01-01)`, un texte sans tenir compte des majuscules et des minuscules.

**Un piège est à connaître.** Le langage de requête ne connaît pas les mots `true`, `false` et `null` ; il les lit comme des noms de champ, et la règle disparaît avec une remarque. Une valeur vrai/faux se vérifie avec `value` seul ou avec `NOT value`, sous `checks` avec le nom du champ seul ou précédé de `NOT`. C'est `required` qui dit si un champ est rempli, et non une règle de contrôle.

**Aucune règle de champ ne vérifie une valeur vide**, pas plus qu'une valeur qui ne correspond pas à son type ; celle-ci est déjà signalée par la vérification du type. L'exception est la valeur vrai/faux : sa cellule vide signifie « non », et `value` exige donc une case cochée. Une règle sous `checks` est en revanche toujours vérifiée ; une comparaison avec un champ vide n'est alors pas satisfaite. Une règle qui ne peut pas être évaluée, par exemple à cause d'une division par zéro, compte comme enfreinte.

**Lors de la sauvegarde par l'application, les règles agissent strictement.** Est vérifié l'enregistrement tel qu'il se présenterait après la modification, avec tous ses champs et pas seulement ceux qui ont changé. S'il enfreint une règle, la modification est refusée. Pour une règle de champ, le message nomme le champ, la valeur et la règle, pour une règle sous `checks` l'enregistrement et la règle, et il ajoute le message de la règle si elle en a un. La suppression ne vérifie aucune règle.

**À la lecture, elles agissent avec souplesse.** Une valeur qui enfreint une règle de champ est signalée dans l'affichage comme une valeur qui ne correspond pas à son type ; la cellule montre son texte inchangé, l'enregistrement reste visible et rien ne change dans le fichier. Une cellule vide d'un champ avec `required` est signalée de la même manière. Les règles sous `checks` n'agissent pas à la lecture, car elles n'ont pas de cellule unique qui pourrait être signalée.

## Modification sous condition

L'indication `editable` au niveau supérieur du conteneur fixe à quelle condition un enregistrement peut encore être modifié, par exemple pour qu'une facture comptabilisée reste inchangée :

```yaml
db-table:
  fields:
    - name: statut
      values: [ouverte, comptabilisée]
  editable:
    rule: statut != "comptabilisée"
    message: Une facture comptabilisée n'est plus modifiée.
```

La condition est une expression du langage de requête portant sur les noms de champ de la table, sous forme de texte ou d'objet `{ rule, message }` avec un message propre. Une table a exactement une condition ; qui en a besoin de plusieurs les combine dans l'expression.

Lors de la sauvegarde par l'application, les points suivants s'appliquent :

- La condition vaut pour la **modification et la suppression** d'un enregistrement. La **création** reste toujours libre.
- Elle se mesure à l'état **enregistré** de l'enregistrement avant la modification, et non aux nouvelles valeurs. Qui remet le statut en arrière dans la même modification reste donc bloqué.
- Si la condition n'est pas remplie, la modification est refusée. Le message nomme l'enregistrement et la condition et ajoute le message de la condition.
- Une condition qui ne peut pas être évaluée bloque.
- Une indication inutilisable disparaît avec une remarque, et la table reste modifiable.

Sans cette indication, tout enregistrement est modifiable.

**La même indication sur un champ.** Un champ isolé porte `editable` dans sa propre entrée et n'est alors modifiable qu'à cette condition ; l'enregistrement reste visible et modifiable dans ses autres champs :

```yaml
db-table:
  fields:
    - name: livre
      type: record
      editable: false
    - name: retour
      type: date
      editable: NOT rendu
    - name: rendu
      type: boolean
```

- La condition a la même forme que sur la table, sous forme de texte ou d'objet `{ rule, message }`, et peut nommer n'importe quel champ de la table. `false` bloque le champ durablement, `true` le libère expressément ; ces deux mots ne valent que sur un champ, non sur la table.
- Elle ne vaut que pour la **modification**. À la création, chaque champ est libre, et la suppression n'est pas concernée. Comme sur la table, elle se mesure à l'état enregistré avant la modification.
- Si une sauvegarde modifie la valeur d'un champ bloqué, elle est refusée ; le message nomme le champ, l'enregistrement et la règle, pour le blocage durable la règle « false ». Une valeur inchangée dans un champ bloqué n'est pas une erreur. Si l'enregistrement est déjà bloqué selon la condition de sa table, seul son message figure.
- Pendant la modification dans le formulaire et dans une ligne du formulaire de liste, un champ bloqué reste en lecture, et une infobulle indique qu'il n'est pas modifiable pour l'instant selon la condition de la définition. Dès que la condition est remplie après une sauvegarde, le champ est libre à la modification suivante.
- Une condition inutilisable disparaît avec une remarque, et le champ reste modifiable.

Modification sous condition et autorisations agissent ensemble et restent pourtant deux choses distinctes : `editable` dépend de l'enregistrement et vaut pour tous, les autorisations dépendent du rôle (section « Autorisations »).

## Affichage des enregistrements

En mode lecture et en mode édition, le bloc apparaît sous forme de tableau avec les colonnes de la définition. Chaque valeur est affichée selon le type de sa colonne : nombres alignés à droite et avec les décimales déclarées, valeurs booléennes sous forme de coche, valeurs multilignes avec leurs retours à la ligne. Si une valeur ne correspond pas à son type, la cellule affiche son texte d'origine et est signalée par une couleur au lieu d'être remplacée.

À partir de **2000 enregistrements**, l'affichage montre un extrait et indique en dessous de quoi il est l'extrait. C'est une fenêtre et non une troncature silencieuse : vous voyez qu'il y en a davantage. La limite a été mesurée et non décrétée — en deçà, le tableau s'affiche sans attente perceptible.

Dans l'**export portable**, en revanche, le tableau est complet, sans fenêtre. Un fichier que vous transmettez ne doit rien dissimuler : le destinataire n'a pas l'application et ne verrait pas qu'il manque quelque chose.

Les enregistrements ne se modifient pas dans cette vue, mais dans leur **formulaire**, que décrit la section suivante ; le bouton au début de chaque ligne l'ouvre. Le fichier de table est un stockage technique — il reste lisible à la main et, en cas d'urgence, corrigeable à la main, mais en fonctionnement normal vous n'y travaillez pas.

## Modifier les enregistrements dans le formulaire

Chaque enregistrement a un **formulaire** : une page propre qui montre ses champs les uns sous les autres, dans l'ordre de la définition, chacun avec son étiquette. L'application le génère à partir de la définition de la table ; il n'y a rien à construire. Dans le formulaire, vous créez des enregistrements, les modifiez et les supprimez.

### Ouvrir et créer

Un enregistrement existant s'ouvre par le bouton **« Ouvrir l’enregistrement »** au début de sa ligne, devant le bouton des justificatifs de modification, en mode lecture comme en mode Direct. Au clavier, la flèche gauche y mène depuis le bouton des justificatifs.

Depuis le résultat d'une requête d'enregistrements, un clic sur un enregistrement ou sur un lien ouvre de même le formulaire (page [Requête Perspective](frontmatter-query.md)). Celui-ci montre alors l'état enregistré, même si la requête affiche un état non enregistré. Dans un formulaire de liste, le clic ouvre le formulaire que la liste nomme (section « Formulaire de liste »). Un lien vers un enregistrement dans le texte d'un document (section « Lien vers un enregistrement isolé ») et un résultat d'enregistrement de la recherche portant sur la zone (section « Trouvabilité : recherche et liens ») ouvrent de même le formulaire.

Trois chemins créent un nouvel enregistrement :

- le bouton **« Nouvel enregistrement »** sous chaque table, y compris sous une table vide,
- le bouton **« Nouvel enregistrement »** dans la ligne de chaque table de la vue d'ensemble de la base de données,
- la commande **« Nouvel enregistrement dans la table active »** de la palette de commandes. Elle agit sur le fichier de table de l'onglet actif ; si aucun n'y est ouvert, la barre d'état le signale.

Le formulaire s'ouvre dans un onglet propre dont le titre nomme le fichier et l'enregistrement. Il en existe un par fenêtre : si vous ouvrez un autre enregistrement, le même onglet l'affiche. Si la modification en cours n'est pas encore enregistrée, le formulaire demande d'abord s'il faut l'abandonner.

Un nouvel enregistrement reçoit son identifiant interne dès l'ouverture du formulaire : il figure dans l'en-tête, et le niveau de crue `lastId` de la table est déjà mis à jour. Les champs sont vides, et l'enregistrement n'arrive dans le fichier qu'au premier enregistrement.

### Consulter et modifier

Le formulaire s'ouvre **en lecture**. Les valeurs y figurent sous forme de texte, une valeur booléenne sous forme de coche, et un champ obligatoire est signalé comme tel. L'en-tête porte les actions **« Modifier »**, **« Supprimer »** et **« Justificatifs »** ; la dernière ouvre les justificatifs de modification de l'enregistrement.

Derrière elles figure l'action **« Afficher dans le document de table »**. Elle ouvre le fichier de table et amène la ligne de l'enregistrement sous vos yeux, même lorsque celui-ci se trouve dans un fichier suivant : en mode lecture, l'affichage défile jusqu'à sa ligne, pourvu qu'il figure parmi les 2000 enregistrements affichés ; dans les vues Direct et Source, le curseur se place sur cette ligne. Pour un nouvel enregistrement, l'action manque, car l'enregistrement ne figure pas encore dans le fichier.

**« Modifier »** fait de chaque champ une saisie sous la forme de son type :

| Type | Saisie |
| --- | --- |
| `string`, `link`, `record` | saisie de texte sur une ligne, pour `record` avec aide à la saisie |
| `multiline` | saisie de texte sur plusieurs lignes |
| `number`, `date`, `time` | saisie d'un nombre, d'une date ou d'une heure |
| `boolean` | case à cocher |

Une valeur qui ne correspond pas à son type reçoit à la place la simple saisie de texte, afin que vous puissiez voir et corriger ce qui figure dans le fichier ; une saisie numérique l'écarterait sinon en silence.

**« Enregistrer »** écrit la modification et revient à la lecture, **« Abandonner »** revient sans rien écrire à l'état lu. Seuls les champs que vous avez modifiés sont écrits. Si vous n'avez rien modifié, il n'y a rien à enregistrer, et la barre d'état le signale.

Si un enregistrement n'est pas modifiable selon la condition de sa table, **« Modifier »** et **« Supprimer »** manquent, et une phrase dans le formulaire en donne la raison, avec le message de la condition si elle en a un. Si votre rôle ne permet pas la modification, « Modifier » manque et la phrase nomme le rôle ; s'il ne permet pas la suppression, « Supprimer » manque (section « Autorisations »).

### Champs de référence et aide à la saisie

Un champ de type `record` montre en lecture la forme d'affichage de sa cible et son identifiant, par exemple `Umberto Eco (r-00007)`, même lorsque le fichier contient la forme courte `r-7`. Si la valeur ne touche pas exactement un enregistrement de la table cible, une remarque au champ le signale.

En modification, le champ propose une **aide à la saisie** : une liste des enregistrements de la table cible, chacun avec sa forme d'affichage et son identifiant. La frappe affine la liste, un choix inscrit l'identifiant, et la touche Échap ferme la liste. Si plus de cinquante entrées correspondent, la liste indique combien il y en a encore.

Vous n'êtes pas obligé de choisir. Une forme courte de l'identifiant ou une valeur de la clé fonctionnelle à un seul élément saisie à la main reste en place, et à l'enregistrement l'application écrit à sa place l'identifiant complété, comme le décrit la section « Relations entre tables ». Si la définition ne nomme aucune table cible ou si celle-ci n'existe pas, le champ est en lecture seule.

### Messages et modifications par d'autres

Si l'application refuse une modification, rien n'est écrit ; le formulaire reste en modification, et votre saisie reste en place. Chaque message se trouve là où il a sa place. S'il concerne un champ, il figure à ce champ, le champ est signalé, et le premier champ concerné reçoit le focus. Une règle enfreinte sous `checks` signale tous ses champs et figure dans l'en-tête du formulaire, de même que tout message qui n'appartient à aucun champ, par exemple celui de la protection contre la suppression.

Dès la lecture, le formulaire signale par un message au champ une valeur qui ne correspond pas à son type, qui enfreint une règle de champ ou qui manque alors qu'elle est obligatoire.

Si quelqu'un a modifié l'enregistrement depuis que le formulaire l'a lu, par exemple à la main dans le fichier de table, l'application n'enregistre pas pour l'instant. Le formulaire affiche alors le bloc **« L’enregistrement a été modifié entre-temps »** avec deux chemins :

- **« Recharger »** abandonne votre modification et affiche l'état trouvé.
- **« Enregistrer quand même »** écrit votre version. Un justificatif de la nature **Modifié de l'extérieur** retient la différence trouvée, de sorte que rien ne disparaît sans être remarqué.

Le second chemin vérifie lui aussi toutes les règles de la table ; aucune règle ne peut être contournée par lui.

### Supprimer

**« Supprimer »** pose d'abord la question : **« Supprimer cet enregistrement ? »** Avec **« Oui, supprimer »**, l'enregistrement est supprimé et le formulaire se ferme ; **« Non »** laisse tout en l'état. Un enregistrement vers lequel une colonne de lien pointe encore ne peut pas non plus être supprimé ici. Quels enregistrements renvoient à lui, l'utilisation décrite plus bas le montre à l'avance.

### Le formulaire comme fichier

Le formulaire généré peut être mis en forme. La commande **« Enregistrer le formulaire comme fichier »** dans l'en-tête du formulaire l'écrit comme document ordinaire à côté du fichier de table, sous le nom de celui-ci suivi de ` Form`, pour `Clients.md` donc `Clients Form.md`. Un fichier existant de ce nom n'est jamais écrasé. Le nouveau fichier commence par la version générée :

```markdown
---
title: Clients Form
db-form:
  table: Clients
---

# Clients

**Nom:** {{field:nom}}

**Quantité:** {{field:quantite}}
```

Le conteneur `db-form` nomme la table, et pour chaque champ un **espace réservé de champ** `{{field:<nom>}}` figure dans le texte. Autour des espaces réservés, tout est du Markdown ordinaire : un titre entre deux champs ou une phrase explicative apparaît dans le formulaire tel qu'il figure dans le fichier. Une barre oblique inverse devant les accolades fait d'un espace réservé du texte ordinaire.

**Deux sens de `table`.** Dans le frontmatter de la base de données, dans le conteneur `db-form` comme dans l'indication `options.table` d'une colonne de référence, `table` nomme une table de base de données. Dans un bloc de la [Perspective Datatable](datatable.md), la ligne `table:` donne en revanche un nom à cette datatable elle-même, sous lequel les diagrammes et les liens l'atteignent. Seul le mot est le même : une datatable n'est pas une table de base de données.

À l'ouverture suivante, le formulaire affiche le texte du fichier. L'en-tête indique alors de quel fichier provient le formulaire, et la commande n'est plus proposée ; la vue d'ensemble de la base de données nomme le fichier dans la colonne **« Formulaire »**. Si le fichier est supprimé, le formulaire affiche de nouveau la version générée.

**Ce que le fichier nomme est affiché.** Un champ que le fichier ne nomme pas n'est pas affiché par le formulaire, et il reste intact à l'enregistrement ; un nouvel enregistrement ne remplit que les champs nommés. Un espace réservé qui n'est ni de champ ni de valeur et un nom de champ que la table ne connaît pas restent du texte et sont signalés, comme le décrit la section « Indications fautives ».

L'**espace réservé de valeur** `{{value:<expression>}}` affiche une valeur que le formulaire calcule à partir des champs de l'enregistrement affiché, par exemple `{{value:quantite * prix}}` pour le montant d'une position ou `{{value:lent + dur(14 days)}}` pour la date quatorze jours après le champ `lent`. L'expression relève du [langage de requête](frontmatter-query.md), comme dans une règle de contrôle : elle nomme les champs par leur nom, un champ de date compte comme une date, et les mêmes opérations et fonctions s'appliquent. La valeur s'affiche comme dans une requête de table, un nombre par exemple sous la forme `7.5`, une date sous la forme `2026-10-15`, une durée sous la forme `10d` et une valeur booléenne sous la forme `true` ou `false`. En modification, le formulaire la recalcule à chaque saisie, sans enregistrer. La valeur elle-même n'est jamais enregistrée ; ce n'est pas un champ de l'enregistrement.

Si l'expression ne donne aucune valeur pour un enregistrement, par exemple parce qu'un champ est vide, l'emplacement reste vide et marqué ; une infobulle l'indique, et rien n'est signalé. Une expression invalide, par exemple avec une faute de frappe, laisse elle aussi l'emplacement vide et est signalée avec sa ligne dans l'en-tête du formulaire ; le reste du formulaire reste utilisable.

**La valeur s'insère dans la phrase** lorsque l'espace réservé se trouve à l'intérieur d'une ligne de texte : `Échéance le {{value:lent + dur(14 days)}}` affiche « Échéance le 2026-10-15 » sur une seule ligne. Si l'espace réservé est seul sur sa ligne, la valeur reçoit une ligne propre. Un espace réservé de champ se trouve toujours sur une ligne propre.

**Sections conditionnelles.** Une section entre les marqueurs `{{when:<condition>}}` et `{{end}}` n'apparaît que si la condition est remplie. Les deux marqueurs sont seuls sur leur ligne ; une section englobe donc des paragraphes entiers, des titres, des tableaux, des listes et les espaces réservés qu'ils contiennent, jamais des moitiés de ligne. La condition est une expression du [langage de requête](frontmatter-query.md) portant sur les champs de l'enregistrement affiché, comme dans une règle de contrôle : `{{when:onloan}}` affiche la section pour un livre prêté, `{{when:pages > 500}}` pour un livre épais. Les sections peuvent être imbriquées ; une section intérieure n'apparaît que si la section extérieure apparaît aussi. En modification, une section apparaît et disparaît à chaque saisie, sans enregistrer ; en lecture, l'état enregistré s'applique.

```markdown
**On loan:** {{field:onLoan}}

{{when:onloan}}
## Out on loan

**Loan note:** {{field:loanNote}}
{{end}}
```

**La condition n'agit que sur l'affichage, jamais sur la valeur.** Un champ d'une section masquée conserve son contenu et est enregistré avec le reste ; la condition ne le soustrait ni à l'enregistrement ni aux règles de contrôle. Si une règle refuse un tel champ, le message figure dans l'en-tête du formulaire et nomme le champ ; la section reste masquée. Il n'existe ni branche « sinon » ni boucles : un cas contraire s'écrit comme une deuxième section avec la condition niée, par exemple `{{when:NOT onloan}}`. Une barre oblique inverse devant les accolades fait aussi d'un marqueur du texte ordinaire.

**Chemins de référence.** Les espaces réservés de valeur et les conditions lisent aussi, par un champ de référence, les champs de l'enregistrement référencé : dans un formulaire des prêts, `{{value:book.title}}` montre le titre du livre prêté, et `{{when:book.onloan}}` montre une section tant que le livre est marqué comme prêté. Avant le point se trouve le champ de référence, après lui un champ de la table cible. L'application calcule un tel chemin après un court délai, et jusqu'à la réponse la valeur précédente reste affichée ; en modification, le chemin suit chaque saisie, y compris le choix d'une autre référence, sans enregistrer. Si la référence est vide ou ne désigne aucun enregistrement, l'emplacement reste vide et marqué, sans message, et une section reste masquée. Si le chemin ne nomme aucun champ de référence de la table ou aucun champ de la table cible, l'emplacement reste vide lui aussi, et le formulaire le signale avec sa ligne dans l'en-tête.

**Positions.** L'espace réservé `{{list:<fichier de requête>}}` montre dans le formulaire les enregistrements d'une autre table qui pointent vers l'enregistrement affiché, et les enregistre avec lui ; la section « Positions dans le formulaire » le décrit.

**Fichier de formulaire et modèle.** Un fichier de formulaire ressemble à un [modèle](templates.md), parce que tous deux écrivent leurs espaces réservés entre doubles accolades, et pourtant il fait autre chose. Un modèle est appliqué une fois : `{{date}}` est remplacé par la date à la création d'un fichier, et ensuite du texte figure à cet endroit. Un fichier de formulaire n'est jamais appliqué : le formulaire résout `{{field:Name}}` et `{{value:quantite * prix}}` à chaque affichage d'après l'enregistrement affiché, et le fichier garde ses espaces réservés. Un fichier de formulaire a donc sa place à côté de sa table et non dans le dossier de modèles.

### Après le redémarrage

Si la restauration de session est activée (Aide → Restaurer la session) et que le formulaire est ouvert à la fermeture, il revient au démarrage suivant : à sa place parmi les documents ouverts de sa colonne, avec le même enregistrement dans le même fichier de formulaire. S'il était le document affiché dans sa colonne, il le redevient. Un nouvel enregistrement pas encore sauvegardé ne revient pas. Le parcours de « Retour » recommence après le redémarrage.

**Si l'enregistrement n'existe plus**, par exemple parce qu'il a été supprimé entre la fermeture et le redémarrage, le formulaire ne disparaît pas. Il affiche la remarque que l'enregistrement n'existe plus dans sa table et que le formulaire reste ouvert jusqu'à ce que vous le fermiez, et porte dans son en-tête l'action **« Ouvrir la table »**, qui ouvre le fichier de table.

**Si la base de données est désactivée au démarrage**, le formulaire ne revient pas, mais son entrée n'est pas perdue : elle reste en attente et se conserve aussi au fil d'autres redémarrages. Après la réactivation, le formulaire revient à sa place au démarrage suivant. Si sa colonne ne contenait que le formulaire, il revient dans la colonne restante, derrière ses documents.

### Plusieurs formulaires et le formulaire par défaut

Une table peut avoir plusieurs fichiers de formulaire, par exemple un détaillé et un succinct. Celui qui s'affiche à l'ouverture d'un enregistrement, le **formulaire par défaut**, est fixé par l'indication `form` dans la définition de la table, avec le nom du fichier de formulaire sans extension, comme la cible d'un lien wiki :

```yaml
db-table:
  form: Clients Form
  fields:
    - name: Nom
      type: string
```

Sans cette indication, le premier fichier de formulaire de la table selon le chemin s'applique, et s'il n'y en a pas, le formulaire généré ; un fichier de formulaire unique fonctionne donc sans aucune indication. Les autres fichiers de formulaire restent des formulaires de la table : un lien depuis un formulaire y mène, comme le décrit la section suivante.

Dans la vue d'ensemble de la base de données, la colonne **« Formulaire »** nomme le formulaire par défaut de chaque table et ensuite le nombre des autres fichiers de formulaire, par exemple « +1 autre(s) ». Si le formulaire par défaut est supprimé ou renommé sans que l'indication soit mise à jour, la vue d'ensemble le signale, et la règle sans indication s'applique de nouveau.

### Passer d’un formulaire à l’autre

Un lien dans le texte d'un fichier de formulaire, comme lien wiki tel que `[[Clients Court]]` ou comme lien Markdown, agit dans le formulaire selon sa cible :

- Si la cible est **un autre fichier de formulaire de la même table**, le formulaire affiche le même enregistrement dans ce formulaire.
- Si la cible est **le fichier de formulaire d'une autre table**, une phrase sous l'en-tête indique qu'il manque pour cela un enregistrement ; rien n'est ouvert ni créé.
- Si la cible est **un enregistrement**, comme lien wiki tel que `[[Clients#^r-00002]]`, le formulaire affiche cet enregistrement dans le formulaire par défaut de sa table. Si le lien ne correspond à aucun enregistrement de façon univoque, il ouvre le fichier de table ; un lien Markdown vers un fichier de table l'ouvre comme document.
- **Tout autre lien** ouvre son document, comme partout dans l'application.

Un **champ de référence** rempli est cliquable en lecture : un clic ouvre l'enregistrement référencé dans le formulaire par défaut de sa table. Si la valeur ne correspond à aucun enregistrement, une phrase sous l'en-tête l'indique, et le formulaire reste où il est. Un champ de référence vide n'est pas cliquable, et en modification le champ reste la saisie avec aide à la saisie.

Chaque changement par un lien, un champ de référence, un lien vers un enregistrement dans le texte ou « Utilisé par » retient l'enregistrement d'où il vient. **« Retour »** au-dessus du titre dans l'en-tête y ramène, dans son formulaire, aussi sur plusieurs étapes ; sans étape précédente, le bouton n'apparaît pas. Si vous ouvrez un enregistrement depuis l'extérieur, par exemple depuis sa ligne ou depuis la vue d'ensemble, le parcours recommence, et la fermeture du formulaire y met fin. Si la modification n'est pas enregistrée, le formulaire demande avant chaque changement, aussi avant « Retour » : **« Abandonner »** change, **« Continuer la modification »** reste avec toutes les saisies.

## Sauvegarde par l'application

Les enregistrements se créent, se modifient et se suppriment dans le formulaire que décrit la section ci-dessus. Il enregistre par un chemin de l'application qui est le même pour toute modification d'enregistrements ; ce que décrit cette section vaut donc pour chacune d'elles.

Toute modification passe par un chemin qui la vérifie avant l'écriture. Une valeur qui ne correspond pas au type de son champ est refusée, tout comme un champ vide qui exige une valeur. Dans les deux cas, rien n'est écrit.

À cela s'ajoutent les règles issues de la définition de la table, décrites dans les sections ci-dessus. Une modification est également refusée si

- le **rôle** propre ne permet pas l'opération sur la table (section « Autorisations »),
- une **clé fonctionnelle** serait ensuite attribuée deux fois,
- un **lien** ne touche aucun enregistrement ou plus d'un, ou si sa table cible manque,
- un enregistrement doit être supprimé alors qu'un **lien** pointe encore vers lui,
- une valeur ou un enregistrement enfreint une **règle de contrôle**,
- un **champ** est modifié alors qu'il est bloqué selon sa propre condition,
- un enregistrement n'est **pas modifiable** selon la condition de sa table, ou
- les tables de la zone ne sont **pas encore entièrement lues** et la modification pose un lien ou supprime un enregistrement.

L'application signale ensemble les motifs issus de ces règles, et pas seulement le premier.

**Une sauvegarde agit entièrement ou pas du tout**, même lorsqu'elle touche plusieurs tables et plusieurs fichiers : ensuite, soit toutes ses modifications sont en place, soit aucune. Elle écrit ses justificatifs de modification dans la même opération, et tous les justificatifs d'une opération portent le même **identifiant d'opération**.

Avant que les nouvelles versions des fichiers ne prennent effet, l'application les écrit durablement sur le support de données. Une coupure de courant ou une connexion réseau interrompue ne laisse donc aucune opération à moitié faite. (Sous Linux, cela vaut avec une réserve : l'application n'y écrit pas durablement les entrées de dossier elles-mêmes, de sorte qu'une coupure de courant à l'instant même de la sauvegarde peut laisser l'opération inachevée jusqu'à la prochaine ouverture de la zone.) Cela prend du temps : une sauvegarde dure environ un dixième de seconde sur un disque local, et d'un quart de seconde à une demi-seconde sur un lecteur réseau.

Qui lit en même temps, pendant qu'une sauvegarde est en cours, peut voir un état intermédiaire, par exemple l'en-tête d'une facture sans ses lignes. C'est un cas connu et accepté délibérément.

Si un plantage laisse une sauvegarde inachevée, l'application la mène à son terme lors de la sauvegarde suivante dans cette zone ou à l'ouverture de la zone. D'ici là, les tables concernées n'acceptent aucune modification et le signalent par un message. Rien ne se perd pour autant.

## Justificatifs de modification

Qui crée, modifie ou supprime un enregistrement par l'application laisse une trace : à côté du fichier de table, l'application tient un second fichier dans lequel chacune de ces modifications figure comme **justificatif de modification**. Il répond à la question de savoir qui a modifié quel champ, quand, et de quelle valeur vers quelle valeur.

### Ce qu'ils sont et où ils se trouvent

Au fichier de table `Clients.md` correspond le fichier `Clients.mddl` dans le même dossier. L'application le crée et le complète ; vous n'avez rien à faire pour cela, et vous ne devez rien y faire.

Cinq propriétés sont à connaître :

- Il **n'apparaît dans aucune liste de fichiers** de l'application et ne s'ouvre pas comme un document. C'est un rangement technique à côté de la table.
- Il est **seulement complété** et jamais réécrit. Un justificatif écrit reste en place caractère pour caractère ; la seule opération qui y touche est le regroupement décrit plus bas.
- Il **suit** la table lorsque vous la renommez ou la déplacez dans l'application, et il part avec elle à la corbeille du système d'exploitation lorsque vous la supprimez. De là, vous les récupérez tous les deux ensemble.
- Qui le **modifie ou le supprime à la main** perd la trace irrémédiablement. Il n'existe pas de second rangement d'où elle pourrait être rétablie.
- Tous les justificatifs d'une même sauvegarde portent **le même identifiant d'opération**. Il reste ainsi reconnaissable dans le fichier que plusieurs modifications vont ensemble, par exemple l'en-tête d'une facture et ses lignes.

### La vue au niveau de l'enregistrement

En mode lecture et en mode Direct, chaque ligne d'enregistrement porte à son début un bouton **« Afficher les justificatifs de modification »**. Un clic dessus ouvre la page **« Justificatifs de modification »** dans un onglet propre. Sans souris, la tabulation mène dans le tableau, les flèches changent de ligne, les touches Origine et Fin mènent à la première et à la dernière, et la touche Entrée ou la barre d'espace ouvre la page.

La page montre les justificatifs de l'enregistrement, **le plus récent en premier**. Chacun porte le moment dans votre fuseau horaire, la nature (**Créé**, **Modifié**, **Supprimé**), l'utilisateur, l'ordinateur et, pour chaque champ touché, la valeur **Avant** et **Après**. Une valeur manquante est indiquée comme « absent », une valeur vide comme « vide » ; les deux ne sont pas la même chose.

Deux natures sont signalées à part :

- **Modifié de l'extérieur** signifie que l'application a trouvé, lors de sa propre écriture suivante, une différence qu'elle n'avait pas causée elle-même. Aucun auteur n'est alors connu, et le justificatif le dit.
- **Regroupé** signifie que le regroupement a réuni en un seul justificatif une période de plusieurs modifications. Il indique combien de modifications il remplace, depuis quand la période s'étend et quelles natures s'y trouvaient.

Là où la trace se rompt, la page le dit à l'endroit où cela se remarque. Deux cas existent. La valeur précédente d'un champ **diverge**, le justificatif ne se rattache alors pas à celui qui le précède. Ou bien un justificatif **n'est pas lisible**, ce qu'il a modifié est alors inconnu, et la vérification reprend après lui. Si le fichier entier n'est pas lisible, la page le dit également et laisse son contenu intact.

La page **ne fait que lire**, rien n'y est modifié ; le bouton « Actualiser » récupère l'état à nouveau. Avec de très nombreux justificatifs, elle montre un extrait et écrit au-dessus de quoi il est un extrait.

### Le regroupement

Un fichier de justificatifs grandit à chaque modification. Pour qu'il ne grandisse pas sans fin, l'application regroupe, à partir d'un double seuil, les justificatifs les plus anciens des enregistrements souvent modifiés au lieu de les supprimer. Sans indication propre, **0,7 Mo** valent pour le fichier entier et **200 justificatifs par enregistrement**.

Les deux limites se règlent table par table, dans le frontmatter du fichier de table sous l'indication `changeLog` :

```yaml
---
db-table:
  fields:
    - name: titre
  changeLog:
    maxBytes: 2000000
    maxPerRecord: unlimited
---
```

`maxBytes` est la taille du fichier en octets, `maxPerRecord` le nombre de justificatifs par enregistrement. Le mot `unlimited` désactive la limite concernée. Chaque indication vaut pour elle-même, une indication omise garde sa valeur par défaut, et une indication inexploitable est signalée comme anomalie, après quoi la valeur par défaut s'applique également.

**Le regroupement a un prix.** Un justificatif regroupé indique de quelle valeur vers quelle valeur une période a mené, combien de modifications il remplace et si une création ou une suppression s'y trouvait. Il n'indique plus qui a modifié quoi et quand, un par un ; cette part de la trace a disparu ensuite. Une promesse vaut sans exception : jamais rien n'est regroupé par-dessus un justificatif de la nature **Modifié de l'extérieur**. Il termine la période et reste en place, inchangé.

### La limite, nommée honnêtement

Une modification que vous faites à la main dans un éditeur sur le fichier de table ne produit **aucun** justificatif. L'application ne la voit pas au moment où elle se produit.

Ce qu'elle fait à la place : lors de sa propre écriture suivante, elle compare l'état trouvé à l'état attendu. S'ils diffèrent, elle ne sauvegarde pas encore la nouvelle modification, afin que la version actuelle puisse être consultée ; si la modification est tout de même sauvegardée ensuite, un justificatif de la nature **Modifié de l'extérieur** retient la différence. Ainsi, rien ne disparaît sans être remarqué. Le justificatif n'indique cependant ni le moment ni l'auteur de cette modification, car ni l'un ni l'autre n'est connu.

**Par cette voie, les autorisations ne protègent que la définition.** Si vous sauvegardez une définition modifiée dans l'éditeur de l'application, celle-ci contrôle votre rôle (section « Autorisations »). Une modification du bloc d'enregistrements, en revanche, elle ne la contrôle là ni par rapport au rôle ni par rapport aux règles de la table, et avec un autre éditeur aucun des deux contrôles ne s'applique.

## Verrous

Un verrou veille à ce qu'un enregistrement ne soit pas modifié à deux endroits en même temps, par exemple dans deux fenêtres de l'application. Les verrous et les justificatifs de modification sont conçus pour préparer l'accès partagé de plusieurs personnes ; cet accès viendra avec EM4us, le futur composant serveur. EM4me lui-même est un outil pour une personne qui travaille seule et en local. L'utilisation de plusieurs ordinateurs dans une même zone sur un lecteur réseau n'est pas garantie.

### Ce qui est verrouillé, et quand

Ce qui est verrouillé, c'est l'**enregistrement** isolé, et cela au moment même où sa modification commence. Il est libéré dès que la modification s'achève, lors de la sauvegarde comme lors de l'abandon. La simple consultation ne verrouille rien : sinon, une liste de centaines d'enregistrements les verrouillerait tous d'un coup à chaque regard.

Dans le formulaire, la modification commence avec **« Modifier »** ou avec **« Supprimer »**, qui prend le verrou dès avant sa question de confirmation. Elle s'achève à l'enregistrement, avec **« Abandonner »**, avec **« Recharger »**, à l'annulation de la question de suppression, au passage à un autre enregistrement et à la fermeture de l'onglet du formulaire. Si l'application refuse un enregistrement, le verrou demeure, car la modification continue. L'ouverture du formulaire et la création d'un nouvel enregistrement ne verrouillent rien. Dans un formulaire de liste, la modification d'une ligne commence avec « Modifier », le double-clic ou « Supprimer » et s'achève avec « Enregistrer », « Annuler », la réponse à la question de suppression et au plus tard quand le document est fermé, que la vue change ou qu'un autre document ouvert est affiché ; une nouvelle ligne ne verrouille rien. Une ligne de la section des positions d'un formulaire garde son verrou jusqu'à l'enregistrement ou l'abandon du formulaire.

Lorsque la **définition d'une table** est modifiée, la définition est verrouillée pendant ce temps, car une modification des colonnes touche tous les enregistrements de la table.

### Lorsqu'un enregistrement est déjà verrouillé

L'application n'écrase jamais en silence. Elle indique **qui** détient l'enregistrement, **sur quel ordinateur** et **depuis quand**, et vous laisse deux chemins : consulter l'enregistrement **en lecture seule** ou **forcer** le verrou.

Dans le formulaire, cette information apparaît sous forme du bloc **« L’enregistrement est verrouillé »**, et le formulaire reste en lecture. **« Consulter seulement »** ferme le bloc. **« Forcer le verrou »** n'apparaît qu'une fois le délai ci-dessous écoulé, et mène directement en modification après le forçage ; si le verrou a changé entre-temps, le forçage est refusé, et le bloc affiche les indications relues.

Un verrou d'autrui ne se force que lorsqu'il est **plus ancien que quatre heures**. Le délai est volontairement grossier : les horloges de deux ordinateurs peuvent diverger sans qu'une modification en cours paraisse abandonnée. Même une fois le délai écoulé, l'application ne retire jamais d'elle-même un verrou d'autrui. Elle se contente de proposer de le forcer, et vous décidez. Celui dont le verrou a été forcé l'apprend dès que sa propre modification s'achève.

**Détenteur inconnu.** S'il existe un verrou qui n'indique aucun détenteur, par exemple parce qu'il a été écrit de façon incomplète lors de sa création, le bloc le dit exactement ainsi au lieu d'inventer des indications. Là aussi, vous pouvez seulement consulter l'enregistrement, et le verrou ne se force qu'une fois le même délai écoulé.

Si une **autre fenêtre** de cette application modifie l'enregistrement, le bloc le dit aussi. Seul « Consulter seulement » est alors proposé, car le verrou d'une de vos propres fenêtres ne se force pas.

### Après un plantage

Si un verrou **vous appartenant** subsiste après un plantage de l'application, il ne vous barre pas la route : l'application reconnaît que le verrou provient de cet ordinateur et que le programme qui le détenait ne tourne plus, et elle le reprend sans poser de question. Si en revanche c'est une seconde fenêtre de l'application qui détient l'enregistrement, celui-ci y compte comme verrouillé, comme pour toute autre personne.

### Ce que le verrou ne fait pas

Un verrou est une convention entre les applications qui travaillent dans cette zone, et non une propriété du fichier. Qui modifie le fichier de table à la main dans un éditeur ne voit aucun verrou. C'est pourquoi l'application vérifie en outre à **chaque** sauvegarde si l'enregistrement se présente encore tel qu'elle l'a lu, même lorsqu'elle détient le verrou.

### Le dossier de verrous

Les verrous se trouvent sous forme de petits fichiers dans un dossier situé à la racine de la zone, par défaut `.area-locks`. Il naît avec le premier verrou, et l'application le tient : il n'apparaît dans aucune liste de fichiers, ni dans la recherche, ni dans les statistiques. À la différence des justificatifs de modification, il ne retient rien de durable. Si personne ne travaille, il est vide et peut manquer. Pendant une sauvegarde, l'application y dépose en outre un petit journal de l'opération, qui disparaît à nouveau à la fin de celle-ci ; si un plantage laisse l'opération inachevée, le journal reste en place jusqu'à ce que l'application ait mené l'opération à son terme. N'en supprimez rien à la main tant que quelqu'un travaille ou qu'un journal s'y trouve.

Vous modifiez le **nom du dossier** sous **Fichier → Paramètres… → Zone actuelle → Base de données**, dans le champ **« Nom du dossier de verrous »**. Ce qui suit s'applique :

- Le nom vaut **pour la zone** et donc pour toutes les personnes qui y travaillent. Il réside dans le fichier de la zone et voyage avec le dossier de la zone.
- Le nom **doit commencer par un point**, car c'est précisément à cela que l'application reconnaît qu'un dossier n'a sa place ni dans l'index, ni dans la recherche, ni dans les statistiques. Sont en outre interdits les séparateurs de chemin, les caractères interdits sous Windows et les noms de périphériques réservés comme `CON`, et rien d'autre ne doit encore se trouver sous ce nom à la racine de la zone.
- La modification renomme le dossier existant au lieu d'en créer un second. Elle n'aboutit que **tant que personne n'a d'enregistrement en cours de modification**. Sinon, le message indique qui travaille en ce moment, et tout reste en l'état.

## Autorisations

**Les autorisations empêchent les erreurs de manipulation, non les abus.** Elles sont une convention de travail comme le verrou et non une garantie de confidentialité. Il n'existe pas de droit de lecture : qui peut lire les fichiers de la zone les lit avec n'importe quel éditeur et peut aussi les y modifier, sans qu'aucun rôle soit consulté. Seule la limite du système d'exploitation peut être imposée, c'est-à-dire qui a le droit d'accéder au dossier.

Au sein de l'application, les autorisations fixent qui peut modifier quoi. La fiche d'identité porte pour cela des **rôles** nommés, et chaque rôle indique par table quelles actions sont permises. La séparation la plus importante est celle entre l'entretien des données et la modification de la définition : qui utilise une base de données livrée pour en saisir les données ne doit pas modifier son schéma par mégarde. Cela aide déjà lorsqu'une seule personne travaille avec la base de données.

### Rôles dans la fiche d'identité

Les rôles figurent sous `roles` dans le conteneur `db-database`, à côté le rôle par défaut et l'attribution des noms de connexion :

```yaml
db-database:
  name: Bibliothèque
  roles:
    bibliothecaire: all
    auxiliaire:
      Livres: [update]
      Prêts: [create, update, delete]
  defaultRole: auxiliaire
  users:
    mstumm: bibliothecaire
```

Chaque rôle porte soit le mot `all`, soit une correspondance de noms de table à une liste des opérations permises :

| Opération | Signification |
| --- | --- |
| `create` | créer des enregistrements |
| `update` | modifier des enregistrements |
| `delete` | supprimer des enregistrements |
| `define` | modifier la définition de la table |

Le mot `all` vaut à trois endroits : comme valeur d'un rôle pour les quatre opérations sur toutes les tables, comme nom de table pour toutes les tables et comme entrée d'une liste pour les quatre opérations. Une table qu'un rôle ne nomme pas ne lui permet rien, de même qu'une liste vide. Les opérations et les noms de table valent sans égard aux majuscules et minuscules, les noms de rôle tels qu'ils sont écrits.

**Sans `roles`, tout est permis**, comme dans une base de données sans autorisations. La vue d'ensemble de la base de données montre dans le bloc de la fiche d'identité la section **« Rôles »**, avec une ligne par rôle et ses autorisations par table. Si un rôle nomme une table qui n'existe pas ou une opération inconnue, le rôle entier est considéré comme non défini ; la vue d'ensemble nomme chacune de ses erreurs parmi les anomalies.

### Quel rôle s'applique

Sous `users`, la fiche d'identité attribue un rôle à des noms de connexion, et `defaultRole` nomme le **rôle par défaut** pour tous les autres. Ce qui compte est le nom de connexion sous lequel vous êtes connecté au système d'exploitation, le même que les justificatifs de modification indiquent comme utilisateur. Il est comparé caractère par caractère : `MStumm` et `mstumm` sont deux noms. Il n'existe pas d'interface de saisie ; l'attribution s'entretient à la main dans la fiche d'identité, comme la définition.

La première règle qui s'applique l'emporte :

1. Sans rôles, tout est permis.
2. Si votre nom de connexion figure sous `users`, le rôle qui lui est attribué s'applique.
3. Sinon, le rôle par défaut s'applique.
4. Sans rôle par défaut, tout est permis.

Le rôle qui s'applique à vous est indiqué par la vue d'ensemble dans la ligne **« Rôle propre »**, avec le nom de connexion tel quel : le rôle attribué, le rôle par défaut ou « tout est permis (aucune attribution) ». Qui saisit une attribution reprend le nom le plus sûrement depuis cet endroit. Si `users` ou `defaultRole` nomme un rôle qui n'existe pas, cette indication est considérée comme non définie et elle est également signalée.

### Contrôle à l'écriture

Toute modification d'enregistrements passe par la voie que décrit la section « Sauvegarde par l'application », et l'application y contrôle d'abord le rôle, pour chaque enregistrement avec la table et l'opération. Si l'autorisation manque, toute l'opération est refusée, et le message nomme le rôle, la table et l'action. Le début d'un nouvel enregistrement exige lui aussi `create` : sans cette autorisation, l'application refuse la création, par exemple avec la commande « Nouvel enregistrement dans la table active », et la barre d'état en indique la raison. Si les autorisations ne peuvent pas être déterminées, parce que les tables de la zone ne sont pas encore entièrement lues ou que la fiche d'identité n'est pas lisible, rien n'est écrit non plus, et le message invite à réessayer dans un instant.

### Contrôle à la sauvegarde de la définition

La définition est le conteneur `db-table` d'un fichier de table et la fiche d'identité `db-database`. Si la sauvegarde d'un fichier modifie sa définition, l'application exige `define` : sur cette table pour un fichier de table, sur toutes les tables pour la fiche d'identité. Cela vaut pour la sauvegarde dans l'éditeur, pour **« Enregistrer sous… »** vers un fichier existant ou nouveau et pour le remplacement dans toute la zone. Si l'autorisation manque, rien n'est écrit. À la sauvegarde apparaît la boîte de dialogue d'erreur **« Erreur d'écriture »** avec une phrase qui nomme le rôle et la table, et le texte reste non enregistré dans l'éditeur ; le remplacement dans toute la zone mentionne le fichier dans son rapport sous **« Non remplacés »**.

Ce qui ne touche pas la définition reste libre : le bloc d'enregistrements et le reste du texte du fichier, ainsi que les fichiers de formulaire et de requête. Une autre indentation ou un autre ordre des indications ne compte pas comme modification, l'ordre des champs en revanche oui, car il détermine les colonnes. Le niveau de crue `lastId` est tenu à jour par l'application elle-même ; il ne compte jamais comme modification.

### Dans les formulaires et la vue d'ensemble

Les formulaires ne proposent que ce que votre rôle permet ; qui conçoit un formulaire n'y écrit rien pour cela.

- Dans le **formulaire**, sans `update`, l'action « Modifier » manque, les champs restent en lecture, et une phrase nomme le rôle qui ne peut pas modifier les enregistrements de cette table. Sans `delete`, « Supprimer » manque.
- Sans `create`, le bouton **« Nouvel enregistrement »** manque sous la table et dans la ligne de la table de la vue d'ensemble.
- Un **formulaire de liste** et une section des positions ne proposent que les actions que `allow` et le rôle permettent ensemble. Si `allow` permet la modification et le rôle non, une infobulle de la ligne nomme le rôle ; une ligne à laquelle il ne reste aucune action apparaît atténuée.
- La **vue d'ensemble** indique sous chaque table les autorisations de votre rôle, par exemple « Autorisations : créer, modifier », pour autant que la fiche d'identité porte des rôles.

Les formulaires montrent, la décision tombe à l'écriture : qui déclenche une action par une autre voie est refusé par le contrôle ci-dessus.

### Ne pas s'exclure soi-même

Qui modifie la fiche d'identité de sorte que le rôle propre n'a pas `define` sur toutes les tables ne peut plus la modifier ensuite dans l'application, pas même pour revenir en arrière. C'est la séparation voulue, mais en utilisation par une seule personne, elle vous touche vous-même. Trois voies ramènent en arrière : vous ouvrez le fichier de la fiche d'identité avec un autre éditeur et y supprimez ou corrigez les indications de rôle. Vous désactivez l'extension « Base de données », corrigez la fiche d'identité dans l'application et la réactivez ; tant qu'elle est désactivée, la sauvegarde ne contrôle aucun rôle (section « Désactiver la base de données »). Ou bien, avant de restreindre des rôles, vous attribuez sous `users` votre propre nom de connexion à un rôle ayant `define` sur toutes les tables, par exemple un rôle avec `all`.

### Transmission et noms de connexion dans le fichier

Les rôles font partie de la définition et voyagent avec la fiche d'identité. L'attribution sous `users` figure dans le même fichier : les noms de connexion y sont lisibles par quiconque peut ouvrir le fichier, et une copie du dossier les emporte. L'application ne propose pas de transmission qui laisse l'attribution de côté ; qui transmet une zone en retire l'attribution au préalable si elle ne doit pas suivre. Chez le destinataire, une attribution ne s'applique que si son nom de connexion correspond exactement ; sinon, le rôle par défaut s'applique à lui ou, à défaut, tout est permis.

## Contrôle de cohérence

Lors de la sauvegarde par l'application, chaque modification est vérifiée. Ce qui parvient aux fichiers par un autre chemin, par exemple à la main dans un éditeur, personne ne le vérifie au passage, et certaines règles n'agissent pas du tout à la lecture. Le **contrôle de cohérence** parcourt donc l'ensemble des données et indique où elles contredisent les règles de la base de données.

Il se trouve dans la vue d'ensemble de la base de données : **« Contrôler la cohérence »** dans l'en-tête contrôle toutes les tables, **« Contrôler »** dans la ligne d'une table seulement celle-ci. La commande **« Contrôler la cohérence de la base de données »** de la palette de commandes contrôle elle aussi toutes les tables ; elle ouvre pour cela la vue d'ensemble.

Le résultat figure dans la section **« Contrôle de cohérence »** de la vue d'ensemble : la durée, par table le nombre de ses enregistrements et de ses constats, et en dessous les constats avec la table, l'enregistrement, le champ et une phrase en clair. Un clic sur l'enregistrement ouvre son formulaire. La liste montre au plus les 500 premiers constats et indique alors combien il y en a au total.

Sont trouvés :

- une clé fonctionnelle attribuée plusieurs fois, avec un constat par enregistrement concerné, et un identifiant qui figure plus d'une fois dans la table ;
- un lien qui ne touche aucun enregistrement, qui en touche plusieurs ou qui pointe par une valeur de clé vers une table à clé à plusieurs éléments, et une colonne de lien dont la table cible manque ou n'est pas indiquée ;
- une valeur qui ne correspond pas à son type, qui enfreint une règle de champ ou qui manque alors qu'elle est obligatoire, et un enregistrement qui enfreint une règle sous `checks` ;
- un enregistrement avec plus ou moins de cellules que la table n'a de champs ;
- dans un fichier de formulaire, un champ inconnu, un espace réservé inconnu, une expression invalide d'un espace réservé de valeur, un marqueur de section conditionnelle sans pendant, une condition invalide ou une table inconnue, et dans une définition de table une indication `form` qui ne nomme aucun fichier de formulaire de cette table ;
- dans un fichier de formulaire, en outre, un chemin qui ne nomme aucun champ de référence ou aucun champ de la table cible, et une section des positions dont le fichier de requête manque ou ne porte pas `editable: true`, dont les positions n'ont aucun champ de référence ou aucun champ univoque vers la table du formulaire, ou dont la requête ne peut pas être complétée par la relation ;
- dans un fichier de requête, une indication inutilisable dans le conteneur `db-query`, une action inconnue dans `allow` et une indication `form` qui ne nomme aucun fichier de formulaire de la base de données ; un tel constat nomme le fichier au lieu d'une table dans la colonne « Source » ;
- lors du contrôle de toutes les tables, une indication inutilisable dans la fiche d'identité sous `roles`, `defaultRole` ou `users`, par exemple un rôle avec une table ou une opération inconnue ou une attribution à un rôle qui n'existe pas ; la vue d'ensemble en nomme la raison parmi les anomalies ;
- comme remarque, une table qui porte des enregistrements mais aucun niveau de crue `lastId` ou un niveau trop bas ; la prochaine création se place alors au-dessus du plus grand identifiant existant et le relève ;
- une table dont la définition est illisible ; ses enregistrements restent alors non contrôlés, et le contrôle se poursuit avec les autres tables.

**Le contrôle ne modifie rien.** Il ne fait que lire, et une fonction qui nettoie les constats d'elle-même n'existe volontairement pas : lequel de deux enregistrements ayant la même clé est le bon, c'est vous qui le décidez dans le formulaire. Le résultat reste affiché tant que la vue d'ensemble est ouverte ; après une correction, vous contrôlez de nouveau.

Le contrôle est rapide : avec quelques milliers d'enregistrements, il dure quelques dizaines de millisecondes. Si l'index de la zone est encore en construction, il le signale et vous invite à réessayer dans un instant.

## Utilisation des tables et des enregistrements

L'**utilisation** indique qui se sert d'une table ou d'un enregistrement. Elle n'est lue que lorsque vous la demandez, et rien n'est modifié.

**Pour une table**, l'action **« Utilisation »** figure dans sa ligne de la vue d'ensemble. Sous « Utilisé par », elle nomme les tables qui pointent vers cette table par une colonne de lien, chacune avec les noms de ces colonnes, ainsi que les fichiers de formulaire de la table. Si personne ne s'en sert, elle indique « Non utilisé ».

**Pour un enregistrement**, l'action **« Utilisé par »** figure dans l'en-tête de son formulaire tant que celui-ci est en lecture. Elle liste les enregistrements qui renvoient à lui, chacun avec la table, le champ, la forme d'affichage et l'identifiant ; un clic ouvre le formulaire de l'enregistrement qui renvoie, et « Retour » ramène à l'enregistrement affiché. Pour un nouvel enregistrement, l'action manque, car personne ne peut renvoyer à un enregistrement pas encore enregistré.

**La liste de l'enregistrement est l'aperçu de la protection contre la suppression.** Elle cherche exactement comme le contrôle lors de la suppression, y compris par la forme courte de l'identifiant, par la valeur d'une clé à un seul élément et dans les fichiers suivants d'une table. Si un enregistrement y figure, celui qui est affiché ne peut pas être supprimé. Un enregistrement qui renvoie à lui-même n'apparaît pas, car il n'empêche pas sa propre suppression. Comme pour la protection contre la suppression, seule la colonne de lien compte ; un lien dans le texte courant, par exemple `[[Clients#^r-00001]]`, n'est pas une utilisation.

## Trouvabilité : recherche et liens

Une recherche portant sur la **zone** trouve les enregistrements comme résultats propres. Dans le panneau « Résultats de recherche », après les groupes des documents, chaque table a son propre groupe, avec le nom de la table et la mention « Enregistrements ». Chaque ligne nomme l'enregistrement par sa forme d'affichage et le champ qui contient le terme cherché, et montre sa valeur avec l'occurrence mise en évidence. Un clic ouvre l'enregistrement dans le formulaire par défaut de sa table. La recherche porte sur les valeurs des champs dans tous les fichiers d'une table, y compris ses fichiers suivants, et, pour une table ouverte, sur son état non enregistré. Le décompte au-dessus de la liste compte ensemble les occurrences des documents et des enregistrements. Lorsque la ligne de remplacement est ouverte, les groupes d'enregistrements sont omis, car le remplacement dans la zone n'écrit pas dans les enregistrements.

Le bloc d'enregistrements lui-même ne fait en revanche pas partie de l'espace de recherche en texte intégral : un terme qui ne figure que dans les enregistrements d'un fichier de table ne donne aucune occurrence pour ce document, mais seulement les résultats d'enregistrement. Le texte explicatif situé au-dessus du bloc de données reste consultable comme document, et une occurrence située après lui mène toujours au bon endroit. La raison tient à la zone et non à la table : l'espace de recherche conserve en mémoire les textes de tous les fichiers Markdown et porte pour cela un plafond sur la zone **entière**. Quelques tables de quelques mégaoctets suffisent à le faire sauter, et dès lors chaque recherche relit le disque, y compris celle qui porte sur un document ordinaire. Les enregistrements dans l'espace de recherche coûteraient donc sa vitesse non pas à eux-mêmes, mais à la zone entière.

Par ailleurs, trois chemins mènent aux enregistrements :

- **Chercher dans le document ouvert.** Qui a le fichier de table devant lui et y cherche (par défaut `Ctrl+F`) cherche dans le texte qu'il a sous les yeux et retrouve ses enregistrements inchangés. La limite ci-dessus ne concerne que la recherche portant sur la zone.
- **Poser une requête d'enregistrements.** Un bloc `perspective-query` avec `LIST RECORDS` ou `TABLE RECORDS` trouve des enregistrements d'après leurs champs, par exemple tous les livres d'un auteur ; la page [Requête Perspective](frontmatter-query.md) la décrit. Une requête dont on a souvent besoin peut être rangée dans un fichier de requête (section « Fichiers de requête »).
- **Renvoyer directement à un enregistrement**, comme décrit dans la section suivante.

### Lien vers un enregistrement isolé

Un lien nomme la table et l'identifiant interne, écrit comme une ancre de bloc :

```markdown
[[Personen#^r-00042]]
```

**Deux autres graphies** valent également : la forme courte de l'identifiant, `[[Personen#^r-42]]`, et la forme d'affichage de l'enregistrement, `[[Personen#^Anna Muster]]`. Une forme d'affichage dans un lien se compose de lettres, de chiffres, d'espaces et des caractères tiret bas, trait d'union, point, apostrophe, virgule et parenthèses rondes ; avec un autre caractère, par exemple `&`, elle ne se résout pas. La comparaison se fait sans les espaces de début et de fin, mais en tenant compte des majuscules et minuscules. L'application ne réécrit pas le lien : ce qui est écrit est enregistré tel quel.

**La résolution suit un ordre fixe.** Si le fichier de table porte une ancre de bloc portant exactement ce nom, le lien vaut pour elle, et le linter signale que l'ancre de bloc masque un enregistrement ; de même, le clic mène à un titre du même nom. Sinon vient d'abord l'identifiant, long ou court, puis la forme d'affichage. Si plusieurs enregistrements portent la même forme d'affichage, le lien vaut tout de même, le linter le marque comme nom d'enregistrement ambigu, et le clic ouvre le fichier de table ; l'identifiant le rend univoque.

**La liste de suggestions aide à l'écriture.** Après `[[Table#^`, elle propose, après les ancres de bloc du fichier, les enregistrements de la table, chacun avec sa forme d'affichage et la mention « Enregistrement », au plus 30 entrées en tout. La saisie restreint la liste par forme d'affichage et identifiant, et la sélection écrit l'identifiant long, par exemple `[[Personen#^r-00042]]`.

Le lien **vaut** si la table nommée porte cet enregistrement, et il est rompu si elle ne le porte pas. Il se comporte ainsi comme tout autre lien de l'application. Il vaut également lorsque l'enregistrement ne se trouve pas dans le premier fichier de la table mais dans l'un de ses fichiers suivants : pour qui l'écrit, la table est une, et sa répartition sur plusieurs fichiers ne le regarde pas.

La vérification porte sur l'état **enregistré** de la table, comme pour toute autre ancre. Un lien vers un enregistrement qui vient d'être créé et n'a pas encore été sauvegardé ne vaut donc pas encore, et une forme d'affichage modifiée ne se résout qu'après l'enregistrement.

Le [linter Markdown](tools.md) montre si un lien vaut : une cible rompue reçoit un soulignement ondulé dans l'éditeur, c'est-à-dire dans les vues Source, Scindée et Direct. La vue lecture seule ne représente pas la validité ; les liens valides et rompus y ont la même apparence.

**Un clic ouvre le formulaire de l'enregistrement**, dans le formulaire par défaut de sa table. L'action **« Afficher dans le document de table »** dans l'en-tête du formulaire mène à la ligne dans le fichier de table (section « Consulter et modifier »). Si un lien ne correspond à aucun enregistrement de façon univoque, le clic ouvre le fichier de table. En dehors d'une zone ouverte, le clic ouvre le fichier de table et amène la ligne de l'enregistrement sous vos yeux. Dans le résultat d'une requête d'enregistrements, un clic sur un enregistrement ouvre de même son formulaire.

**Un lien dans le texte ne retient pas l'enregistrement.** Si l'enregistrement est supprimé, le lien se rompt comme tout autre lien de l'application, et le linter le montre. La protection contre la suppression repose sur la seule colonne de lien (section « Utilisation des tables et des enregistrements »).

## Fichiers de requête

Une requête dont on a souvent besoin reçoit un document à elle : s'il porte dans son frontmatter la marque `db-query` et dans son texte exactement un bloc de requête, c'est un **fichier de requête**. Le reste du texte décrit la requête et apparaît comme dans tout document.

````markdown
---
db-query:
pagesmin: 500
---

# Gros livres

Livres de plus de `pagesmin` pages, les plus épais d'abord.

```perspective-query
TABLE RECORDS auteur, pages FROM "Livres" WHERE pages > this.pagesmin SORT pages DESC
```
````

- **La marque suffit.** Le fichier est reconnu à la seule marque, `db-query:` sans valeur suffit ; la requête nomme elle-même sa table dans `FROM`. La requête peut s'adresser à n'importe quel niveau, aux fichiers comme aux enregistrements. Avec les indications `editable`, `form` et `allow` dans le conteneur, le fichier devient un formulaire de liste, que la section suivante décrit.
- **Ouvrir et intégrer.** Ouvert, le fichier montre son résultat comme tout document doté d'un bloc de requête. Un autre document l'intègre avec `![[Gros livres]]` et montre le même résultat, car `this.` désigne alors le fichier de requête et non le document qui l'intègre. Une requête qui lit des valeurs du document qui l'intègre n'existe donc pas.
- **Créer.** Il n'existe pas de commande dédiée : un fichier de requête s'écrit à la main ou à partir d'un [modèle](templates.md) personnel.
- **Sans la marque**, un document doté d'un bloc de requête reste une requête dans le texte courant et n'apparaît pas dans la vue d'ensemble.
- **Dans la vue d'ensemble** de la base de données, chaque fichier de requête figure dans la section « Requêtes » (section « La zone en tant que base de données ») ; aucun bloc de requête ou plusieurs sont signalés parmi les anomalies (section « Indications fautives »).

**Deux significations de `editable`.** Dans la définition d'une table, dans le conteneur `db-table`, `editable` est une condition qui dit pour chaque enregistrement séparément s'il peut encore être modifié (section « Modification sous condition »). Dans le conteneur `db-query` d'un fichier de requête, `editable` est un oui ou un non et fait du fichier un formulaire de liste. Les deux agissent ensemble : un formulaire de liste ne propose la modification que pour les lignes dont l'enregistrement remplit la condition de sa table.

## Formulaire de liste

Un fichier de requête devient un **formulaire de liste** quand son conteneur `db-query` porte l'indication `editable: true`. Il montre alors ses enregistrements sous forme de grille, dans laquelle on ouvre, modifie, crée et supprime des lignes ; le reste du texte du fichier décrit la liste comme dans tout fichier de requête.

````markdown
---
db-query:
  editable: true
  form: Prêts Form
  allow: [create, update, delete]
---

# Prêts en cours

```perspective-query
TABLE RECORDS livre, lecteur, sortie, retour FROM "Prêts" WHERE NOT rendu SORT retour
```
````

| Indication | Signification |
| --- | --- |
| `editable` | `true` fait du fichier de requête un formulaire de liste. Sans l'indication ou avec `false`, il reste un fichier de requête ordinaire |
| `form` | le nom du fichier de formulaire sans extension qu'ouvre un clic sur une ligne. Sans l'indication, le formulaire par défaut de la table s'applique |
| `allow` | les actions permises sous forme de liste de `create` (créer), `update` (modifier) et `delete` (supprimer). Sans l'indication, seul `update` s'applique ; une liste vide n'en permet aucune |

`form` et `allow` n'agissent qu'avec `editable: true`.

### Consulter et ouvrir

Dans chaque vue qui montre le résultat, c'est-à-dire dans les vues Rendu, Partagé et Direct, la grille se trouve à la place du tableau de résultats : les mêmes colonnes, devant la colonne « Enregistrement », au-dessus une ligne de décompte comme « Lignes 1 à 50 sur 120 ». Une page montre 50 lignes fixes ; s'il y a plus de lignes, **« Suivant »** et **« Précédent »** tournent les pages.

Un clic sur une ligne ouvre son enregistrement dans le formulaire que nomme `form`, sinon dans le formulaire par défaut de sa table. Si `form` nomme un fichier de formulaire qui n'existe pas ou qui appartient à une autre table, le clic ouvre lui aussi le formulaire par défaut, et la vue d'ensemble affiche une remarque parmi les anomalies du fichier de requête. Dans une ligne modifiable, un simple clic sur une cellule modifiable n'ouvre pas le formulaire, car le double-clic y commence la modification ; le formulaire s'ouvre alors par la colonne « Enregistrement » et par les cellules en lecture. Si la requête porte `WITHOUT ID`, la colonne « Enregistrement » manque, et dans une telle ligne seule une cellule en lecture ouvre le formulaire. Un lien dans une cellule ouvre, comme partout, le formulaire de sa cible.

**Consulter ne verrouille rien.** Sinon, une liste de centaines d'enregistrements les verrouillerait tous à chaque coup d'œil ; seule est verrouillée la ligne dont la modification commence.

Un formulaire de liste lit exactement une table. Seules les colonnes qui nomment exactement un champ de cette table sont modifiables ; une colonne calculée, un chemin par un champ de référence et `record.id` restent en lecture. Toute la liste reste en lecture si elle est groupée ou choisit une forme d'affichage avec `DISPLAY` : une phrase le dit, et en dessous le résultat apparaît comme dans toute requête. Une requête sur des fichiers, des blocs ou des tâches au lieu d'enregistrements et une requête dont les résultats viennent de plusieurs tables montrent le tableau de résultats ordinaire.

### Modifier des lignes

Si `allow` permet la modification, la grille porte en fin de ligne la colonne **« Actions »**. **« Modifier »** à cet endroit ou un double-clic dans la ligne commence la modification : l'application verrouille l'enregistrement, lit son état actuel dans le fichier et fait des cellules modifiables des saisies dans la forme de leur type, comme dans le formulaire. **« Enregistrer »** ou la touche Entrée écrit, dans un champ multiligne Maj+Entrée fait un saut de ligne ; **« Annuler »** ou la touche Échap abandonne. Quitter simplement la ligne n'enregistre pas. L'écriture suit le même chemin que dans le formulaire, avec toutes les règles de la table.

Une seule ligne se modifie à la fois : tant qu'elle est ouverte, le changement de page et les actions des autres lignes sont bloqués. Si le document est fermé, que la vue change ou qu'un autre document ouvert est affiché, la modification s'achève sans enregistrer, et le verrou est libéré.

Si l'application refuse la modification, la ligne reste en modification. Si le message concerne un champ, il figure à sa cellule ; une règle portant sur plusieurs champs figure dans la colonne « Actions ». Si quelqu'un a modifié l'enregistrement depuis que la ligne l'a lu, le même bloc que dans le formulaire apparaît sous la ligne, avec **« Recharger »** et **« Enregistrer quand même »**. Si un autre endroit tient l'enregistrement verrouillé, l'avis de la section « Verrous » apparaît sous la ligne. Si vous n'avez rien modifié, il n'y a rien à enregistrer, et la ligne revient en lecture.

Si un enregistrement peut être modifié, c'est l'indication `editable` de sa table qui le dit **pour chaque ligne** : une ligne dont l'enregistrement n'est pas modifiable selon cette condition apparaît atténuée, sans « Modifier » et sans « Supprimer », et une info-bulle en nomme la raison.

### Créer et supprimer

Avec `create` dans `allow`, le bouton **« Nouvelle ligne »** se trouve à côté de la ligne de décompte. Il place une ligne vide en haut de la page affichée, qui montre « Nouveau » dans la colonne « Enregistrement », et y commence la modification. Le nouvel enregistrement reçoit son identifiant dès maintenant, comme dans le formulaire ; il n'entre dans le fichier qu'avec **« Enregistrer »**, et ensuite il se trouve là où le tri de la requête le range, éventuellement sur une autre page. **« Annuler »** retire la ligne.

Avec `delete` dans `allow`, chaque ligne modifiable porte **« Supprimer »**. L'application verrouille l'enregistrement et pose la question sous la ligne, comme le formulaire : **« Oui, supprimer »** supprime, et la liste montre ensuite l'existant sans lui ; **« Non »** laisse tout en l'état. Un enregistrement vers lequel une colonne de référence pointe encore ne peut pas être supprimé ici non plus : le message figure sous la ligne, et la ligne reste.

Sans `update`, « Modifier » et le double-clic manquent, et un clic sur n'importe quelle cellule ouvre le formulaire ; « Nouvelle ligne » et « Supprimer » restent dans la mesure où `allow` les permet.

## Positions dans le formulaire

Outre les champs de son enregistrement, un formulaire peut montrer les enregistrements d'une autre table qui pointent vers lui, par exemple les positions d'une facture ou les prêts d'un livre. Pour cela, le fichier de formulaire porte l'espace réservé `{{list:<fichier de requête>}}` seul sur sa ligne, avec le nom d'un formulaire de liste sans extension :

```markdown
**Titre :** {{field:titre}}

## Prêts

{{list:Prêts en cours}}
```

La **section des positions** montre la grille de ce formulaire de liste, restreinte aux enregistrements dont le champ de référence pointe vers l'enregistrement affiché. Pour cela, l'application complète la requête par cette condition ; les colonnes, le tri et les autres conditions du fichier de requête continuent de s'appliquer. Si la table des positions a exactement un champ de référence vers la table du formulaire, c'est lui qui est visé ; si elle en a plusieurs, `{{list:<fichier de requête> BY <champ de référence>}}` nomme celui qui est visé. Au milieu d'une ligne de texte, l'espace réservé reste du texte et est signalé.

**Quand le formulaire est en lecture, la section l'est aussi :** un clic sur une ligne ouvre la position dans son formulaire. **En modification**, la section propose les actions que permet `allow` du fichier de requête, comme la liste autonome. Une ligne enregistrée n'est toutefois que **marquée** : elle montre son nouvel état, une info-bulle dit « Marqué ; sera enregistré avec le formulaire. », et son verrou demeure ; une ligne marquée pour la suppression reste en place, signalée. Une nouvelle position reçoit la référence à l'enregistrement affiché sans saisie, même si celui-ci est lui-même en cours de création.

**L'enregistrement se fait avec le formulaire, tout ou rien.** **« Enregistrer »** du formulaire écrit l'en-tête et toutes les positions marquées en une seule opération. Si une ligne de la section est encore en modification, elle est d'abord marquée ; si elle est alors refusée, le formulaire n'enregistre pas et le dit. Si l'application refuse l'opération, rien n'est écrit, et tout reste en place ; le message concernant une position figure dans l'en-tête du formulaire et commence par « Position » et son numéro parmi les lignes marquées. Après l'enregistrement, tous les verrous sont libérés.

**« Abandonner »** abandonne en-tête et positions ensemble et libère tous les verrous. Une nouvelle ligne marquée peut être modifiée à nouveau, mais pas retirée seule ; elle ne disparaît qu'avec « Abandonner ». Les positions marquées comptent comme une modification non enregistrée : avant le passage à un autre enregistrement, le formulaire pose la question.

Si la section ne peut pas être construite, une remarque avec la ligne du fichier de formulaire figure à sa place ; la section « Indications fautives » nomme les cas.

## Répartition des grands ensembles de données

Lorsque les données dépassent environ **0,7 Mo**, l'application les répartit à l'enregistrement sur plusieurs fichiers voisins et continue de les traiter comme **une seule** table. Vous ouvrez le premier fichier et voyez tous les enregistrements ; un lien vers un enregistrement ne fait pas la différence.

Quatre garanties s'appliquent, et trois d'entre elles disent ce qui **n'arrive pas** :

- La coupure n'a lieu qu'**entre deux enregistrements**, jamais à l'intérieur d'un seul.
- Un enregistrement ne **migre jamais** vers un autre fichier. Les nouveaux enregistrements sont ajoutés à la fin, rien n'est redistribué — aucun lien vers un enregistrement ne se rompt donc.
- Une **répartition existante n'est jamais reconstruite**, même si elle a été créée avec un autre seuil.
- Chaque fichier suivant indique les **noms des champs** dans son frontmatter afin de rester lisible seul. Cette liste est une aide à la lecture et non un contrat : si elle contredit la définition du premier fichier, c'est la définition qui prévaut, et le prochain enregistrement remet la liste en ordre.

Le mécanisme sous-jacent est le même que pour la [division des grands documents](document-parts.md) ; pour les fichiers de table, seuls le seuil et le point de coupure diffèrent.

## La fiche d'identité de la base de données

Une base de données se décrit elle-même dans le conteneur `db-database`, dans le frontmatter d'un document qui lui est propre :

```yaml
---
db-database:
  name: Bibliothèque
  description: Fonds, prêts et lecteurs de la bibliothèque de la maison
  schemaVersion: '1.0'
  fallbackLocale: fr
---
```

- **`name`** et **`description`** sont des étiquettes et sont donc elles aussi possibles comme correspondance de langue à texte.
- **`schemaVersion`** est du texte et figure entre guillemets. Sans eux, YAML lirait `1.0` comme un nombre, et la version `1.0` deviendrait la version `1` à la lecture.
- **`fallbackLocale`** est la langue vers laquelle une étiquette se rabat lorsqu'elle ne porte pas la langue de l'interface. Sans indication, la première langue qui figure dans la fiche d'identité elle-même s'applique.
- **`roles`**, **`defaultRole`** et **`users`** portent les rôles de la base de données, le rôle par défaut et l'attribution des noms de connexion ; la section « Autorisations » les décrit. Sans eux, tout est permis dans la base de données.

Chacune de ces indications peut manquer isolément, et aucune n'est une condition pour les tables : chaque table porte sa définition elle-même et reste entièrement interprétable même sans fiche d'identité.

## La zone en tant que base de données

Dès qu'un document du contenu d'une zone porte la fiche d'identité, l'application traite cette zone comme une **zone de base de données**. Vous ne la déclarez pas séparément : la fiche d'identité est la déclaration. L'information se trouve ainsi en un seul endroit, et non en deux qui pourraient se contredire.

Une zone de base de données reçoit deux choses qu'une zone ordinaire n'a pas.

**La vue d'ensemble des objets de la base de données** répond en un seul endroit à la question de ce qui se trouve dans cette zone : la fiche d'identité avec le nom et la description, les tables avec le nombre de leurs champs, les fichiers de requête et les anomalies relevées à la lecture des définitions, en clair et non sous forme de code. Elle s'ouvre dans un onglet propre, et l'on ne modifie rien dans la vue d'ensemble elle-même ; ses actions mènent au formulaire et aux contrôles. Trois chemins y mènent :

- **Affichage → Vue d’ensemble de la base de données**,
- le **menu contextuel du panneau de zone**,
- la **palette de commandes**.

Dans une zone sans base de données, aucun de ces chemins n'est proposé.

Dans la liste des tables, la colonne **« Formulaire »** nomme le fichier de formulaire d'une table et reste vide pour le formulaire généré. La vue d'ensemble porte en outre quatre actions : **« Contrôler la cohérence »** dans l'en-tête pour toutes les tables, et dans la ligne de chaque table **« Nouvel enregistrement »**, **« Contrôler »** et **« Utilisation »**. Ce qu'elles font est décrit dans les sections « Modifier les enregistrements dans le formulaire », « Contrôle de cohérence » et « Utilisation des tables et des enregistrements ». La section **« Requêtes »** nomme chaque fichier de requête avec son nom et son emplacement, le dossier relatif à la racine de la zone, et **« Ouvrir »** l'ouvre comme tout document ; si la zone n'en contient aucun, une phrase explicative y figure. Parmi les anomalies figurent aussi les remarques sur les fichiers de formulaire et de requête, nommées d'après le fichier. La colonne **« Type »** de la section « Requêtes » distingue une « Requête » ordinaire d'un « Formulaire de liste » et nomme pour celui-ci les actions permises ; s'il n'en permet aucune, on y lit « Formulaire de liste, lecture seule ». Dans le bloc de la fiche d'identité, la vue d'ensemble nomme en outre le rôle propre et, si la fiche d'identité porte des rôles, ceux-ci avec leurs autorisations, et sous chaque table les autorisations du rôle propre (section « Autorisations »).

**La section de paramètres « Base de données »** se trouve dans le groupe de navigation « Zone actuelle » (Fichier → Paramètres… → Zone actuelle → Base de données ; lorsqu'un livre est ouvert, le groupe s'appelle **Livre actuel**, lorsqu'une bibliothèque est ouverte **Bibliothèque actuelle**). Elle montre la même information sous forme brève, à savoir le nom et la description de la base de données, le nombre de ses tables et le nombre d'anomalies, et porte une option : **« Afficher la vue d'ensemble à l'ouverture de la zone »**. Si elle est cochée, la vue d'ensemble s'ouvre d'elle-même dès que la zone est liée. L'option réside dans le fichier de la zone et voyage avec le dossier de la zone. Vient s'y ajouter le champ **« Nom du dossier de verrous »** ; il est décrit dans la section « Verrous ».

En outre, l'application tient à la racine de la zone le petit fichier `Area_Database.mdda`. Il contient l'état du compteur des identifiants d'opération, n'apparaît dans aucune liste de fichiers et voyage avec le dossier de la zone ; vous n'avez rien à y faire. S'il manque, l'application rétablit l'état du compteur à partir des justificatifs de modification.

## Indications fautives

Pour la définition tout entière vaut la souplesse habituelle de la maison : une **indication isolée** défectueuse disparaît et est signalée, l'entrée reste effective ; une **entrée** défectueuse disparaît, les autres colonnes restent. Le message nomme l'endroit, c'est-à-dire la colonne concernée, l'indication fautive et ce qui était attendu à sa place.

La seule exception est le **type** : un type hors de l'ensemble ci-dessus fait disparaître l'entrée entière, car une colonne sans type interprétable n'est pas une colonne.

Une indication que l'application ne connaît pas disparaît isolément avec une remarque et ne cause aucun dommage.

Pour l'indication `changeLog` des justificatifs de modification, trois anomalies propres existent. Si `changeLog` n'est pas lui-même un objet, cette table ne conserve pas de limites propres, et les valeurs par défaut de l'application s'appliquent. Si `maxBytes` ou `maxPerRecord` n'est ni un nombre entier supérieur à zéro ni le mot `unlimited`, l'indication concernée est ignorée, et sa valeur par défaut s'applique. Chacune de ces anomalies est signalée ; aucune n'est passée sous silence.

La même souplesse vaut pour les règles de contrôle et pour la condition de modification, règle par règle. Une règle inutilisable sous `check` ou `checks` disparaît isolément, et les autres règles, le champ et la table restent ; sont signalés une entrée qui n'est ni du texte ni un objet avec `rule`, une expression régulière invalide, une expression invalide, une règle de champ avec une référence autre que `value`, un nom de règle inconnu et une règle sous `checks` qui nomme un champ inconnu. Si `checks` n'est pas une liste, toutes les règles sous `checks` disparaissent. Une indication `editable` inutilisable disparaît de même, et la table reste modifiable. Un message qui ne peut pas être interprété disparaît à lui seul ; sa règle ou sa condition continue de vérifier. Une indication `editable` inutilisable sur un champ disparaît de même, et le champ reste modifiable.

La même souplesse vaut pour les fichiers de formulaire. Si le conteneur `db-form` ne nomme aucune table, ou une table qui n'existe pas dans la base de données, le fichier reste un document ordinaire. Ces deux cas figurent parmi les anomalies de la vue d'ensemble ; plusieurs fichiers de formulaire d'une table ne sont en revanche pas une anomalie, mais le cas de la section « Plusieurs formulaires et le formulaire par défaut ». Un espace réservé qui n'est ni de champ ni de valeur et un nom de champ que la table ne connaît pas restent du texte, et un espace réservé de valeur avec une expression invalide laisse son emplacement vide ; le formulaire signale les trois avec leur ligne dans son en-tête, et le contrôle de cohérence les liste comme constats. Un marqueur `{{end}}` sans section ouverte est ignoré, une section sans `{{end}}` affiche son contenu comme en dehors de la section, et une section avec une condition invalide reste masquée ; ces trois cas aussi, le formulaire les signale avec leur ligne dans son en-tête, et le contrôle de cohérence les liste comme constats. Un marqueur qui n'est pas seul sur sa ligne n'est pas un marqueur et reste du texte en tant qu'espace réservé inconnu. Si l'indication `form` de la définition de table ne nomme aucun fichier de formulaire, un fichier qui n'existe pas pour cette table ou le fichier de formulaire d'une autre table, un avertissement figure parmi les anomalies de la vue d'ensemble, et le formulaire par défaut sans indication s'applique ; le contrôle de cohérence liste en outre les deux derniers cas comme constats à la table. Un chemin qui ne nomme aucun champ de référence de la table ou aucun champ de la table cible laisse son emplacement vide et est signalé de même avec sa ligne. Pour la section des positions, il existe cinq cas : le fichier de requête nommé n'existe pas ; il ne porte pas `editable: true` ; les positions n'ont aucun champ de référence vers la table du formulaire ; elles en ont plusieurs, et `BY` n'en nomme aucun ; ou la requête ne nomme pas une table unique ou ne peut pas être complétée par la relation. Dans le deuxième cas, la section reste en lecture, sinon vide ; chaque cas figure comme remarque avec sa ligne à la place de la section, et le contrôle de cohérence le mentionne comme constat du fichier de formulaire.

La même souplesse vaut pour les fichiers de requête. Si un document portant la marque `db-query` ne contient aucun bloc de requête ou en contient plusieurs, il reste un document ordinaire, et chaque bloc qu'il contient est évalué. La vue d'ensemble le cite malgré tout dans la section « Requêtes » et nomme le cas parmi les anomalies, d'après le fichier. La même ligne vaut pour les indications d'un formulaire de liste, indication par indication : un `editable` qui n'est pas une valeur de vérité compte comme `false` ; un `form` qui ne nomme aucun nom est abandonné ; un `allow` qui n'est ni une action ni une liste revient à `update`, et un mot inconnu qu'il contient est abandonné seul. `form` ou `allow` sans `editable: true` n'ont pas d'effet, et toute autre indication dans le conteneur est ignorée. Si `form` nomme un fichier de formulaire qui n'existe pas dans la base de données ou qui appartient à une autre table que celle de la requête, un clic sur une ligne ouvre le formulaire par défaut de la table. Chacun de ces cas figure comme remarque parmi les anomalies de la vue d'ensemble.

La même ligne souple vaut pour les rôles, le rôle par défaut et l'attribution dans la fiche d'identité. Un rôle avec une table inconnue, une opération inconnue ou une indication sur une table qui n'est ni `all` ni une liste est considéré comme non défini, et chacune de ses erreurs est signalée. Un rôle par défaut ou une attribution qui ne nomme aucun rôle existant est de même considéré comme non défini, et la règle suivante de la section « Autorisations » s'applique. Tous ces cas figurent parmi les anomalies de la vue d'ensemble.

Si une table porte des enregistrements mais aucun niveau de crue `lastId` ou un niveau trop bas, l'application n'attribue pourtant aucun identifiant deux fois : une création prend le numéro suivant au-dessus du plus grand identifiant existant et met ensuite à jour le niveau de crue. Le contrôle de cohérence signale le cas comme remarque.

## Désactiver la base de données

L'ensemble de la base de données est une [extension interne](extensions.md) nommée « Base de données », dans la catégorie Outils, et se désactive d'un seul interrupteur. Elle nécessite les [Profils de propriétés](property-profiles.md), car la forme d'une définition de table est décrite et vérifiée au moyen d'un profil interne ; tant que la base de données est activée, ce prérequis ne peut donc pas être désactivé.

À l'état désactivé :

- Le **bloc d'enregistrements reste un bloc de code ordinaire**, en mode lecture, en mode édition et dans l'export portable. Son contenu reste lisible ; ce qui est désactivé, c'est l'affichage sous forme de tableau, non la donnée.
- **La vue d'ensemble et la section de paramètres disparaissent**, ainsi que les accès dans le menu Affichage, dans le menu contextuel du panneau de zone et dans la palette de commandes. Une vue d'ensemble déjà ouverte reste en place jusqu'à ce que vous la fermiez, comme toute autre page système.
- Avec le bloc d'enregistrements disparaissent ses boutons **« Ouvrir l’enregistrement »** et **« Nouvel enregistrement »**, avec la vue d'ensemble ses actions **« Contrôler la cohérence »**, **« Contrôler »** et **« Utilisation »**, et les commandes **« Nouvel enregistrement dans la table active »** et **« Contrôler la cohérence de la base de données »** quittent la palette de commandes. Le **formulaire** n'est donc plus accessible non plus, et l'application ne fournit plus de données ni à lui, ni au contrôle de cohérence, ni à l'utilisation.
- Une **requête d'enregistrements** ne lit plus aucune table : elle affiche une liste vide avec la remarque que l'extension est désactivée, et aucun message d'erreur. Cela vaut aussi pour les chemins passant par des champs de référence, pour les hiérarchies et pour l'arbre.
- Un **fichier de requête** reste un document ordinaire : son bloc de requête continue d'être évalué, sur les enregistrements avec la liste vide et la remarque décrites ci-dessus, et sa section « Requêtes » disparaît avec la vue d'ensemble. Un formulaire de liste ne montre alors aucune grille et ne propose aucune action.
- Un **lien vers un enregistrement isolé** n'est plus signalé comme rompu. Sans définitions, il n'y a rien à quoi le confronter, et un avertissement sans vérification ne serait qu'une affirmation. Un clic ouvre le fichier de table sans saut vers la ligne au lieu du formulaire, et la liste de suggestions ne propose aucun enregistrement.
- La **recherche portant sur la zone ne donne aucun résultat d'enregistrement**. Les enregistrements restent exclus du texte intégral, car cette limite tient au fichier de table et non à l'interrupteur ; par la zone, les enregistrements sont alors introuvables.
- Un **formulaire** ouvert à la fermeture ne revient pas au démarrage. Son entrée dans la session reste en attente et le ramène au démarrage suivant après la réactivation (section « Après le redémarrage »).
- **Rôles, rôle par défaut et attribution** restent un simple frontmatter de la fiche d'identité, de même qu'une indication `editable` sur un champ : il n'y a ni résolution ni contrôle, pas même à la sauvegarde d'une définition modifiée.
- **Rien n'est écrit.** L'application ne crée, ne modifie ni ne supprime aucun enregistrement, ne prend aucun verrou et ne produit aucun justificatif de modification ; elle ne mène pas non plus à son terme une sauvegarde restée inachevée tant qu'elle est désactivée.

**Les fichiers demeurent intacts.** La désactivation retire l'interprétation, non les données : pas un caractère n'est modifié, et la réactivation ramène tout. L'index de la zone est alors reconstruit une fois ; dans un grand fonds, cela prend un instant.
