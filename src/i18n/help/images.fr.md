# Images

Les images se chargent depuis des fichiers locaux dont le chemin est indiqué par rapport au fichier Markdown, ou depuis des données intégrées au texte. Les images dont l'adresse provient du réseau (`http(s)`) ne sont volontairement pas affichées, car par sécurité l'application ne charge aucun contenu depuis le réseau ; placez plutôt une telle image comme fichier à côté du document. Le manuel n'embarque pas d'images de démonstration ; les exemples montrent donc la syntaxe en bloc de code avec le résultat décrit — dans vos propres fichiers, elles se rendent directement.

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

## Agrandir une image

Un clic sur une image dans la vue « Rendu » — de même dans sa moitié de la vue « Partagé » — l'affiche agrandie sur toute la fenêtre. L'arrière-plan s'assombrit, et l'image apparaît aussi grande que la fenêtre et sa propre résolution le permettent : entière, sans déformation et jamais au-delà de sa propre taille. Une petite image reste donc à sa taille, au centre. Une indication de taille dans le document (`=300x`) ne limite pas l'agrandissement. Cela vaut pour toute image affichée, y compris dans les tableaux, les encadrés et les intégrations, et aussi pour une image qui est elle-même un lien.

Sous l'image figure sa légende — le texte alternatif ou, à défaut, le nom du fichier — et en dessous deux boutons :

- **Ouvrir dans le programme par défaut** ouvre le fichier image dans le programme que le système d'exploitation lui associe, dans les mêmes limites que toute [pièce jointe](attachments.md). L'agrandissement reste ouvert. Une image écrite dans le texte sous forme de données, sans fichier propre, n'affiche pas ce bouton.
- **Fermer** ferme l'agrandissement.

Trois moyens de le fermer, tous avec le même effet : le bouton « Fermer », la touche `Esc` ou un clic sur la zone assombrie à côté de l'image. Au clavier, `Tab` passe d'un bouton à l'autre sans quitter l'agrandissement.

Une image que la vue n'affiche pas — par exemple parce que son fichier manque — n'ouvre pas d'agrandissement. Dans la vue « Direct », un clic n'ouvre pas d'agrandissement ; là, un double clic ouvre l'image dans le programme par défaut.
