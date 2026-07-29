# Images

Les images se chargent depuis des chemins relatifs au fichier Markdown ou depuis des URL `http(s)`. Le manuel n'embarque pas d'images de démonstration ; les exemples montrent donc la syntaxe en bloc de code avec le résultat décrit — dans vos propres fichiers, elles se rendent directement.

## Syntaxe des images

Le texte alternatif entre crochets décrit l'image (important pour l'accessibilité ; un texte alternatif manquant est signalé par le [linter Markdown](tools.md)).

```markdown
![Diagramme d'architecture](images/architecture.png)
```

Les chemins relatifs se résolvent par rapport au dossier du fichier Markdown. Par sécurité, seules les images situées à l'intérieur d'une limite fixe se résolvent : la racine de la zone lorsqu'une zone est ouverte, sinon le dossier du fichier Markdown. Aucun `../` ne mène au-delà. Formats pris en charge : PNG, JPG/JPEG, GIF, WebP, SVG, BMP.

## Tailles d'image

Un suffixe de taille après l'URL fixe la largeur et/ou la hauteur en pixels :

```markdown
![Alt](image.png =300x200)   largeur 300, hauteur 200
![Alt](image.png =300x)      largeur seule, hauteur proportionnelle
![Alt](image.png =x200)      hauteur seule, largeur proportionnelle
```

Les suffixes invalides restent du texte brut et ne sont pas interprétés.

## Figures implicites

Une image **seule dans un paragraphe** devient une figure avec le texte alternatif en légende centrée. Les images dans le texte courant restent inchangées.

```markdown
Paragraphe avant.

![Chiffres trimestriels comparés](chart.png)

Paragraphe après.
```

Résultat : l'image apparaît avec la légende « Chiffres trimestriels comparés » centrée en dessous.

## Intégrer des images par incorporation wiki

Alternativement, `![[image.png]]` intègre une image via la syntaxe wiki, y compris le modificateur de taille `![[image.png|300]]` — détails sur la page [Liens](linking.md).
