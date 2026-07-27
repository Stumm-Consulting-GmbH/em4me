# Événements

La gestion des événements conserve **les rendez-vous, anniversaires, dates anniversaires et dates de projet** directement dans le document : sous forme de bloc d'événements intégré avec ses propres lignes de données ou d'agrégation via les propriétés du frontmatter à partir des fichiers de la zone. Chaque entrée affiche l'**écart de temps par rapport à aujourd'hui** en quatre échelons, ainsi que des jalons, la récurrence annuelle, des filtres, cinq vues supplémentaires et des liens entre événements.

La fonction fait partie des [extensions internes](extensions.md) (« Événements ») et requiert les [Profils de propriétés](property-profiles.md) — si cette extension est désactivée, la gestion des événements se désactive également. Désactivé, le bloc reste un bloc de code ordinaire.

## Structure du bloc

Un bloc de code avec le tag de langue `perspective-events` contient des directives d'en-tête facultatives et des lignes de données ; la commande « Insérer un bloc d'événements » (via la palette de commandes, un raccourci peut être attribué dans les paramètres) insère un bloc vide à la position du curseur :

````markdown
```perspective-events
| 2020-01-01 | | Lancement du projet Alpha | projekt | Note de lancement | | | | |
| 1990-03-10 | | Anniversaire d'Anna | geburtstag | | x | | | |
| 2024-11-11 | 2025-02-11 | Phase du projet | projekt | | | | | |
```
````

Au rendu, la table d'événements apparaît avec des badges de catégorie et une colonne d'écart de temps :

```perspective-events
| 2020-01-01 | | Lancement du projet Alpha | projekt | Note de lancement | | | | |
| 1990-03-10 | | Anniversaire d'Anna | geburtstag | | x | | | |
| 2024-11-11 | 2025-02-11 | Phase du projet | projekt | | | | | |
```

Chaque ligne de données porte neuf cellules dans un ordre fixe :

| Cellule | Champ | Contenu |
|---|---|---|
| 1 | Date | date `AAAA-MM-JJ` |
| 2 | Fin | date facultative pour les durées |
| 3 | Événement | le texte de l'événement (obligatoire) |
| 4 | Catégorie | l'une des huit valeurs de catégorie |
| 5 | Notes | multiligne, saut de ligne avec `\n` |
| 6 | annuel | `x` = récurrence annuelle |
| 7 | Identifiant | attribué automatiquement dès que l'entrée est liée |
| 8 | Prédécesseur | liste d'identifiants, séparés par des virgules |
| 9 | Successeur | liste d'identifiants, séparés par des virgules |

Un `|` dans le texte s'écrit `\|`, un antislash `\\`. Les problèmes de valeur d'entrées individuelles (date manquante ou invalide, fin avant le début, catégorie inconnue) sont des **indications souples** — l'entrée reste visible. Les erreurs de structure du bloc (directive inconnue, trop de cellules) verrouillent l'édition jusqu'à ce que la source soit corrigée.

## Modèle de champs : le profil interne

Les champs d'événement sont définis comme un **profil de propriétés interne** fixe nommé `Ereignis`. Il apparaît automatiquement dans la résolution de profil et dans la liste des profils des paramètres (marqué, non modifiable) et agit même sans dossier de profils configuré. Détails sur le mécanisme des profils sur la page [Profils de propriétés](property-profiles.md).

| Champ | Type |
|---|---|
| `event-date` | Date |
| `event-end` | Date |
| `event-text` | Texte |
| `event-category` | choix parmi les huit valeurs de catégorie |
| `event-notes` | texte multiligne |
| `event-recurring` | Booléen |
| `event-predecessors` | Liste |
| `event-successors` | Liste |

Les huit valeurs de catégorie sont `geburtstag`, `todestag`, `jahrestag`, `jubilaeum`, `projekt`, `termin`, `erinnerung` et `sonstiges` — des valeurs techniques dans la source, affichées sous forme de noms localisés dans des badges colorés.

## Modifier dans le tableau

Le tableau est directement modifiable dans la vue partagée, en mode direct **et dans la vue lecture** (les pages du manuel et les intégrations restent en lecture seule). Chaque validation réécrit dans le bloc de code, comme une seule étape d'annulation.

- **Ajouter** : ligne de formulaire sous le tableau ; le texte de l'événement est le champ obligatoire, le symbole 📅 ouvre un sélecteur de calendrier pour les champs de date.
- **Modifier** : l'action crayon de la ligne ouvre les champs de saisie ; `Entrée` valide, `Échap` annule.
- **Dupliquer** : crée une copie de l'entrée, volontairement sans liens.
- **Supprimer** : après confirmation ; les liens d'autres entrées vers l'entrée supprimée sont également nettoyés.

### Colonne d'écart de temps

L'écart par rapport à aujourd'hui apparaît en quatre échelons — années, mois, semaines et jours, calculés au calendrier près — avec le sens « passé », « à venir » ou « aujourd'hui ». Si une fin est définie, la colonne affiche en plus la durée de l'intervalle. En cas de récurrence annuelle, un compte à rebours court jusqu'à la prochaine occurrence ; le 29 février tombe le 28 les années non bissextiles.

### Jalons

Les événements signalent des distances rondes comme jalons : multiples de mille en jours, multiples de cent en semaines, multiples de cent en mois, années pleines ainsi que les années de jubilé 10, 18, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90 et 100.

## Trier et filtrer

Un clic sur l'en-tête de colonne trie par date, fin, événement ou catégorie (un nouveau clic inverse le sens ; par défaut, date décroissante, les valeurs vides se placent à la fin). La barre de filtre combine la recherche de texte, la sélection de catégorie, la période (avec des préréglages comme « Aujourd'hui », « Cette semaine », « 30 prochains jours ») et les indicateurs « uniquement avec notes », « uniquement récurrentes », « uniquement avec durée » ; un compteur affiche les entrées visibles.

Les filtres nommés peuvent être enregistrés comme directive `filter:` dans le bloc et appliqués via la barre :

````markdown
```perspective-events
filter: Récurrents := recurring=x
filter: Anniversaires := categories=geburtstag; from=2026-01-01
| 1990-03-10 | | Anniversaire d'Anna | geburtstag | | x | | | |
```
````

La directive porte des paires `Nom := Clé=Valeur`, séparées par `;` : `text`, `categories` (séparées par des virgules, `none` = sans catégorie), `from`, `to` ainsi que les indicateurs `notes`, `recurring` et `timespan` (`x` = activé). Un `;` dans la valeur s'écrit `\;`.

## Vues

Le commutateur au-dessus du bloc bascule entre **Tableau, Tableau de bord, calendrier mensuel, calendrier hebdomadaire, Chronologie et Gantt** ; le choix est écrit dans le bloc comme directive `view:` (`table`, `dashboard`, `month`, `week`, `timeline`, `gantt`). Un clic sur un événement dans une vue supplémentaire saute à la ligne du tableau.

```perspective-events
view: dashboard
| 1990-03-10 | | Anniversaire d'Anna | geburtstag | | x | | | |
| 2026-07-20 | | Atelier | termin | | | | | |
| 2026-08-30 | | Fête d'été | jahrestag | | x | | | |
```

Le tableau de bord regroupe les événements à venir, les jalons atteints et proches ainsi que la répartition par catégorie ; les calendriers placent les entrées sur une grille mensuelle ou hebdomadaire avec un repère du jour ; la chronologie regroupe chronologiquement.

### Gantt

La vue Gantt place les événements sous forme de barres sur un axe temporel commun, une ligne par entrée, triées par date. Une entrée avec une fin devient une barre couvrant sa durée, une entrée sans fin un losange à sa date ; la couleur provient de la catégorie. Des lignes pointillées relient prédécesseurs et successeurs, une ligne verticale marque le jour même.

```perspective-events
view: gantt
| 2026-07-06 | 2026-07-31 | Phase de conception | projekt | | | e1 | | e2 |
| 2026-08-03 | 2026-09-11 | Réalisation | projekt | | | e2 | e1 | |
| 2026-08-01 | | Validation | termin | | | | | |
```

La granularité de l'axe découle de l'étendue : les étendues courtes affichent des jours, les moyennes des semaines, les longues des mois. Pour une résolution plus fine, restreignez la période avec le filtre. Les événements récurrents se placent à leur **prochaine occurrence** et portent le signe ↻, afin que l'axe ne remonte pas à l'année d'origine. À côté du nom, ★ signale un jalon atteint et ⛓ le nombre de liens. Les entrées sans date valide n'apparaissent que dans le tableau. Les barres ne se déplacent pas par glissement ; les dates se modifient dans la vue tableau.

## Agrégation via le frontmatter

Au lieu de ses propres lignes de données, le bloc peut collecter les événements **à partir des fichiers de la zone** : une directive `query:` marque l'agrégation, les lignes de données ne sont alors pas autorisées. L'ensemble de base est constitué de tous les fichiers de la zone dont le champ d'association nomme le profil `Ereignis` ; les données d'événement proviennent de leurs champs de frontmatter (`event-date`, `event-text`, …).

````markdown
```perspective-events
query: WHERE event-category = 'geburtstag'
```
````

Le texte de requête utilise le langage à clauses de la [Requête Perspective](frontmatter-query.md) (`FROM`, `WHERE`, comparaisons, fonctions) ; une requête vide collecte tous les fichiers avec le profil `Ereignis`. Les valeurs de texte sont entre guillemets (`'geburtstag'`) — un mot nu serait une référence de champ.

- **Clic sur une ligne** ouvre le fichier source ; l'origine de chaque entrée reste visible.
- **La maintenance réécrit** : les modifications dans le tableau agrégé arrivent dans le frontmatter du fichier source, même s'il n'est pas ouvert. Si le fichier source est ouvert avec des modifications non enregistrées, une indication y renvoie ; s'il a été modifié entre-temps sur le disque, rien n'est écrit (indication de conflit).
- **Limites** : l'ajout et la suppression n'existent pas dans l'agrégation — les nouveaux fichiers d'événement naissent comme des documents ordinaires avec le profil `Ereignis`. L'agrégation nécessite une zone ouverte avec index.

## Liens

Les événements peuvent être chaînés comme **prédécesseurs et successeurs** — dans le bloc via des identifiants attribués automatiquement (cellules 7 à 9), dans l'agrégation via les champs de liste `event-predecessors`/`event-successors` avec des références de fichier. Les deux côtés sont toujours maintenus ensemble.

- L'**indicateur de lien** dans la colonne de date ouvre une fenêtre contextuelle avec les références : saut vers l'entrée liée ou ouverture du fichier lié, dans le contexte modifiable également une recherche et un commutateur prédécesseur/successeur.
- Les identifiants n'apparaissent qu'avec le premier lien ; la duplication ne reprend aucun lien, la suppression nettoie les deux côtés.
- Les liens ne relient que des entrées du même monde — entrées de bloc entre elles ou fichiers entre eux, pas au-delà de la frontière.
- Les références orphelines (cible supprimée ou renommée) apparaissent comme indication souple avec un bouton de suppression.

## Export

L'export portable convertit les blocs d'événements intégrés en tableaux statiques avec des textes finalisés dans la langue d'export (la colonne d'écart de temps calcule au moment de l'export) ; les blocs d'agrégation restent des blocs de code, car leur contenu dépend de la zone.
