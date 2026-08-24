# Profils de propriétés

Les profils de propriétés définissent les champs de propriétés de manière centralisée pour une zone : par champ un nom, un type, éventuellement une plage de valeurs fixe (choix simple ou multiple) et une valeur par défaut. Les profils peuvent hériter les uns des autres (section « Héritage »). L'éditeur de propriétés et le panneau des propriétés de bloc proposent les champs définis, présentent les plages de valeurs sous forme de listes de sélection et reprennent le type de la définition. Les profils n'existent que dans le contexte d'une zone : la configuration se trouve dans le fichier de zone (Paramètres → Profils de propriétés), les profils eux-mêmes sont des fichiers Markdown ordinaires. La fonctionnalité peut être activée ou désactivée via l'extension « Profils de propriétés » (Paramètres → Extensions) ; sans configuration ou avec l'extension désactivée, les deux éditeurs se comportent comme d'habitude (inférence de type et suggestions standard).

## Fichiers de profil et format des définitions

Un profil est un fichier Markdown dans le dossier de profils configuré ; le nom du profil est le nom du fichier sans l'extension. Les définitions de champs se trouvent dans le frontmatter sous la clé `fields`, le contenu du fichier en dessous est une description libre :

```yaml
---
fields:
  - name: statut
    values: [ouvert, en cours, terminé]
    default: ouvert
  - name: budget
    type: number
  - name: thèmes
    type: multistring
    values: [projet, personne, lieu]
  - name: échéance
    type: date
---
```

Attributs par définition :

| Attribut | Signification |
| --- | --- |
| `name` | nom du champ (obligatoire, unique par profil) |
| `type` | `string`, `multistring`, `number`, `boolean`, `date`, `multiline`, `link` (lien vers un fichier) ou `time` (heure) ; `string` par défaut |
| `values` | facultatif : plage de valeurs fixe sous forme de liste (pour `string`, `multistring`, `number` et `date`) |
| `multiple` | facultatif : plusieurs valeurs — la valeur est une liste. Vaut pour tout type sauf `boolean` et `multiline` ; seul le champ texte change alors de type pour `multistring`, sinon le nom du type demeure (un champ de lien avec plusieurs cibles est `link` avec `multiple`) |
| `default` | facultatif : préremplissage lors de la création du champ via l'éditeur |
| `valuesFrom` | facultatif : source du réservoir de valeurs avec `note` (chemin d'une note de valeurs) et/ou `query` (requête) ; avec `values` en même temps, `values` s'applique |
| `options` | facultatif : indications propres au type dans un sous-objet, voir le tableau ci-dessous |
| `fields` | facultatif : définitions enfants imbriquées selon le même schéma, prévu pour les types structurés |

Un champ `multistring` avec `values` est automatiquement un choix multiple. **Le nom du champ est la seule indication obligatoire** : toute autre indication est facultative, et les fichiers de profil existants restent valables sans modification. `valuesFrom`, `options` et les `fields` imbriqués font déjà partie du format mais ne sont pas encore évalués dans cette version (section « Limites »). Les définitions individuelles défectueuses (par exemple un type inconnu ou un nom de champ en double) ne suspendent qu'elles-mêmes ; les autres définitions du profil restent effectives. La liste des profils dans les paramètres affiche les indications en toutes lettres sous le profil concerné — avec la définition touchée, l'indication fautive et ce qui était attendu à sa place, pour les définitions enfants avec le chemin vers le champ parent — et ouvre le fichier de profil d'un clic.

### Options propres au type

Le sous-objet `options` porte les indications qui ne valent que pour un type donné :

| Type | Indication | Signification |
| --- | --- | --- |
| `number` | `step`, `min`, `max` | pas et limites du champ numérique |
| `date` | `shift` | décalage en jours ; il pré-remplit un champ **vide** au premier clic, une date existante reste intacte |
| `link` | `restrictTo`, `display`, `sort` | chemin de dossier (ou liste) auquel les suggestions sont limitées ; champ de métadonnées de la cible comme nom affiché ; ordre `name` ou `path` |
| champ de choix | `control: cycle` | le choix simple devient un bouton qui passe à la valeur suivante au clic ; la valeur enregistrée reste la même que sans l'option |

Une indication inconnue ou mal renseignée est ignorée individuellement avec une remarque ; le champ et les autres indications restent effectifs. Une option prévue pour un type ultérieur peut donc déjà figurer sans causer de dommage.

## Réservoirs de valeurs

Le réservoir de valeurs autorisé d'un champ de choix a trois sources possibles : la liste fixe `values`, une **note de valeurs** ou une **requête**. `values` et `valuesFrom` s'excluent mutuellement ; si les deux figurent, `values` s'applique et la liste des profils dans les paramètres signale la contradiction.

```yaml
---
fields:
  - name: lieu
    valuesFrom:
      note: 90 Organisation/Valeurs/Lieux.md
  - name: projet
    type: link
    valuesFrom:
      query: WHERE genre = "projet"
---
```

Une **note de valeurs** est une note ordinaire avec une valeur par ligne ; son chemin est relatif à l'espace. Les lignes vides et les espaces de bord sont écartés, un bloc de métadonnées de la note ne fait pas partie du réservoir. Elle est actualisée comme un fichier de profil : une modification prend effet sans redémarrage, même venue de l'extérieur. Le réservoir devient ainsi un contenu ordinaire que l'on peut lier, commenter et transmettre.

Une **requête** fournit les valeurs depuis le fonds — les noms de ses résultats. Elle n'est évaluée que lorsqu'un champ a réellement besoin de ses valeurs, et est mémorisée jusqu'à la prochaine modification du fonds ; rien n'est calculé à l'avance sur l'ensemble. Un document sans champ de requête ne coûte donc aucune évaluation.

Si une source manque, est vide ou n'est pas évaluable, le **champ reste utilisable** : le réservoir est vide, une indication apparaît au champ, et des valeurs libres restent possibles comme partout.

## Association et profil standard

Les documents s'associent via un champ de frontmatter ; le nom du champ est configurable par zone (par défaut `class`). La valeur est un nom de profil ou une liste de plusieurs noms de profils :

Un document trouve en outre son profil par une **étiquette** ou son **dossier**, sans qu'un champ d'association doive y figurer. Ces affectations appartiennent à l'espace et se règlent sous Paramètres → Profils de propriétés : une ligne par profil, avec ses étiquettes et ses chemins de dossier.

- **Étiquette** : elle compte aussi bien depuis le bloc de métadonnées (`tags`) que depuis le texte (`#étiquette`) — pour l'association, une étiquette est une étiquette. Une modification non enregistrée prend effet immédiatement elle aussi.
- **Dossier** : un chemin lié inclut ses sous-dossiers, afin qu'une subdivision ultérieure n'ait pas à être maintenue. Le chemin relatif à l'espace est comparé sur des noms de dossier entiers ; « 10 Projets Archive » ne tombe donc pas sous « 10 Projets ».

```yaml
---
class:
  - projet
  - personne
---
```

En complément, un **profil standard** peut être choisi : ses définitions s'appliquent à tous les fichiers de la zone, même sans champ d'association. Les noms de profils correspondent indépendamment de la casse.

## Héritage

Un profil peut hériter des définitions d'un autre. Pour cela, le frontmatter du fichier de profil nomme, à côté de `fields`, au plus un profil parent et, éventuellement, des noms de champs à exclure :

```yaml
---
extends: projet
exclude: [statut]
fields:
  - name: phase
  - name: auteur
---
```

- `extends` nomme le profil parent ; des chaînes sur plusieurs niveaux sont possibles, il n'existe pas plus d'un profil parent.
- `exclude` exclut des champs hérités. L'exclusion agit dans la chaîne d'héritage où elle se trouve, pas pour l'ensemble du document.
- Un champ propre du même nom remplace complètement le champ hérité.

Un cycle dans la relation parent ou un profil parent inexistant ne termine que la chaîne concernée et produit une indication dans la liste des profils des paramètres ; la résolution continue.

## Profil interne

À côté des fichiers de profil du dossier existe le **profil interne `Ereignis`** de l'extension [Événements](events.md). Il fait automatiquement partie de la résolution des profils et de la liste des profils dans les paramètres (où il est signalé comme profil interne), définit les huit champs `event-*` et ne peut être ni modifié ni supprimé ; il n'est pas proposé comme profil standard. Il agit aussi sans dossier de profils configuré, avec le champ d'affectation standard `class` ; si un fichier de profil porte le même nom, le profil interne a la priorité. Quand l'extension Événements est désactivée, il disparaît de la résolution et de la liste.

## Règles de conflit

Pour un fichier s'applique la réunion de toutes les définitions de tous les profils qui l'atteignent. La résolution est **une** seule séquence ordonnée en quatre étapes, de l'énoncé le plus explicite au plus général :

1. le **champ d'association** du document, dans l'ordre de mention
2. une **étiquette** du document
3. le **dossier** du document
4. le **profil standard** de l'espace

Par profil atteint viennent d'abord ses propres champs, puis ceux de sa chaîne parente de bas en haut ; chaque profil est traité exactement une fois, toutes étapes confondues. Si plusieurs profils définissent le même nom de champ, les règles sont déterministes :

1. La **première correspondance de la séquence** l'emporte — une voie plus haute bat toute voie plus basse.
2. Parmi plusieurs profils d'une même étape, celui **mentionné en premier** l'emporte (liste d'association ou ordre des affectations).
3. Au sein d'une chaîne, le **profil héritier** l'emporte sur ses parents ; un champ propre remplace ainsi le champ hérité de même nom.

Les voies **se complètent, elles ne se remplacent pas** : un document avec un champ d'association et un dossier correspondant porte les champs des deux. Une voie qui pointe vers un profil déjà atteint n'ajoute rien — cela découle de « chaque profil exactement une fois » et ne nécessite aucune règle propre. Et une contradiction entre étiquette et dossier n'en est pas une : l'ordre décide, il n'y a ni question ni avertissement.

Un exemple avec quatre profils : `tous` (champ `tags`), `projet` (hérite de `tous` ; champs `phase`, `statut`), `article` (hérite de `projet`, exclut `statut` ; champs propres `phase`, `auteur`) et `réunion` (champs `statut`, `lieu`). Un document avec `class: [article, réunion]` et le profil standard `tous` reçoit `phase` et `auteur` de `article`, `tags` via la chaîne depuis `tous`, `statut` et `lieu` de `réunion` — l'exclusion dans `article` n'agit que dans sa chaîne ; via `réunion`, `statut` arrive tout de même.

## Symbole du profil sur le document

Un profil peut porter un **symbole** — un caractère unique, généralement un émoji, dans le bloc de métadonnées du fichier de profil :

```yaml
---
icon: 📅
fields:
  - name: lieu
---
```

L'en-tête de la section Propriétés affiche le symbole du profil résolu en **premier** pour le document ; l'infobulle en nomme le nom et l'étape par laquelle il a été trouvé. C'est là le véritable but : dès que l'étiquette et le dossier ont voix au chapitre, un document peut porter des champs dont rien n'est dit en lui — le symbole répond alors au pourquoi.

Sans profil ou sans symbole, rien n'apparaît ; aucun espace réservé n'est créé. Une indication de plus d'un caractère est ignorée avec une remarque, le profil reste effectif.

## Effet dans les éditeurs

Les définitions agissent dans l'éditeur de propriétés et de manière identique dans le panneau des propriétés de bloc ; les blocs d'un fichier héritent de la résolution de leur fichier.

- **Suggestions de champs** : « Ajouter une propriété » montre d'abord les champs définis non encore présents (avec le nom du profil comme badge), puis les suggestions habituelles ; « Champ personnalisé » à la fin reste la voie libre. La sélection crée le champ avec le type défini et la valeur par défaut.
- **Listes de sélection** : les champs avec plage de valeurs proposent les valeurs définies sous forme de liste de sélection (choix simple) ou de suggestions de saisie de la barre de pastilles (choix multiple) ; « Valeur personnalisée… » permet toujours une saisie libre.
- **Type imposé** : les champs définis affichent le type défini, le sélecteur de type est verrouillé et nomme le profil. Si la valeur existante s'écarte du type, le sélecteur reste libre afin que la valeur puisse être convertie vers le type défini.
- Les **champs de lien** proposent les cibles de l'espace en complétion, signalent une cible inexistante et l'ouvrent via la flèche — le même chemin qu'un clic sur un lien wiki. Avec `multiple`, ils portent plusieurs cibles dans la barre de puces.
- Les **champs d'heure** utilisent le contrôle d'heure ; la valeur figure entre guillemets dans le bloc de métadonnées, car `09:30` serait sinon lu comme un nombre.
- Les champs définis portent un marquage discret au nom du champ ; l'infobulle nomme le profil.

## Reprise de tous les champs en une fois

Le menu de suggestions « Ajouter une propriété » est groupé par profil : sous chaque **nom de profil** figurent, en retrait, ses champs non encore présents, puis les suggestions standard sans profil sous « Autres champs ». Un clic sur le **nom du profil** lui-même ajoute en une étape tous les champs encore manquants de ce profil ; un clic sur un champ isolé n'ajoute toujours que celui-ci.

La reprise est délibérément additive :

- Seuls les champs **manquants** sont créés ; les valeurs existantes et l'ordre des champs restent intacts, et aucun doublon n'apparaît.
- Un champ avec valeur par défaut reçoit cette valeur ; un champ sans valeur par défaut est créé vide selon le type : texte, date et liste restent vides, un nombre démarre à `0`, un booléen à « faux ». On modifie ensuite le contenu comme d'habitude.
- Dans le frontmatter du document, les champs vides apparaissent comme une simple clé sans valeur (`champ:`).

L'ensemble de la reprise est une seule étape et peut être entièrement annulé avec une seule annulation. Elle vaut dans l'éditeur de propriétés comme dans le panneau des propriétés de bloc et disparaît lorsque l'extension « Profils de propriétés » est désactivée.

## Validation douce

Les écarts ne bloquent jamais et ne modifient jamais la valeur : une valeur en dehors de la plage de valeurs ou une valeur qui ne correspond pas au type défini produit seulement une icône d'indication au champ ; l'infobulle en nomme la raison. Le Markdown et le frontmatter restent librement modifiables — y compris directement dans la source.

## Limites

- Le format prévoit déjà des options propres au type (`options`), des sources de réservoir de valeurs (`valuesFrom`) et des définitions enfants imbriquées ; elles ne sont pas encore évaluées dans cette version. Une telle indication n'est pas une erreur, elle reste simplement sans effet jusqu'à l'extension.
- Renommer un fichier de profil ne change pas les valeurs d'association dans les documents ; elles pointent alors vers un profil inexistant (les paramètres signalent un profil standard manquant).
- Les profils se trouvent directement dans le dossier de profils ; les sous-dossiers ne sont pas pris en compte.
- Les définitions agissent dans les deux éditeurs de propriétés ; les types de champs calculés ou dérivés d'autres fichiers ne font pas partie des profils.
- La liaison d'un profil à un groupe de signets et l'association par une requête sont volontairement différées ; étiquette et dossier couvrent les cas documentés et restent explicables.
