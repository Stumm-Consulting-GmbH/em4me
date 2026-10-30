# Workflows

Un **workflow** consigne des manipulations récurrentes sous forme de suite fixe d'étapes : créer, renommer, déplacer, copier et placer dans la corbeille des fichiers et des dossiers, ajouter ou insérer du texte, définir des propriétés et des étiquettes dans l'en-tête, cocher des tâches, exécuter des commandes, des macros et d'autres workflows. Un workflow est un **fichier Markdown ordinaire** ; ce qu'il fait figure dans un bloc de commandes fixes, une ligne par étape. Le fichier reste ainsi lisible sans l'application, se transmet et se modifie comme tout autre document.

Un workflow se lance **à la main** : depuis le menu, la palette de commandes, par un raccourci clavier, un bouton au-dessus du bloc ou le menu contextuel du panneau de zone. Un workflow avec une planification s'exécute en outre **selon sa planification** dès qu'il est armé. **Avant que la première étape ne s'exécute, l'application vérifie le workflow entier** ; une erreur s'affiche au-dessus du bloc avec la ligne et le motif, et rien ne s'exécute.

## L'extension « Workflows »

La fonction fait partie des [extensions intégrées](extensions.md) (« Workflows », groupe **Outils**) ; elle est activée dans le mode de travail **Complet** et désactivée dans les modes **Débutant** et **Avancé**. Désactivée, un bloc `workflow` est un bloc de code ordinaire sans mise en évidence, sans affichage de vérification et sans boutons ; il n'y a ni commandes des workflows, ni sous-menu **Workflows**, ni page **Exécutions des workflows**, ni élément **Workflows** dans la barre d'état, ni sections de paramètres **Workflows**, ni exécution selon la planification. Un fichier de workflow est alors un document ordinaire. Rien n'est perdu : les fichiers, les états d'exécution avec l'état armé et le dossier de workflows défini sont inchangés après la réactivation.

## Structure d'un fichier de workflow

Un fichier est un workflow si son en-tête porte la marque `workflow: true`. Ce que fait le workflow figure dans **exactement un** bloc de code de langage `workflow`. Le reste du texte est la description destinée aux personnes ; ses sections peuvent servir de source d'un contenu (section « Sources d'un contenu » plus bas).

````markdown
---
workflow: true
name: Bilan hebdomadaire
description: Crée le bilan de la semaine et l'inscrit dans le journal de bord.
---

# Bilan hebdomadaire

```workflow
# Créer le bilan à partir du modèle et l'ouvrir
create "Bilans/{{date}} Semaine.md" from-template "Bilan.md"
open "Bilans/{{date}} Semaine.md"
insert "Journal de bord.md" under "Bilans" from-section "Entrée"
notify "Bilan créé"
```

## Entrée

- Bilan hebdomadaire créé.
````

L'en-tête porte la marque, le nom, le déclencheur, la description et, pour une exécution planifiée, la planification :

| Clé | Obligatoire | Signification |
| --- | --- | --- |
| `workflow` | oui | `true` marque le fichier comme workflow. |
| `name` | non | Nom du workflow dans le menu, la palette de commandes et les messages ; sans indication, le nom du fichier sans extension s'applique. |
| `trigger` | non | Déclencheur : `manual` pour le lancement à la main, `schedule` pour l'exécution selon la planification ; sans indication, `manual` s'applique. |
| `schedule` | avec `trigger: schedule` | Planification sur une ligne, par exemple `every weekday at 08:00` (section « Planification et armement »). |
| `missed` | non | Traitement des exécutions manquées : `run-once` rattrape une fois, `skip` les laisse expirer ; sans indication, `run-once` s'applique. |
| `description` | non | Description courte ; la page **Exécutions des workflows** l'affiche en infobulle sur le nom. |

Un autre déclencheur que `manual` ou `schedule` est signalé comme « pas encore pris en charge », et le workflow ne s'exécute pas ; le fichier reste inchangé. Un fichier portant deux blocs `workflow` ou plus, ou aucun, ne s'exécute pas non plus. Un bloc ne contenant que des commentaires est valide et ne fait rien.

## Lignes de commande

Les lignes du bloc suivent une forme fixe :

- **Une ligne est une commande.** Les lignes vides et celles qui commencent par `#` sont des commentaires. Il n'y a pas de commentaire après une commande, ni de suite sur plusieurs lignes.
- **D'abord le mot-clé, puis les indications**, séparés par des espaces. Les mots-clés sont anglais et écrits en minuscules : `create`, pas `Create`.
- **Chemins et textes** figurent entre guillemets doubles droits. Un guillemet dans le texte s'écrit `\"` ; toute autre barre oblique inverse reste telle quelle. Les guillemets typographiques, tels qu'un traitement de texte les insère lors d'une copie, sont une erreur.
- **Nombres et identifiants de commande** figurent sans guillemets : `wait 2`, `command view.modeSplit`.
- **Les options nommées** sont une paire option et valeur, comme `from-template "Jour.md"` ou `under "Journal"`, ou un mot seul comme `at-start`. Elles suivent les autres indications dans un ordre quelconque, au plus une de chaque sorte.
- **Les chemins** sont relatifs à la racine de la zone dans laquelle le workflow est lancé ; le séparateur est la barre oblique `/`. Un chemin absolu et un chemin avec `..` ne sont pas autorisés. Le chemin après `from-template` désigne un modèle et est relatif au [dossier de modèles](templates.md).

```workflow
# Commentaire : créer le dossier d'un nouveau projet
mkdir "Projets/{{prompt:Nom du projet ?}}/Notes"
replace "{{file}}" "Statut : ouvert" "Statut : \"en cours\""
insert "{{file}}" at-start from-file "Blocs/En-tête.md"
```

## Vérifier avant d'exécuter

Avant la première étape, l'application vérifie le fichier entier ainsi que chaque workflow qu'il appelle. Elle signale entre autres :

- les commandes inconnues et les commandes d'une étape ultérieure,
- les indications manquantes, en trop ou mal écrites, les options inconnues ou en double,
- les chemins hors de la zone, les chemins et textes vides, les nouveaux noms invalides,
- une attente de plus de dix secondes,
- les commandes, macros et workflows inconnus, ainsi que les noms portés par plusieurs macros ou workflows,
- un workflow qui s'appelle lui-même, y compris par le détour d'un autre, et une imbrication de plus de cinq niveaux,
- les espaces réservés erronés, les modèles illisibles et les modèles désactivés,
- une planification illisible, une heure manquante ou non autorisée, `schedule` sans `trigger: schedule` et inversement, ainsi qu'une valeur inconnue pour `missed`.

Une anomalie arrête l'exécution **avant la première étape** ; un fichier de workflow erroné ne s'exécute donc pas du tout au lieu de s'exécuter en partie. La vérification signale toutes les anomalies à la fois ; la ligne indiquée est la ligne dans le document telle que l'éditeur la compte, en-tête compris. Seule exception, l'anomalie « Manuel uniquement » (section « Planification et armement ») : elle empêche uniquement l'armement, le lancement à la main reste possible.

Ce que seule une étape antérieure peut produire est vérifié par l'application à l'étape même : l'existence d'un fichier, d'une section ou d'un titre. S'il manque à ce moment, l'étape échoue.

## Commandes

Les commandes, classées selon leur objet. Les chemins sont relatifs à la racine de la zone.

### Fichiers et dossiers

| Commande | Signification | Indications | Exemple |
| --- | --- | --- | --- |
| `create` | créer un fichier, vide ou avec contenu | chemin ; au choix une source | `create "Journal/{{date}}.md" from-template "Jour.md"` |
| `rename` | renommer un fichier ou un dossier | chemin, nouveau nom | `rename "Brouillon.md" "Note {{date}}.md"` |
| `move` | déplacer un fichier ou un dossier dans un dossier ; les liens sont mis à jour | chemin, dossier cible | `move "{{file}}" "Archives/2026"` |
| `copy` | copier un fichier | chemin, cible | `copy "Gabarits/Liste.md" "Projets/Nouveau/Liste.md"` |
| `mkdir` | créer un dossier, même imbriqué | chemin | `mkdir "Projets/Nouveau/Notes"` |
| `open` | ouvrir un fichier dans la fenêtre ou passer à lui | chemin | `open "Journal/{{date}}.md"` |
| `close` | fermer un document ouvert | chemin | `close "{{file}}"` |

- **Cible existante :** si la cible de `create`, `copy`, `rename` ou `move` existe déjà, l'étape échoue ; rien n'est écrasé.
- **Dossier cible manquant :** `create`, `copy` et `move` le créent à l'intérieur de la zone.
- **Déplacer et renommer** suivent le même chemin que dans le panneau de zone : les liens vers le fichier sont mis à jour, les sous-pages et le fichier compagnon suivent.
- `mkdir` sur un dossier existant et `close` sur un document non ouvert réussissent sans rien modifier. `close` sur un document non enregistré affiche la demande d'enregistrement habituelle ; « Annuler » met fin à l'exécution à cette ligne.

### Contenu et en-tête

| Commande | Signification | Indications | Exemple |
| --- | --- | --- | --- |
| `append` | placer un contenu à la fin d'un fichier | chemin, source | `append "{{file}}" from-section "Points ouverts"` |
| `insert` | insérer un contenu sous un titre ou au début | chemin, emplacement (`under "Titre"` ou `at-start`), source | `insert "{{file}}" under "Journal" from-section "Entrée"` |
| `replace` | remplacer chaque occurrence d'un texte | chemin, texte cherché, remplacement | `replace "{{file}}" "PROJET" "{{prompt:Nom du projet ?}}"` |
| `set-property` | définir ou modifier une propriété dans l'en-tête | chemin, nom, valeur | `set-property "{{file}}" statut "terminé"` |
| `remove-property` | retirer une propriété de l'en-tête | chemin, nom | `remove-property "{{file}}" brouillon` |

- `insert … under` insère directement sous le titre, avant son contenu existant ; `insert … at-start` insère au début du texte, après l'en-tête. Si le titre manque ou apparaît plusieurs fois, l'étape échoue.
- `replace` remplace chaque occurrence, comme « Tout remplacer » dans l'éditeur ; s'il n'en trouve aucune, l'étape échoue.
- `set-property` et `remove-property` laissent les autres propriétés dans leur ordre. `remove-property` sur une propriété qui n'existe pas réussit sans modification.
- **Fichiers ouverts :** si le fichier cible est ouvert dans une fenêtre et non enregistré, la modification va à cette fenêtre et y apparaît comme modification dans l'éditeur ; le travail non enregistré est conservé. Sinon, le fichier est écrit directement.

### Application et déroulement

| Commande | Signification | Indications | Exemple |
| --- | --- | --- | --- |
| `command` | exécuter une commande de l'application | identifiant de commande | `command view.modeSplit` |
| `macro` | exécuter une macro des paramètres | nom de la macro | `macro "Début de journée"` |
| `workflow` | exécuter un autre workflow du dossier de workflows | nom du workflow | `workflow "Créer les dossiers"` |
| `wait` | pause en secondes, au plus 10 | nombre | `wait 2` |
| `notify` | afficher un texte comme message | texte | `notify "Bilan hebdomadaire créé"` |
| `stop` | mettre fin à l'exécution avec un texte | texte | `stop "Rien à faire"` |

- `command` prend l'identifiant fixe d'une commande, comme `view.modeSplit`, `view.modeLive` ou `file.save`, et l'exécute dans la fenêtre de lancement. Si elle n'est pas exécutable sur le moment, l'étape échoue. Macros et workflows ne passent pas par `command`, mais par leurs propres commandes.
- `macro` et `workflow` peuvent être imbriqués sur cinq niveaux au plus. Un workflow appelé revient après sa dernière étape ; si une étape y échoue, toute l'exécution prend fin.
- `notify` affiche son texte dans la barre d'état et, lors d'une exécution planifiée, aussi comme notification du système d'exploitation (section « Déroulement d'une exécution »).
- `stop` met fin à toute l'exécution, même depuis un workflow appelé ; la barre d'état affiche « Workflow ‹Nom› arrêté à la ligne N : texte ».

### Commandes d'entretien

| Commande | Signification | Indications | Exemple |
| --- | --- | --- | --- |
| `delete` | supprimer : placer un fichier ou un dossier dans la corbeille | chemin | `delete "Brouillons/Ancien.md"` |
| `add-tag` | ajouter une étiquette à la liste `tags` de l'en-tête | chemin, étiquette | `add-tag "{{file}}" "terminé"` |
| `remove-tag` | retirer une étiquette de la liste `tags` de l'en-tête | chemin, étiquette | `remove-tag "{{file}}" "brouillon"` |
| `complete-task` | cocher la première tâche ouverte contenant le texte cherché | chemin, texte cherché | `complete-task "Projets/Plan.md" "Envoyer l'offre"` |
| `confirm` | poser une question avec « Oui » et « Non » | question | `confirm "Archiver tous les brouillons ?"` |

- **`delete`** place la cible dans la corbeille, comme la suppression dans le panneau de zone ; un dossier part en entier. Avec un fichier partent son fichier compagnon (`.mdd`) avec l'état d'exécution et ses justificatifs de modification (`.mddl`). La racine de la zone ne peut pas être supprimée. Une cible supprimée se récupère dans la corbeille.
- **Une confirmation par exécution :** si une exécution contient `delete`, **une** confirmation avant la première étape nomme toutes les cibles de l'exécution avec leur chemin, y compris celles des workflows appelés ; « Non » ne laisse s'exécuter aucune étape, et l'exécution compte comme saisie annulée. Si une cible est ouverte dans cette fenêtre, elle est fermée avant l'étape ; en cas de modifications non enregistrées apparaît la demande d'enregistrement habituelle, et « Annuler » met fin à l'exécution à cette ligne.
- **`add-tag` et `remove-tag`** ne modifient que la liste `tags` de l'en-tête ; une étiquette déjà présente ou absente n'est pas une erreur. Un `#` initial est omis, et la casse ne compte pas dans la comparaison ; une étiquette vide ou contenant des espaces n'est pas valide. Si `remove-tag` retire la dernière étiquette, la liste vide `tags: []` reste en place. Les étiquettes dans le texte (`#étiquette`) restent intactes ; pour elles, il y a `replace`.
- **`complete-task`** cherche parmi les tâches ouvertes du fichier, celles-là mêmes que montre la [requête de tâches](tasks.md), la première dont le texte contient le texte cherché, en respectant la casse. Elle la coche comme un clic dans la requête de tâches, avec la date d'achèvement selon les paramètres des tâches. Si elle n'en trouve aucune, l'étape échoue.
- **`confirm`** affiche la question avec « Oui » et « Non ». « Oui » poursuit l'exécution ; « Non » y met fin sans échec, et la barre d'état affiche « Workflow ‹Nom› arrêté à la ligne N : Réponse « Non » à «question» ».
- **Fichiers ouverts :** sur un fichier ouvert et non enregistré dans une fenêtre, `add-tag`, `remove-tag` et `complete-task` agissent par cette fenêtre, comme les commandes de contenu.
- `delete` et `confirm` exigent une personne présente : dans un workflow avec `trigger: schedule`, ils constituent l'anomalie « Manuel uniquement ».

### Sources d'un contenu

`create`, `append` et `insert` tirent leur contenu de l'une de trois sources. Un contenu ne figure jamais comme texte libre dans la ligne de commande.

| Option | Contenu |
| --- | --- |
| `from-template "chemin"` | un modèle du dossier de modèles, rempli comme lors de l'application d'un modèle ; ses dialogues de saisie apparaissent avant la première étape |
| `from-file "chemin"` | le contenu d'un autre fichier de la zone, tel quel, dans l'état où il se trouve à l'étape |
| `from-section "Titre"` | le contenu d'une section du fichier de workflow lui-même, tel quel |

Une section est le texte sous son titre jusqu'au titre suivant de même niveau ou de niveau supérieur, sans le titre lui-même ; les sous-sections en font partie. Elle est trouvée comme avec un lien `[[Fichier#Titre]]`. `from-file` et `from-section` copient tel quel : les espaces réservés qu'ils contiennent restent en place. Seul un modèle est rempli. Si l'extension « Modèles » est désactivée, la vérification signale « Les modèles sont désactivés » pour `from-template` ; les workflows sans modèle continuent de s'exécuter.

## Espaces réservés

Les espaces réservés valent dans chaque indication d'une ligne de commande. Modèles et workflows partagent le même jeu ; l'écriture avec décalage et format est décrite sur la page [Modèles](templates.md).

| Espace réservé | Valeur dans une ligne de commande |
| --- | --- |
| `{{date}}`, `{{time}}` | date et heure du lancement, aussi avec décalage et format : `{{date:+7d:dd.MM.yyyy}}` |
| `{{file}}` | chemin du document actif au lancement, relatif à la racine de la zone, par exemple `Projets/Plan.md` |
| `{{title}}` | titre du document actif au lancement |
| `{{folder}}` | dossier du document actif au lancement, relatif à la racine de la zone |
| `{{area}}` | nom de la zone |
| `{{clipboard}}` | texte du presse-papiers au lancement ; lors d'une exécution planifiée, ce qui se trouve à ce moment dans le presse-papiers |
| `{{prompt:Question}}`, `{{prompt:Question:Défaut}}` | dialogue de saisie |
| `{{select:Question:a,b,c}}` | dialogue de choix |

- **Tous les dialogues avant la première étape :** les dialogues de saisie et de choix de toute l'exécution apparaissent l'un après l'autre avant que quoi que ce soit ne se produise, y compris ceux des modèles utilisés et des workflows appelés. Une même question n'est posée qu'une fois et vaut partout. Annuler un dialogue annule l'exécution, et aucune étape ne s'exécute.
- **Un instant par exécution :** `{{date}}` et `{{time}}` ont la même valeur dans toutes les lignes, même au passage de minuit. De même, le presse-papiers est lu une seule fois au lancement, et `{{clipboard}}` a le même contenu dans toutes les lignes.
- **Dans un modèle utilisé par un workflow**, `{{title}}` et `{{folder}}` désignent comme d'habitude le nouveau fichier, tandis que `{{file}}` et `{{area}}` désignent le document actif et la zone.
- **Selon la planification**, personne n'est là pour répondre à un dialogue : dans un workflow avec `trigger: schedule`, les espaces réservés de saisie et de choix constituent l'anomalie « Manuel uniquement ».
- `{{cursor}}` n'est pas autorisé dans une ligne de commande. `\{{` écrit un `{{` littéral.
- Si `{{folder}}` reste vide dans le dossier racine, `"{{folder}}/Nouveau.md"` donne le chemin `Nouveau.md`. Sans document actif, `{{file}}` est vide, et un chemin qui en découle est une anomalie.

## Lancer un workflow

Un workflow ne se lance que dans une zone ouverte, et ses chemins valent dans cette zone, même si le fichier provient du dossier de workflows de l'application ou d'une zone liée. Les moyens à la main :

| Moyen | Effet |
| --- | --- |
| **Fichier → Workflows** | chaque workflow du dossier de workflows comme entrée, les sous-dossiers comme sous-menus |
| **Palette de commandes** (`Ctrl+K` par défaut) | chaque workflow du dossier de workflows comme commande sous son nom |
| **Barre d'état et menu contextuel** | la commande d'un workflow, placée par le [placement des commandes](command-placement.md) |
| **Raccourci clavier** | attribué à la commande d'un workflow sous « Paramètres → Raccourcis clavier » |
| **Bouton « Lancer » au-dessus du bloc** | dans le mode direct, la vue rendue et la vue partagée, à droite dans la ligne d'en-tête du bloc ; lance tout fichier de workflow, même hors du dossier de workflows, avec l'état présent dans l'éditeur |
| **« Lancer » dans le panneau de zone** | tout en haut du menu contextuel de chaque fichier de workflow de la zone |
| **Page « Exécutions des workflows »** | bouton « Lancer » dans la ligne de chaque workflow |

Le bouton au-dessus du bloc est désactivé tant que la vérification signale une anomalie. Pour un document jamais enregistré, il affiche « Enregistrez d'abord », hors d'une zone « Ne peut être lancé que dans une zone ouverte ». Un workflow armé s'exécute en plus de lui-même selon sa planification ; le lancement à la main reste possible à tout moment.

La commande d'un workflow reçoit son identifiant du chemin du fichier dans le dossier de workflows ; deux workflows de même nom dans des sous-dossiers différents restent ainsi distincts. **Renommer un workflow dans l'application ou le déplacer à l'intérieur du dossier de workflows conserve ses attributions :** un raccourci clavier, une place dans la barre d'état, le menu contextuel ou la barre de format et une étape de macro qui l'appelle suivent. **En dehors de l'application**, par exemple dans le gestionnaire de fichiers, l'application ne remarque pas le changement de nom ; les attributions perdent alors leur cible et doivent être redéfinies. Un workflow déplacé hors du dossier de workflows n'est plus une commande ; ses attributions restent enregistrées et agissent de nouveau dès qu'il revient au même endroit.

## Déroulement d'une exécution

1. L'application vérifie le workflow ainsi que les workflows qu'il appelle.
2. Les dialogues de tous les espaces réservés apparaissent l'un après l'autre ; si l'exécution contient `delete`, la confirmation unique des cibles à supprimer suit.
3. Les étapes s'exécutent strictement l'une après l'autre ; chacune attend la précédente.
4. Le premier échec met fin à l'exécution. La barre d'état affiche « Workflow ‹Nom› interrompu à la ligne N : motif ».

Les étapes exécutées le restent ; il n'y a pas d'annulation d'une exécution (section « Ce qu'une exécution a fait »). **Au plus un workflow s'exécute par fenêtre** ; un second lancement pendant une exécution est refusé avec un message.

**Messages :** lors d'un lancement à la main, `notify` affiche son texte dans la barre d'état. Lors d'une exécution planifiée, même rattrapée, le texte part en outre comme **notification du système d'exploitation**, avec le nom du workflow pour titre ; de même l'interruption d'une telle exécution avec la ligne et le motif, même si le workflow ne contient pas de `notify`. La notification n'apparaît que si aucune fenêtre de l'application n'est au premier plan, et une seule fois par message ; sinon, le message dans la barre d'état suffit. Si et comment le système d'exploitation l'affiche relève de ses propres réglages de notification.

## Planification et armement

Un workflow avec `trigger: schedule` et une ligne `schedule` s'exécute de lui-même aux échéances de sa planification dès qu'il est **armé** :

```yaml
---
workflow: true
name: Note du jour
trigger: schedule
schedule: every weekday at 08:00
missed: skip
---
```

### La ligne de planification

La planification est une ligne en mots anglais, sur le modèle des [tâches récurrentes](tasks.md) :

| Forme | Signification | Exemple |
| --- | --- | --- |
| `every N minutes` | toutes les N minutes | `every 30 minutes` |
| `every N hours` | toutes les N heures | `every 2 hours` |
| `every day at HH:MM`, `every N days at HH:MM` | chaque jour ou tous les N jours à l'heure | `every day at 08:00` |
| `every weekday at HH:MM` | du lundi au vendredi à l'heure | `every weekday at 07:30` |
| `every <jours> at HH:MM` | les jours de la semaine indiqués | `every monday, thursday at 18:00` |
| `every N weeks on <jours> at HH:MM` | toutes les N semaines les jours indiqués | `every 2 weeks on monday at 08:00` |
| `every N months on the <jour> at HH:MM` | tous les N mois le jour indiqué | `every month on the 1st at 09:00` |
| `every month on the last at HH:MM` | le dernier jour du mois | `every month on the last at 17:00` |

- **Heure :** `at HH:MM` est obligatoire pour les jours, les jours ouvrés, les semaines et les mois, et interdit pour les minutes et les heures ; l'heure a exactement la forme `08:00`.
- **Écriture :** sans nombre, `1` s'applique (`every day`, `every week`, `every month`) ; singulier et pluriel valent de même. Les jours de la semaine s'écrivent en anglais (`monday` à `sunday`), séparés par une virgule ou `and`. Le jour du mois s'écrit `1st`, `2nd`, `3rd`, `15th` ou comme simple nombre. La casse ne compte pas.
- **Décompte :** un intervalle comme `every 30 minutes` ou `every 2 weeks` se compte à partir de la fin de la dernière exécution, avant la première exécution à partir de l'armement, et non sur une grille fixe de l'horloge.
- Un fichier porte exactement une ligne `schedule`. Une erreur dans celle-ci est une anomalie avec sa ligne dans l'en-tête, par exemple « Planification … illisible » ou « 'at' manquant ».

### Interprétation

- **Heure locale :** l'heure est celle de l'ordinateur, comme pour les rappels et les alarmes. `08:00` reste `08:00` au passage à l'heure d'été ou d'hiver ; si une heure n'existe pas quand l'horloge avance, par exemple `02:30`, le workflow s'exécute à la minute existante suivante.
- **Semaine :** la semaine commence le lundi.
- **Fin de mois :** `last` est le dernier jour du mois. Un jour qu'un mois n'a pas, par exemple `31st` en avril, est sauté ce mois-là ; qui veut dire la fin du mois écrit `last`.

### Quand un workflow s'exécute selon la planification

**Un workflow planifié s'exécute tant que l'application et sa zone sont ouvertes.** Il n'y a pas de service en arrière-plan, et l'application ne se lance pas d'elle-même. Elle vérifie toutes les 30 secondes si un workflow est dû ; une exécution commence donc jusqu'à une demi-minute après son échéance.

- Un workflow dû s'exécute dans exactement une fenêtre de sa zone, même si la zone est ouverte dans plusieurs fenêtres. Si un autre workflow est en cours, celui qui est dû attend qu'une fenêtre de la zone soit libre.
- Après chaque exécution, l'application calcule l'échéance suivante ; la page **Exécutions des workflows** l'affiche dans la colonne **Prochaine exécution**.
- Une exécution planifiée se déroule sans personne présente et ne pose pas de questions. Les espaces réservés de saisie et de choix, `confirm` et `delete` constituent donc l'anomalie **« Manuel uniquement »** dans un workflow avec `trigger: schedule` : il ne peut pas être armé, mais peut toujours être lancé à la main, et les dialogues apparaissent alors comme d'habitude. Si seul un modèle utilisé ou un workflow appelé demande une saisie, l'exécution planifiée s'interrompt avant la première étape avec cette anomalie.

### Exécutions manquées

Une échéance est manquée si elle est tombée alors que l'application ou la zone était fermée ou que l'ordinateur était en veille. Ce qui se passe alors est fixé par le champ `missed` :

- **`run-once`** (par défaut) : le workflow est rattrapé **une fois** à l'ouverture de la zone, même si plusieurs échéances ont été manquées. La barre d'état signale « Workflow ‹Nom› rattrapé », et la page **Exécutions des workflows** affiche « (rattrapé) » après la dernière exécution.
- **`skip`** : l'échéance manquée expire, et le workflow attend la suivante. La page affiche « expiré : » avec l'échéance expirée.

### Armer

Un workflow avec `trigger: schedule` n'est **pas armé** après sa création, sa copie ou sa réception ; il ne s'exécute selon la planification qu'une fois que l'utilisateur l'a armé. L'état armé se trouve dans l'état d'exécution du fichier compagnon et ne suit pas lors d'une copie. L'armement se fait à trois endroits, qui n'apparaissent tous qu'avec `trigger: schedule` :

- **page « Exécutions des workflows »** : la case de la colonne **Armé**,
- **au-dessus du bloc** : le bouton « Armé » à côté de « Lancer », enfoncé « ✓ Armé »,
- **panneau de zone** : dans le menu contextuel du fichier de workflow, « Armer » ou « Désarmer ».

L'armement vérifie le workflow comme avant une exécution. En cas d'anomalie, il est refusé, et la barre d'état affiche « Non armé : » avec motif et ligne ; sinon, elle signale « Workflow ‹Nom› armé, prochaine exécution » avec l'échéance. Le désarmement est possible à tout moment, même en cas d'anomalie.

**Définition modifiée :** si, après l'armement, le bloc `workflow` ou l'une des lignes `trigger`, `schedule` et `missed` change, même sans enregistrement dans l'éditeur, le workflow compte comme « non armé : définition modifiée » et ne s'exécute plus selon la planification tant qu'il n'est pas armé de nouveau. Modifier le nom et la description reste sans effet. Ainsi, un contenu modifié que personne n'a approuvé ne s'exécute jamais sans personne présente.

### L'élément « Workflows » de la barre d'état

Tant qu'au moins un workflow de la zone est armé, l'élément **Workflows** se trouve dans la partie droite de la barre d'état. Il montre la dernière exécution planifiée avec le signe du résultat, le nom et l'heure, par exemple « ✓ Note du jour 08:00 » ; une exécution d'un jour antérieur porte en plus le jour et le mois. Les signes sont `✓` pour réussi, `✗` pour interrompu, `■` pour arrêté et `–` pour une saisie annulée ; une interruption apparaît dans la couleur du message d'erreur. Sans exécution planifiée jusqu'ici, il affiche « Workflows ». L'infobulle indique date, heure et résultat, un clic ouvre la page **Exécutions des workflows**. Dans une barre d'état étroite, l'élément se replie avec les autres éléments.

## Dossier de workflows et menu

Comme pour les modèles, il existe un **dossier de workflows**, défini à deux niveaux sous « Fichier → Paramètres… » :

- **Pour toute l'application** dans la section **Extensions (internes) → Workflows**.
- **Par zone** dans la section **Zone actuelle → Workflows** avec l'interrupteur « Utiliser la configuration de zone » et le bouton « Parcourir… ». Le dossier est enregistré relativement à la racine de la zone dans le fichier de zone et **remplace** entièrement celui de l'application.

Le dossier de workflows de l'application voyage avec le fichier de configuration, comme type de données « Dossier de workflows » de la page [Exporter et importer les paramètres](setup-exchange.md), et agit dès l'import. Le dossier par zone figure dans le fichier de zone et voyage avec la zone.

Le sous-menu **Fichier → Workflows** se trouve juste après le sous-menu **Zone**. Il montre les fichiers du dossier qui portent la marque, par ordre alphabétique de nom à chaque niveau ; les sous-dossiers apparaissent comme sous-menus, les fichiers sans marque sont omis. Après les siens suivent, chacun derrière un séparateur, les workflows des zones liées avec consentement (section ci-dessous). Après un autre séparateur suivent :

- **Afficher les exécutions des workflows** — ouvre la page **Exécutions des workflows**.
- **Nouveau workflow…** — demande le nom, crée dans le dossier de workflows un fichier avec en-tête, ligne de description et un bloc `workflow` vide de deux lignes de commentaire, et l'ouvre. Sans dossier défini, il demande d'abord le dossier et le retient, dans les paramètres de la zone si une zone est ouverte. Il n'écrase jamais un fichier existant. L'entrée figure aussi dans la palette de commandes.
- **Définir le dossier de workflows…** — ouvre les paramètres à la section **Workflows**.

Sans dossier défini, le sous-menu affiche « Aucun dossier de workflows défini », pour un dossier vide « Aucun workflow dans le dossier de workflows », pour un dossier inaccessible « Dossier de workflows introuvable ». Le sous-menu et les commandes suivent chaque modification dans le dossier.

## Workflows des zones liées

Comme les modèles, les workflows d'une [zone liée](linking.md) peuvent être proposés à côté des siens. Pour cela, chaque lien sous **Paramètres → Zone actuelle → Liens entre zones** porte la case **Workflows** à côté de « Modèles » ; elle est d'abord désactivée et indépendante de celle des modèles.

- **Où ils apparaissent :** les workflows du dossier de workflows que la zone liée a défini pour elle-même apparaissent dans le sous-menu **Fichier → Workflows** après les siens, dans la palette de commandes et sur la page **Exécutions des workflows**, chacun sous la forme « Nom (@préfixe) » avec le préfixe du lien. Les nouveaux workflows de la source apparaissent sans redémarrage.
- **Où ils agissent :** un tel workflow s'exécute dans **sa propre** zone. Tous les chemins valent dans la racine de sa propre zone ; de la zone liée, seul le fichier de workflow lui-même est lu, y compris ses sections pour `from-section`. Un appel `workflow "Nom"` cherche dans sa propre zone.
- **Seulement à la main :** un workflow d'une zone liée ne peut pas être armé. L'application n'écrit aucun état d'exécution dans la zone étrangère ; la page affiche à sa place « de la zone ‹préfixe› », et la barre d'état signale une exécution réussie par « Workflow ‹Nom› de la zone ‹préfixe› exécuté avec succès ».
- **Sans accès :** si la zone liée, son fichier de zone ou son dossier de workflows est illisible, ses workflows sont omis sans message. Avec les liens entre zones désactivés, aucun workflow étranger n'apparaît.

## État d'exécution et la page « Exécutions des workflows »

Après chaque exécution, l'application consigne dans le **fichier compagnon** du workflow (`.mdd`, section `workflow`) l'instant, le résultat, le cas échéant la ligne interrompue, le nombre d'exécutions, l'origine de l'exécution et le journal de la dernière exécution, pour un workflow planifié en outre l'état armé et l'échéance suivante ; le texte du fichier de workflow reste intact. L'état d'exécution suit le fichier quand il est renommé ou déplacé, pas quand il est copié.

La page **Exécutions des workflows** s'ouvre par « Affichage → Afficher les exécutions des workflows », par « Fichier → Workflows → Afficher les exécutions des workflows », par la palette de commandes et par un clic sur l'élément **Workflows** de la barre d'état. Elle liste **tous les workflows de la zone**, y compris ceux hors du dossier de workflows, puis les workflows des zones liées avec consentement, avec ces colonnes et un bouton « Lancer » par ligne :

| Colonne | Contenu |
| --- | --- |
| **Workflow**, **Emplacement** | nom avec la description en infobulle, dossier du fichier |
| **Armé** | case pour armer, seulement avec `trigger: schedule` ; en cas de définition modifiée, en plus « non armé : définition modifiée » |
| **Prochaine exécution** | échéance de la prochaine exécution planifiée, tant que le workflow est armé |
| **Dernière exécution** | instant de la dernière exécution, avec « (rattrapé) » pour une exécution rattrapée, en dessous le cas échéant « expiré : » avec l'échéance ; en plus le bouton « Journal (N) » |
| **Résultat** | résultat de la dernière exécution, tableau ci-dessous |
| **Exécutions** | nombre d'exécutions |

Un workflow qui n'a jamais tourné figure avec « jamais exécuté ».

| Résultat | Signification |
| --- | --- |
| réussi | toutes les étapes se sont exécutées |
| interrompu à la ligne N : motif | une anomalie ou un échec a mis fin à l'exécution |
| arrêté à la ligne N | la commande `stop` ou un « Non » à `confirm` a mis fin à l'exécution |
| Saisie annulée, aucune étape exécutée | un dialogue ou la confirmation des cibles à supprimer a été annulé |

Après une exécution dans cette fenêtre, la page montre le même motif que la barre d'état. Le fichier compagnon ne retient que la ligne et le type de motif ; après un redémarrage et pour une exécution depuis une autre fenêtre, des détails comme un nom de fichier apparaissent donc sous la forme « … ». La page se met à jour après chaque exécution et chaque armement ; le bouton « Actualiser » la relit.

### Ce qu'une exécution a fait

Le bouton « Journal (N) » déplie sous la ligne le **journal** de la dernière exécution : chaque fichier et chaque dossier qu'elle a créé, modifié, déplacé, copié ou supprimé, sous la forme « Ligne N : commande – chemin », le chemin relatif à la racine de la zone. Si l'exécution n'a rien touché, il affiche « Aucun fichier touché » ; avec un très grand nombre de fichiers touchés, le journal est tronqué et le signale.

Il n'y a pas d'annulation d'une exécution entière. On annule de façon ciblée, avec les moyens qui existent de toute façon : les modifications de contenu par l'[historique du document](history.md) du fichier touché, les éléments supprimés depuis la corbeille, les éléments créés, déplacés et copiés dans le panneau de zone.

## Aide dans l'éditeur

- **Mise en évidence :** dans les lignes de commande, le mot-clé apparaît en gras, le texte entre guillemets en couleur et les espaces réservés en italique, dans l'éditeur comme dans le rendu.
- **Affichage de vérification :** le mode direct, la vue rendue et la vue partagée affichent au-dessus du bloc le résultat de la vérification : en vert « prêt » ou en rouge « Ligne N : motif », avec « (+N autres) » en cas de plusieurs anomalies. Les messages sur plusieurs blocs et sur un déclencheur pas encore pris en charge y figurent aussi, de même que les anomalies de la planification avec leur ligne dans l'en-tête. L'affichage suit le texte peu après chaque modification et montre la même anomalie que celle signalée au lancement. À l'impression, dans un export et pour un fichier intégré, la ligne d'en-tête n'apparaît pas.
- **Bouton « Armé » :** avec `trigger: schedule`, la ligne d'en-tête porte à côté de « Lancer » le bouton d'armement (section « Planification et armement »).

La mise en évidence et l'affichage ne modifient pas le texte du fichier.

## Limites

- **Seulement dans la zone :** aucune commande ne lit ni n'écrit hors de la racine de la zone dans laquelle le workflow a été lancé, pas même par un espace réservé ; cela vaut aussi pour un workflow d'une zone liée.
- **Pas de réseau, pas de programmes externes.** La suppression se fait uniquement avec `delete`, uniquement lors d'un lancement à la main, après une confirmation et vers la corbeille.
- **Pas d'exécution sans zone ouverte :** un workflow planifié ne s'exécute que tant que l'application et sa zone sont ouvertes ; il rattrape les échéances manquées selon les règles de `missed`.
- **Pas d'annulation d'une exécution :** les étapes exécutées le restent ; le journal montre ce que la dernière exécution a touché, et l'annulation se fait de façon ciblée.
- **Les macros** restent telles quelles et peuvent être appelées comme étape ; une macro est une suite de commandes dans les paramètres, un workflow une procédure sous forme de document. **Les [blocs de script](scripts.md)** restent en lecture seule ; un workflow n'est pas un langage de script général, mais un catalogue fixe de commandes.

## Étapes ultérieures

D'autres étapes sont prévues, sans que leur portée ni leur date soient fixées : un lancement sur des événements de la zone, des conditions et des répétitions, ainsi que des commandes pour la [base de données](database.md). La vérification connaît déjà les mots-clés de ces commandes et les signale comme « n'est disponible qu'à une étape ultérieure », afin qu'un tel fichier ne s'exécute pas en partie.
