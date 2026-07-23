# Listes de tâches

Les listes de tâches sont des éléments de liste avec une case de statut. Au-delà des statuts standard (ouvert, terminé), il existe des statuts étendus avec caractère, glyphe et couleur propres, ainsi que des marqueurs de tâche pour les échéances, la priorité et la récurrence en fin de ligne.

## Statuts standard

```markdown
- [ ] tâche ouverte
- [x] tâche terminée
```

- [ ] tâche ouverte
- [x] tâche terminée

Dans les fichiers modifiables, un clic sur la case termine la tâche ou la rouvre — en vue Lecture et en mode Direct. Dans le manuel en lecture seule, le clic est sans effet.

## Statuts étendus

Six statuts prédéfinis ; le caractère se place entre les crochets :

```markdown
- [/] en cours
- [-] annulé
- [>] délégué
- [?] question
- [!] important
- [*] marqué
```

- [/] en cours
- [-] annulé
- [>] délégué
- [?] question
- [!] important
- [*] marqué

Chaque statut s'affiche comme une case colorée avec un glyphe. Un clic sur la case passe au **symbole suivant** du statut (par défaut : terminer avec `[x]`) ; on peut ainsi configurer des chaînes comme « ouvert → en cours → terminé ».

## Statuts personnalisés, type et symbole suivant

La section **Statuts de tâche** de la page des paramètres (Fichier → Paramètres…) gère le jeu : les statuts prédéfinis peuvent être désactivés ou recolorés, des statuts personnalisés avec caractère, libellé et couleur librement choisis peuvent s'ajouter. Sont interdits l'espace, `x`, `X`, les crochets et la barre oblique inverse ; un avertissement signale les caractères utilisés plusieurs fois.

Chaque statut porte en plus un **type** et un **symbole suivant** :

- **Type** détermine la signification du statut : Ouvert, En cours, En attente, Terminé, Annulé ou Pas une tâche. Seul le passage à un statut de type **Terminé** inscrit la date de fin et déclenche la récurrence ; le type **Annulé** inscrit la date d'annulation. Les lignes de type **Pas une tâche** ne comptent pas comme des tâches. L'affectation est libre — même un caractère comme `*` peut porter le type Terminé.
- **Symbole suivant** détermine quel caractère le clic sur la case de statut définit ensuite. Les statuts de base sont fixes : `[ ]` devient `[x]`, `[x]` devient `[ ]`.

## Marqueurs de tâche : échéances

Les échéances figurent comme marqueurs symboles avec une date `AAAA-MM-JJ` en fin de ligne et apparaissent dans toutes les vues sous forme de badge :

```markdown
- [ ] Rendre le rapport 📅 2099-03-31
- [ ] Préparation ⏳ 2099-03-24 🛫 2099-03-17
- [ ] Très en retard 📅 2020-01-01
```

- [ ] Rendre le rapport 📅 2099-03-31
- [ ] Préparation ⏳ 2099-03-24 🛫 2099-03-17
- [ ] Très en retard 📅 2020-01-01

Se définissent manuellement **échéance** (`📅`), **planifié** (`⏳`) et **début** (`🛫`). Se créent automatiquement **créé** (`➕`), **terminé** (`✅`) et **annulé** (`❌`) — voir dates automatiques. Les échéances dépassées sont surlignées en rouge ; les valeurs invalides au calendrier (un 30 février, par exemple) sont conservées et marquées comme invalides.

Après la date, une **heure** `HH:mm` est facultativement admise :

```markdown
- [ ] Rendez-vous dentiste 📅 2099-03-31 14:30
```

- [ ] Rendez-vous dentiste 📅 2099-03-31 14:30

L'heure est une extension de format propre à cette application ; d'autres programmes Markdown au même format de marqueur n'attendent pas d'heure après la date. Les lignes sans heure sont entièrement interchangeables.

À distinguer de cette date réelle, le marqueur de rappel ⏰ déclenche un rappel au moment indiqué ; il est décrit sur la page [Rappels](reminders.md).

## Marqueurs de tâche : priorité

Six niveaux ; « normal » n'a pas de symbole et se situe entre moyenne et basse :

```markdown
- [ ] La plus haute 🔺
- [ ] Haute ⏫
- [ ] Moyenne 🔼
- [ ] Normale (sans marqueur)
- [ ] Basse 🔽
- [ ] La plus basse ⏬
```

- [ ] La plus haute 🔺
- [ ] Haute ⏫
- [ ] Moyenne 🔼
- [ ] Normale (sans marqueur)
- [ ] Basse 🔽
- [ ] La plus basse ⏬

## Marqueurs de tâche : récurrence

Une règle de récurrence suit `🔁` et, à l'achèvement de la tâche, produit automatiquement l'instance suivante — avec des échéances reportées, un statut ouvert et, selon le paramètre, au-dessus (par défaut) ou en dessous de la ligne terminée :

```markdown
- [ ] Planification hebdomadaire 🔁 every week on Sunday ⏳ 2099-03-01
- [ ] Sortir les poubelles 🔁 every 3 days when done 📅 2099-03-05
- [ ] Vérifier le loyer 🔁 every month on the last 📅 2099-03-31
```

- [ ] Planification hebdomadaire 🔁 every week on Sunday ⏳ 2099-03-01
- [ ] Sortir les poubelles 🔁 every 3 days when done 📅 2099-03-05
- [ ] Vérifier le loyer 🔁 every month on the last 📅 2099-03-31

Formes de règle : `every day`, `every 3 days`, `every weekday`, `every week`, `every week on Sunday` (aussi plusieurs jours de la semaine), `every 2 weeks`, `every month`, `every month on the 15th`, `every month on the last`, `every 6 months`, `every year`. L'ajout `when done` calcule à partir de l'achèvement réel au lieu de la date cible.

Comportement en détail : la base de calcul est l'échéance, à défaut le planifié, à défaut le début — au moins un champ d'échéance est requis. Si plusieurs champs portent des échéances, leurs écarts sont conservés ; les heures sont reprises sans changement. Les règles mensuelles sautent les mois sans le jour cible (un 31 ne tombe donc jamais le 30). Il n'y a ni date de fin ni limite du nombre d'occurrences ; les règles incompréhensibles restent sans effet.

## Dates automatiques

Au changement de statut, l'application écrit des marqueurs de date dans la ligne — chacun des trois automatismes peut être désactivé individuellement dans la section de paramètres **Tâches** :

- **Terminé** (`✅`) : au passage à un statut de type Terminé ; le retour en arrière retire de nouveau la date.
- **Annulé** (`❌`) : de même pour le type Annulé.
- **Créé** (`➕`) : lors de la transformation d'une ligne en tâche via la commande « Liste de tâches » (désactivé par défaut).

L'automatisme n'écrit que la date, sans heure.

## Filtre global

Le **Filtre global** (section de paramètres **Tâches**) décide quelles lignes à case cocher comptent comme tâches : seules les lignes qui contiennent le texte du filtre (par exemple `#task`) reçoivent des badges et des dates automatiques ; si le filtre est vide, chaque ligne à case compte. Le texte du filtre peut être masqué dans les vues.

## ID et dépendances

Une tâche peut porter un **ID** (`🆔`) et dépendre d'autres tâches via des **références à un prédécesseur** (`⛔` avec un ou plusieurs ID) — relations fin-début :

```markdown
- [ ] Couler les fondations 🆔 abc12 📅 2099-04-01
- [ ] Monter les murs ⛔ abc12
```

- [ ] Couler les fondations 🆔 abc12 📅 2099-04-01
- [ ] Monter les murs ⛔ abc12

Une tâche est considérée comme **bloquée** tant qu'au moins un prédécesseur est encore ouvert (types de statut Ouvert, En cours ou En attente des deux côtés) ; les prédécesseurs terminés ou annulés ne bloquent pas. Les résultats bloqués de la requête de tâches portent un marquage `⛔` discret ; les champs `blocked`, `blocking` et `id.set` filtrent en conséquence (voir le Niveau tâche de la page [Requête Perspective](frontmatter-query.md)).

Les ID se composent de lettres, de chiffres, de `_` et de `-`. Les ID générés automatiquement (dialogue ou autocomplétion) sont **uniques dans le périmètre de recherche** ; les ID attribués deux fois à la main affichent un badge `⚠` dans les résultats et se retrouvent via le champ `id.duplicate`. Dans l'instance suivante d'une récurrence, les marqueurs d'ID et de prédécesseur sont retirés afin d'éviter les ID en double.

## Dialogue d'édition

La commande **Modifier la tâche…** (défaut `Ctrl+Alt+A`, aussi dans le menu contextuel de l'éditeur sous Insérer et comme bouton crayon sur les résultats de requête) ouvre un formulaire pour tous les marqueurs : description, statut (issu du jeu de statuts configuré), priorité, règle de récurrence avec indication en cas de forme incompréhensible, les trois échéances manuelles via le calendrier de dates, ainsi qu'ID, prédécesseurs et successeurs avec une recherche de tâches sur le périmètre de recherche. Sur une ligne de tâche, le dialogue modifie ; sur une ligne vide, il crée une nouvelle tâche. Le passage à un statut de type Terminé inscrit la date de fin selon l'automatisme ; une entrée de successeur écrit la référence au prédécesseur sur la ligne cible (la tâche elle-même reçoit au besoin automatiquement un ID). Chaque application est une seule étape d'annulation.

## Autocomplétion

Sur les lignes de tâche, l'autocomplétion propose des marqueurs après la case de statut : les trois échéances (ouvrent le calendrier de dates), la priorité, les règles de récurrence courantes, les changements de statut et « Générer un ID ». Les suggestions apparaissent à partir d'une longueur de saisie réglable (ou immédiatement avec `Ctrl+Espace`) et remplacent le mot saisi à la validation ; la longueur de saisie minimale et le nombre de suggestions se trouvent dans la section de paramètres **Tâches**.

## Requêtes de tâches et réécriture

La portée de requête `LIST TASKS` (page [Requête Perspective](frontmatter-query.md), section Niveau tâche) liste les tâches sur tout le périmètre de recherche — avec des filtres sur tous les champs de marqueur, un regroupement et un contrôle de disposition. Les résultats sont une surface de travail : la **case de statut** fait avancer le statut directement dans le fichier source (avec bascule en chaîne, dates automatiques et récurrence), le **bouton de report** déplace l'échéance déterminante à demain, une semaine plus tard ou une date librement choisie (les échéances dépassées comptent à partir d'aujourd'hui), le **bouton crayon** ouvre le dialogue d'édition. L'écriture atteint aussi les fichiers non ouverts ; les documents ouverts sont mis à jour via l'état de l'éditeur et jamais dépassés, et si une ligne de résultat a changé entre-temps, un avis apparaît au lieu d'une écriture aveugle.

## Score d'urgence

Le score rend les listes de tâches triables sans intervention manuelle (le tri par défaut de la requête de tâches ; affichable comme valeur via `SHOW urgency`, filtrable et triable via le champ `urgency`). Il est la somme de quatre composantes :

| Composante | Valeur |
|---|---|
| Échéance | 12,0 à partir de sept jours de retard, décroissant progressivement jusqu'à 2,4 à partir de quatorze jours dans le futur (échéance aujourd'hui : 8,8) ; 0 sans échéance |
| Priorité | La plus haute 9,0 · Haute 6,0 · Moyenne 3,9 · Normale 1,95 · Basse 0,0 · La plus basse −1,8 |
| Planifié | +5,0 si l'échéance planifiée est aujourd'hui ou avant |
| Début | −3,0 si l'échéance de début est demain ou après |

Le score calcule sur une base journalière ; une heure après la date n'a aucune influence, et les échéances invalides au calendrier comptent comme absentes.
