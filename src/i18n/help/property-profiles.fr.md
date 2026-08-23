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
| `type` | `string`, `multistring`, `number`, `boolean`, `date` ou `multiline` ; `string` par défaut |
| `values` | facultatif : plage de valeurs fixe sous forme de liste (pour `string`, `multistring`, `number` et `date`) |
| `multiple` | facultatif : choix multiple — la valeur est une liste, le type `multistring` ; une plage de valeurs fixe n'est plus requise |
| `default` | facultatif : préremplissage lors de la création du champ via l'éditeur |
| `valuesFrom` | facultatif : source du réservoir de valeurs avec `note` (chemin d'une note de valeurs) et/ou `query` (requête) ; avec `values` en même temps, `values` s'applique |
| `options` | facultatif : indications propres au type dans un sous-objet, prévu pour des types à venir |
| `fields` | facultatif : définitions enfants imbriquées selon le même schéma, prévu pour les types structurés |

Un champ `multistring` avec `values` est automatiquement un choix multiple. **Le nom du champ est la seule indication obligatoire** : toute autre indication est facultative, et les fichiers de profil existants restent valables sans modification. `valuesFrom`, `options` et les `fields` imbriqués font déjà partie du format mais ne sont pas encore évalués dans cette version (section « Limites »). Les définitions individuelles défectueuses (par exemple un type inconnu ou un nom de champ en double) ne suspendent qu'elles-mêmes ; les autres définitions du profil restent effectives. La liste des profils dans les paramètres affiche les indications en toutes lettres sous le profil concerné — avec la définition touchée, l'indication fautive et ce qui était attendu à sa place, pour les définitions enfants avec le chemin vers le champ parent — et ouvre le fichier de profil d'un clic.

## Association et profil standard

Les documents s'associent via un champ de frontmatter ; le nom du champ est configurable par zone (par défaut `class`). La valeur est un nom de profil ou une liste de plusieurs noms de profils :

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

Pour un fichier, c'est l'union de toutes les définitions des profils associés avec leurs chaînes de parents plus le profil standard avec sa chaîne qui s'applique. La résolution est **une** suite ordonnée : par profil associé, dans l'ordre de nomination, d'abord ses propres champs, puis ceux de sa chaîne de parents de bas en haut, ensuite la même chose pour le profil standard ; chaque profil est traité exactement une fois. Si plusieurs profils définissent le même nom de champ, les règles sont déterministes :

1. Un **profil associé** l'emporte sur le **profil standard**.
2. Parmi plusieurs profils associés, celui nommé **en premier** dans la liste d'association l'emporte.
3. Au sein d'une chaîne, le **profil héritier** l'emporte sur ses parents ; un champ propre remplace ainsi le champ hérité du même nom.

Un exemple avec quatre profils : `tous` (champ `tags`), `projet` (hérite de `tous` ; champs `phase`, `statut`), `article` (hérite de `projet`, exclut `statut` ; champs propres `phase`, `auteur`) et `réunion` (champs `statut`, `lieu`). Un document avec `class: [article, réunion]` et le profil standard `tous` reçoit `phase` et `auteur` de `article`, `tags` via la chaîne depuis `tous`, `statut` et `lieu` de `réunion` — l'exclusion dans `article` n'agit que dans sa chaîne ; via `réunion`, `statut` arrive tout de même.

## Effet dans les éditeurs

Les définitions agissent dans l'éditeur de propriétés et de manière identique dans le panneau des propriétés de bloc ; les blocs d'un fichier héritent de la résolution de leur fichier.

- **Suggestions de champs** : « Ajouter une propriété » montre d'abord les champs définis non encore présents (avec le nom du profil comme badge), puis les suggestions habituelles ; « Champ personnalisé » à la fin reste la voie libre. La sélection crée le champ avec le type défini et la valeur par défaut.
- **Listes de sélection** : les champs avec plage de valeurs proposent les valeurs définies sous forme de liste de sélection (choix simple) ou de suggestions de saisie de la barre de pastilles (choix multiple) ; « Valeur personnalisée… » permet toujours une saisie libre.
- **Type imposé** : les champs définis affichent le type défini, le sélecteur de type est verrouillé et nomme le profil. Si la valeur existante s'écarte du type, le sélecteur reste libre afin que la valeur puisse être convertie vers le type défini.
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
