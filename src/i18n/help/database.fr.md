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
| `lastId` | niveau de crue : le plus grand numéro jamais attribué par la table. L'identifiant suivant en découle et non de l'existant, afin que le numéro d'un enregistrement supprimé ne soit jamais attribué une seconde fois |
| `key` | la clé fonctionnelle : un nom de champ ou une liste de noms de champs. Facultative, car une table de mouvements ou de mesures n'a pas de clé lisible par l'humain qui ait du sens |
| `display` | le champ par lequel un enregistrement est désigné. Sans indication, une clé fonctionnelle à un seul élément s'applique, sans l'une ni l'autre, l'identifiant interne |

Si la clé fonctionnelle nomme un champ que la définition ne connaît pas, la clé **entière** disparaît : une demi-clé serait une fausse promesse d'unicité.

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

## Affichage des enregistrements

En mode lecture et en mode édition, le bloc apparaît sous forme de tableau avec les colonnes de la définition. Chaque valeur est affichée selon le type de sa colonne : nombres alignés à droite et avec les décimales déclarées, valeurs booléennes sous forme de coche, valeurs multilignes avec leurs retours à la ligne. Si une valeur ne correspond pas à son type, la cellule affiche son texte d'origine et est signalée par une couleur au lieu d'être remplacée.

À partir de **2000 enregistrements**, l'affichage montre un extrait et indique en dessous de quoi il est l'extrait. C'est une fenêtre et non une troncature silencieuse : vous voyez qu'il y en a davantage. La limite a été mesurée et non décrétée — en deçà, le tableau s'affiche sans attente perceptible.

Dans l'**export portable**, en revanche, le tableau est complet, sans fenêtre. Un fichier que vous transmettez ne doit rien dissimuler : le destinataire n'a pas l'application et ne verrait pas qu'il manque quelque chose.

Les enregistrements ne se modifient pas dans cette vue. Le fichier de table est un stockage technique — il reste lisible à la main et, en cas d'urgence, corrigeable à la main, mais en fonctionnement normal vous n'y travaillez pas.

## Trouvabilité : recherche et liens

Une recherche portant sur la **zone** prend un document de table sans ses enregistrements. Le texte explicatif situé au-dessus du bloc de données reste consultable, une occurrence située après lui mène toujours au bon endroit, et les enregistrements eux-mêmes ne sont pas trouvés par cette voie.

La raison tient à la zone et non à la table : l'espace de recherche conserve en mémoire les textes de tous les fichiers Markdown et porte pour cela un plafond sur la zone **entière**. Quelques tables de quelques mégaoctets suffisent à le faire sauter, et dès lors chaque recherche relit le disque, y compris celle qui porte sur un document ordinaire. Les enregistrements dans l'espace de recherche coûteraient donc sa vitesse non pas à eux-mêmes, mais à la zone entière.

**C'est un état intermédiaire.** Tant que les enregistrements n'ont pas leur propre type d'occurrence, ils restent introuvables par la recherche de zone. Deux chemins y mènent malgré tout :

- **Chercher dans le document ouvert.** Qui a le fichier de table devant lui et y cherche (par défaut `Ctrl+F`) cherche dans le texte qu'il a sous les yeux et retrouve ses enregistrements inchangés. La limite ci-dessus ne concerne que la recherche portant sur la zone.
- **Renvoyer directement à un enregistrement**, comme décrit dans la section suivante.

### Lien vers un enregistrement isolé

Un lien nomme la table et l'identifiant interne, écrit comme une ancre de bloc :

```markdown
[[Personen#^r-00042]]
```

Le lien **vaut** si la table nommée porte cet enregistrement, et il est rompu si elle ne le porte pas. Il se comporte ainsi comme tout autre lien de l'application. Il vaut également lorsque l'enregistrement ne se trouve pas dans le premier fichier de la table mais dans l'un de ses fichiers suivants : pour qui l'écrit, la table est une, et sa répartition sur plusieurs fichiers ne le regarde pas.

La vérification porte sur l'état **enregistré** de la table, comme pour toute autre ancre. Un lien vers un enregistrement qui vient d'être créé et n'a pas encore été sauvegardé ne vaut donc pas encore.

Le [linter Markdown](tools.md) montre si un lien vaut : une cible rompue reçoit un soulignement ondulé dans l'éditeur, c'est-à-dire dans les vues Source, Scindée et Direct. La vue lecture seule ne représente pas la validité ; les liens valides et rompus y ont la même apparence.

Un clic ouvre le fichier de table. Il ne mène pas encore à l'enregistrement lui-même.

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

Chacune de ces indications peut manquer isolément, et aucune n'est une condition pour les tables : chaque table porte sa définition elle-même et reste entièrement interprétable même sans fiche d'identité.

## La zone en tant que base de données

Dès qu'un document du contenu d'une zone porte la fiche d'identité, l'application traite cette zone comme une **zone de base de données**. Vous ne la déclarez pas séparément : la fiche d'identité est la déclaration. L'information se trouve ainsi en un seul endroit, et non en deux qui pourraient se contredire.

Une zone de base de données reçoit deux choses qu'une zone ordinaire n'a pas.

**La vue d'ensemble des objets de la base de données** répond en un seul endroit à la question de ce qui se trouve dans cette zone : la fiche d'identité avec le nom et la description, les tables avec le nombre de leurs champs, et les anomalies relevées à la lecture des définitions, en clair et non sous forme de code. Elle s'ouvre dans un onglet propre et constitue une vue en lecture seule ; on n'y modifie rien. Trois chemins y mènent :

- **Affichage → Vue d’ensemble de la base de données**,
- le **menu contextuel du panneau de zone**,
- la **palette de commandes**.

Dans une zone sans base de données, aucun de ces chemins n'est proposé.

**La section de paramètres « Base de données »** se trouve dans le groupe de navigation « Zone actuelle » (Fichier → Paramètres… → Zone actuelle → Base de données). Elle montre la même information sous forme brève, à savoir le nom et la description de la base de données, le nombre de ses tables et le nombre d'anomalies, et porte une option : **« Afficher la vue d'ensemble à l'ouverture de la zone »**. Si elle est cochée, la vue d'ensemble s'ouvre d'elle-même dès que la zone est liée. L'option réside dans le fichier de la zone et voyage avec le dossier de la zone.

## Indications fautives

Pour la définition tout entière vaut la souplesse habituelle de la maison : une **indication isolée** défectueuse disparaît et est signalée, l'entrée reste effective ; une **entrée** défectueuse disparaît, les autres colonnes restent. Le message nomme l'endroit, c'est-à-dire la colonne concernée, l'indication fautive et ce qui était attendu à sa place.

La seule exception est le **type** : un type hors de l'ensemble ci-dessus fait disparaître l'entrée entière, car une colonne sans type interprétable n'est pas une colonne.

Une indication que l'application ne connaît pas disparaît isolément avec une remarque et ne cause aucun dommage.

## Désactiver la base de données

L'ensemble de la base de données est une [extension interne](extensions.md) nommée « Base de données », dans la catégorie Outils, et se désactive d'un seul interrupteur. Elle nécessite les [Profils de propriétés](property-profiles.md), car la forme d'une définition de table est décrite et vérifiée au moyen d'un profil interne ; si ce prérequis est désactivé, la base de données l'est avec lui.

À l'état désactivé :

- Le **bloc d'enregistrements reste un bloc de code ordinaire**, en mode lecture, en mode édition et dans l'export portable. Son contenu reste lisible ; ce qui est désactivé, c'est l'affichage sous forme de tableau, non la donnée.
- **La vue d'ensemble et la section de paramètres disparaissent**, ainsi que les accès dans le menu Affichage, dans le menu contextuel du panneau de zone et dans la palette de commandes. Une vue d'ensemble déjà ouverte reste en place jusqu'à ce que vous la fermiez, comme toute autre page système.
- Un **lien vers un enregistrement isolé** n'est plus signalé comme rompu. Sans définitions, il n'y a rien à quoi le confronter, et un avertissement sans vérification ne serait qu'une affirmation.
- La **recherche portant sur la zone reste inchangée**. Les enregistrements restent exclus du texte intégral, car cette limite tient au fichier de table et non à l'interrupteur ; la section « Trouvabilité » ci-dessus reste donc valable.

**Les fichiers demeurent intacts.** La désactivation retire l'interprétation, non les données : pas un caractère n'est modifié, et la réactivation ramène tout. L'index de la zone est alors reconstruit une fois ; dans un grand fonds, cela prend un instant.
