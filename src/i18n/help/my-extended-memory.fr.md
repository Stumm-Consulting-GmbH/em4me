# My Extended Memory

Qui travaille longtemps avec cette application accumule des conteneurs : des [zones](apps-windows.md) pour les projets, des [livres](books.md) pour les textes longs, des bibliothèques pour des collections entières, ainsi que les [espaces de travail](apps-windows.md) que vous avez configurés. Ils sont dispersés sur le disque, sur des clés et sur des lecteurs réseau, et aucune vue de l'application ne les montre ensemble — chaque vue concerne ce qui est ouvert à l'instant.

**My Extended Memory est cette vue commune.** La page s'ouvre par « Affichage → My Extended Memory » ou depuis la palette de commandes, dans un onglet dédié ; elle n'est pas modifiable. En quatre sections — espaces de travail, zones, livres, bibliothèques — chaque conteneur occupe une ligne avec son nom, son emplacement et quelques chiffres clés.

## Ce que la page montre — et ce qu'elle ne fait pas

**La page montre ce que vous avez ajouté vous-même.** Elle n'explore aucun disque, elle ne trouve rien d'elle-même et elle ne prétend à aucune exhaustivité. Une zone que vous n'avez jamais ajoutée n'apparaît pas ici, même si vous y avez travaillé hier.

C'est voulu et ce n'est pas une lacune. Une recherche sur tous les lecteurs connectés durerait longtemps, trouverait au passage des dossiers qui ne regardent personne et dépendrait de la question de savoir quels lecteurs sont connectés à cet instant. La liste que vous tenez vous-même est en revanche courte, fiable et c'est votre propre ordre. La remarque en haut de la page le dit en permanence, même quand la liste est bien remplie.

## Ajouter un conteneur

« Ajouter un conteneur… » déplie un bloc de propositions.

**Sont proposés les conteneurs ouverts en dernier** — zones, livres et bibliothèques issus des listes des derniers éléments ouverts — **ainsi que les espaces de travail configurés**, groupés par type. Ce qui figure déjà dans la liste n'apparaît plus parmi les propositions. « Ajouter » à côté d'une proposition l'ajoute.

**« Choisir un dossier… » est la voie complète** et reste toujours disponible, même lorsqu'il n'y a rien à proposer. La fenêtre de choix de dossier habituelle demande le dossier du conteneur ; le type, c'est l'application qui le détermine, dans l'ordre **bibliothèque, livre, zone** : si le dossier porte le fichier d'accompagnement d'une bibliothèque, c'est une bibliothèque ; s'il porte celui d'un livre, c'est un livre ; sinon, c'est une zone.

Trois cas conduisent à un message plutôt qu'à un ajout :

- Le dossier est **momentanément inaccessible** — une clé retirée, un lecteur réseau non connecté. N'est ajouté que ce qui est lisible au moment de l'ajout ; sinon, le type ne peut pas être déterminé.
- Le chemin choisi désigne un **fichier** et non un dossier.
- Le conteneur **figure déjà** dans la liste. Une seconde entrée pour le même dossier ne se crée pas.

## Supprimer une entrée

« Supprimer » retire la ligne de la liste — **et rien d'autre**. Le dossier, ses fichiers et ses fichiers d'accompagnement restent intacts ; un espace de travail reste lui aussi configuré. Ce qui est supprimé, c'est l'entrée, pas le conteneur. Vous pouvez l'ajouter de nouveau à tout moment.

## Les chiffres clés

Chaque ligne porte un horodatage et une courte sélection : pour une zone le nombre de fichiers Markdown, pour un livre le nombre de chapitres, pour une bibliothèque le nombre de livres, et dans chaque cas le stockage occupé.

**Les chiffres ne sont pas tenus à jour en continu.** Ils sont relevés au moment où le conteneur est ajouté, et ensuite uniquement lorsque vous le demandez : « Relever à nouveau » lit le conteneur une fois de plus et fixe un nouvel horodatage. C'est pourquoi l'horodatage figure sur chaque ligne — il dit à quel moment les chiffres se rapportent. Qui a travaillé une semaine dans une zone voit ici d'abord les chiffres de l'avant-dernière semaine ; un clic les ramène à aujourd'hui.

Un **espace de travail** n'a ni chiffres clés ni bouton de relevé : ce n'est pas un dossier mais un assemblage. Ce qu'il assemble figure dans sa ligne et dans la vue de détail : les conteneurs auxquels il est lié, le nombre de ses fenêtres et le nombre de **documents ouverts** dans celles-ci.

**Ce qui est compté, ce sont les documents ouverts, non les fichiers d'un dossier.** Le chiffre dit combien de documents Markdown l'espace de travail a ouverts dans ses fenêtres ; le comptage se fait par fenêtre. Les onglets sans titre, les pages du manuel et du système ainsi que les autres types de fichiers ne comptent pas. Les deux chiffres proviennent de l'enregistrement de l'espace de travail et figurent donc pour un espace fermé tout comme pour un espace ouvert ; un zéro y est un zéro compté comme tout autre.

### Un conteneur momentanément inaccessible

Il **reste dans la liste**, avec la mention « inaccessible » et avec les derniers chiffres connus accompagnés de leur ancien horodatage. Une clé rangée dans un tiroir n'est pas une raison de perdre l'entrée — les chiffres d'alors restent l'information dont vous disposez. « Ouvrir » et « Relever à nouveau » sont sans effet sur une telle ligne et donc grisés ; « Détails » et « Supprimer » fonctionnent toujours.

### Une zone qui n'est pas ouverte

Pour elle, trois chiffres clés restent vides : **les étiquettes, les tâches et les fichiers sans lien entrant**. Ils ne proviennent pas du comptage des fichiers mais de l'index que l'application construit pour une zone ouverte — et cet index n'existe que tant que la zone est ouverte. La ligne le dit avec la mention « sans les chiffres de l'index ; ouvrez la zone et relancez le relevé ».

Aucun index n'est construit **spécialement** pour cette page. Cela coûterait un parcours complet pour chaque zone ajoutée et transformerait une vue d'ensemble en calcul. Ouvrez la zone, relancez ensuite le relevé, et tous les chiffres sont là.

## La vue de détail

« Détails » déplie sous la ligne un tableau montrant ce que le conteneur concerné a à offrir :

| Type | Chiffres clés |
|---|---|
| Zone | fichiers Markdown, autres fichiers, dossiers, stockage occupé, étiquettes, tâches, fichiers sans lien entrant |
| Livre | chapitres, fichiers Markdown, stockage occupé, bibliothèque de rattachement |
| Bibliothèque | livres, dont introuvables, fichiers Markdown, stockage occupé |
| Espace de travail | zone, livre, bibliothèque, fenêtres, documents ouverts, dernière utilisation |

**Deux sortes de vide, deux signes.** « non disponible » signifie : personne n'a relevé ce chiffre — les étiquettes d'une zone non ouverte, par exemple. Le tiret signifie : cette chose n'existe pas ici — le livre d'un espace de travail qui n'en porte aucun, par exemple. **Un zéro ne remplace jamais ni l'un ni l'autre** ; c'est toujours un zéro compté, et une zone sans sous-dossier l'affiche à juste titre.

Pour un **livre**, la ligne « Bibliothèque » ne nomme qu'une bibliothèque elle-même ajoutée. Si le livre se trouve dans une bibliothèque absente d'ici, le tableau dit qu'il n'est assigné à aucune bibliothèque de la liste — plutôt que d'affirmer un rattachement que cette page ne connaît pas.

### Ouvrir, et le chemin vers les statistiques de la zone

**« Ouvrir » sur la ligne** ouvre le conteneur par la voie habituelle : zone, livre et bibliothèque selon les règles usuelles, l'espace de travail comme un basculement vers lui. La vue de détail n'a pas de second bouton d'ouverture ; celui de la ligne se trouve juste au-dessus.

**Pour une zone s'ajoute « Ouvrir les statistiques de la zone ».** Les [statistiques de la zone](apps-windows.md) détaillées concernent toujours la zone de **cette** fenêtre — la zone doit donc d'abord être celle qui est ouverte. Si elle l'est déjà, les statistiques s'ouvrent immédiatement. Sinon la zone est ouverte, et l'endroit où elle aboutit dépend de ce qui tourne : si cette fenêtre la reprend, les statistiques suivent ici. Si elle arrive dans une autre fenêtre — parce qu'une application de zone y tourne déjà ou parce qu'une nouvelle fenêtre apparaît —, un message le dit exactement : les statistiques de la zone s'y trouvent dans le menu Affichage. Un saut ici montrerait sinon les chiffres d'une autre zone.

## Exporter et importer sa propre installation

En haut de la page figurent « Exporter les paramètres… » et « Importer les paramètres… ». Ils mènent à la même voie que « Fichier → Paramètres → Exporter… » et « Importer… » ; tout le reste — choix des types de données, aperçu, rapport — se trouve sur la page [Exporter et importer les paramètres](setup-exchange.md).

L'accès est ici parce que les deux servent la même question : qu'ai-je installé pour moi, et comment l'emporter ? Si l'extension « Export et import des paramètres » est désactivée, le bloc disparaît.

**La liste des conteneurs ajoutés, elle, ne part jamais.** Elle se compose de chemins absolus de cette machine, qui ne mènent nulle part sur une autre — comme les espaces de travail configurés et les listes des derniers éléments ouverts, elle fait partie de ce qui reste lié à la machine.

## Désactiver

La fonction est désactivable en tant qu'[extension](extensions.md) « My Extended Memory ». À l'état désactivé, l'entrée de menu et la commande dans la palette disparaissent ; un onglet déjà ouvert reste en place jusqu'à ce que vous le fermiez.

**La liste des conteneurs ajoutés est conservée.** La désactivation retire l'accès, pas les données : après réactivation, la liste est de nouveau là, inchangée, avec toutes ses entrées et leurs chiffres relevés en dernier.
