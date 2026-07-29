# Pièces jointes

Une pièce jointe est un fichier qui appartient à un document : une capture d'écran, un rapport, un tableur. La coller ou la glisser dans le document évite de l'enregistrer et de la lier à la main. Le fichier est rangé, et la référence correspondante apparaît dans le texte.

## Coller une pièce jointe

Un fichier ou une image du presse-papiers s'insère avec `Ctrl+V`. Le fichier est rangé à l'emplacement configuré, et la référence apparaît au curseur.

Une image devient une référence d'image, tout autre fichier un lien ordinaire :

```markdown
![Compte-rendu_20260729-143022](Compte-rendu/Compte-rendu_20260729-143022.png)
[Rapport](Compte-rendu/Rapport.pdf)
```

`Ctrl+Maj+V` reste un collage simple et ne range rien.

## Glisser une pièce jointe

Un fichier peut aussi être glissé depuis le gestionnaire de fichiers. L'endroit du dépôt détermine le résultat :

| Lieu du dépôt | Résultat |
|---|---|
| Zone d'édition | Pièce jointe, référence à la position du pointeur |
| Aperçu rendu | Pièce jointe, référence à la fin du document |
| Barre d'onglets, panneau latéral, fenêtre vide | Le fichier est ouvert |

Pendant le glissement, la surimpression indique lequel des deux résultats s'applique. Un fichier Markdown peut ainsi être joint délibérément au lieu d'être ouvert.

Plusieurs fichiers glissés en même temps produisent plusieurs références. Coller ou glisser compte pour **une** étape : `Ctrl+Z` retire la référence. Le fichier rangé reste en place et se supprime au besoin depuis le gestionnaire de fichiers.

## Où le fichier est rangé

L'emplacement se règle dans Réglages → Pièces jointes et peut en outre être défini par zone (Réglages → Zone actuelle → Pièces jointes).

| Emplacement | Où va le fichier |
|---|---|
| Dossier au nom du document | dans un sous-dossier portant le nom du document (par défaut) |
| Sous-dossier fixe | dans un sous-dossier au nom configuré |
| À côté du document | dans le même dossier que le document |
| Dossier central de la zone | dans un dossier directement à la racine de la zone |

Le dossier central n'est proposé qu'avec une zone ouverte, faute de point de référence sinon. Le nom du dossier vaut pour les deux formes qui en ont besoin ; c'est un nom simple, sans segments de chemin.

Un nom de fichier déjà présent n'est jamais écrasé. Le nouveau fichier reçoit un compteur, par exemple `Image-2.png` à côté de `Image.png`. Les pièces jointes sans nom propre, comme une capture d'écran du presse-papiers, portent le nom du document et le moment.

Un document jamais enregistré n'offre aucun emplacement. Dans ce cas, une indication apparaît dans la barre d'état et rien n'est rangé.

## Ouvrir une pièce jointe

Une référence vers une pièce jointe l'ouvre dans le programme que le système d'exploitation lui associe. Pour une image intégrée, le geste dépend de la vue :

| Vue | Geste |
|---|---|
| Lecture et aperçu rendu | simple clic |
| Édition et vue directe | double clic |

Dans l'éditeur, le simple clic reste réservé au placement du curseur ; écrire à côté d'une image ne doit pas lancer un autre programme.

Seules les cibles situées dans la zone sont ouvertes, ou, sans zone, dans le dossier du document. Pour les fichiers susceptibles d'exécuter du code à l'ouverture, une confirmation apparaît d'abord, avec le nom et le chemin complet.

## Pièces jointes et limites de zone

Avec une zone ouverte, les images de toute la zone sont visibles, même au-dessus du dossier du document. C'est ce qui rend le dossier central utilisable. Sans zone, la limite reste le dossier du document et ses sous-dossiers ; voir aussi la page [Images](images.md).
