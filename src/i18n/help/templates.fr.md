# Modèles

Les modèles sont des fichiers Markdown ordinaires dans un **dossier de modèles** configurable. Lors de l'application, l'application évalue des **espaces réservés** choisis : date et heure avec décalage et format, titre et dossier du fichier cible, dialogues de saisie et de sélection, presse-papiers et une position cible du curseur. Les modèles créent de nouveaux fichiers avec une structure prête, ou insèrent des blocs récurrents à la position du curseur ; les **règles de dossier** remplissent automatiquement les nouveaux fichiers.

La fonctionnalité est commutable comme extension « Modèles » (Paramètres → Extensions) ; désactivée, les commandes, la section des paramètres et les règles de dossier disparaissent.

## Dossier de modèles

Le dossier de modèles se configure dans les paramètres (Paramètres → Modèles) :

- **Globalement**, le dossier de l'application vaut pour toutes les fenêtres.
- **Par zone**, une configuration dédiée peut être définie (« Utiliser la configuration de zone » dans l'entrée « Modèles » du groupe de navigation « Zone actuelle », visible uniquement lorsqu'une zone est ouverte) ; elle est enregistrée dans le fichier de zone et **remplace complètement la configuration globale** (dossier et règles, pas de résolution mixte). Les dossiers sont relatifs à la racine de la zone ; les chemins absolus restent autorisés.

Chaque fichier Markdown du dossier (sous-dossiers compris) est un modèle. Les sous-dossiers apparaissent comme groupes dans le popup de sélection. Les changements de configuration prennent effet immédiatement, sans redémarrage.

## Appliquer des modèles

Deux chemins mènent au modèle :

- **Nouveau fichier à partir d'un modèle** (menu Fichier) : choisir le modèle dans le popup filtrable, attribuer un nom de fichier (`/` crée une sous-page), répondre à la chaîne de dialogues. Le fichier naît avec le contenu rempli dans le dossier du fichier actif (sans fichier actif à la racine de la zone ; sans l'un ni l'autre, un dialogue de dossier demande la cible), s'ouvre comme onglet, et le curseur saute à la première cible `{{cursor}}`.
- **Insérer un modèle** (menu contextuel de l'éditeur → Insérer) : le résultat rempli est inséré à la position du curseur, en une seule étape d'édition (une annulation supprime tout).

Plusieurs espaces réservés de saisie et de sélection apparaissent **l'un après l'autre** dans l'ordre de leur première occurrence ; les questions identiques ne sont posées qu'une fois. L'annulation d'un dialogue interrompt toute l'application : aucun fichier ni texte inséré n'est créé.

## Référence des espaces réservés

Les espaces réservés s'écrivent entre doubles accolades. `\{{` écrit un `{{` littéral dans le modèle.

| Espace réservé | Effet |
| --- | --- |
| `{{date}}` / `{{time}}` | date ou heure de l'application (`2026-07-09` ou `14:30`) |
| `{{date:+7d}}` | date avec décalage ; unités du langage de requête (`s`, `min`, `h`, `d`, `w`, `mo`, `y`, aussi combinées : `1d 12h`), signe facultatif |
| `{{date::dd.MM.yyyy}}` | date avec format propre ; jetons `yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`, `ww`, `kkkk`, `q` (comme la fonction de requête `dateformat`) ; décalage et format combinables : `{{date:+7d:dd.MM.yyyy}}` |
| `{{time:-30min:HH:mm:ss}}` | l'heure accepte aussi décalage et format |
| `{{title}}` | titre du fichier cible (pour les sous-pages, la forme logique avec `/`) |
| `{{folder}}` | dossier du fichier cible (relatif à la racine dans une zone) |
| `{{prompt:Question}}` | dialogue de saisie ; valeur par défaut facultative : `{{prompt:Question:Défaut}}` |
| `{{select:Question:a,b,c}}` | dialogue de sélection avec les options `a`, `b`, `c` |
| `{{clipboard}}` | texte actuel du presse-papiers |
| `{{cursor}}` | position cible du curseur après l'application ; plusieurs cibles numérotées avec `{{cursor:2}}`, la plus basse est la cible du saut |

Exemple de modèle :

````markdown
# {{title}}

Date : {{date}}, prochain rendez-vous : {{date:+7d:dd.MM.yyyy}}
Sujet : {{prompt:Sujet}}
Priorité : {{select:Priorité:Haute,Moyenne,Basse}}

## Notes

{{cursor}}
````

Les espaces réservés inconnus ou les paramètres défectueux interrompent l'application avec un message dans la barre d'état ; aucun fichier à moitié rempli n'est créé.

## Règles de dossier

Les règles de dossier remplissent automatiquement les nouveaux fichiers : chaque règle associe un **dossier cible** à un **modèle** (Paramètres → Modèles). Lors de la création d'un fichier via l'application (panneau de zone, nouvelle sous-page), le modèle s'exécute avec l'évaluation complète des espaces réservés, dialogues compris.

- Le **dossier correspondant le plus profond gagne** ; les sous-dossiers comptent comme correspondance. Une entrée de dossier vide est la règle racine.
- Le **dossier de modèles lui-même est exclu** — les nouveaux modèles restent vides.
- Si l'on choisit explicitement « Nouveau fichier à partir d'un modèle », le modèle choisi a la priorité ; la règle ne s'applique pas en plus.
- L'annulation d'un dialogue crée le fichier **vide** (la création elle-même était voulue) et affiche un indice.
- Les fichiers créés en dehors de l'application (par exemple dans l'explorateur de fichiers) ne passent pas par les règles.
