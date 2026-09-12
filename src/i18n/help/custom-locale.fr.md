# Votre propre langue d'interface

L'interface est disponible dans cinq langues fournies. Qui en a besoin d'une sixième — une langue régionale, une langue qu'aucun programme ne sert, ou simplement le vocabulaire de son propre domaine — la traduit lui-même. Le chemin compte trois étapes : **télécharger le modèle**, **le traduire dans son propre éditeur**, **le charger**. La langue propre figure ensuite dans la sélection de la langue de la barre d'état, à côté des langues fournies. Tous les chemins se trouvent dans le menu Fichier → Votre propre langue : « Télécharger le modèle… », « Charger… », « Supprimer… » et « Mettre à jour… ».

Les chemins de commande font partie de l'extension « Votre propre langue d'interface » ([Extensions](extensions.md)) ; à l'état désactivé, le sous-menu disparaît. Une langue déjà chargée n'en est pas affectée : elle continue d'être lue et reste sélectionnée. L'état désactivé retire un chemin, jamais une langue.

## Télécharger le modèle

« Fichier → Votre propre langue → Télécharger le modèle… » écrit l'ensemble complet des textes de l'application dans un fichier JSON ; la boîte de dialogue d'enregistrement habituelle demande l'emplacement et le nom. Le modèle porte **toujours l'anglais**, quelle que soit la langue réglée : l'anglais est la version de référence à laquelle une traduction sera comparée par la suite.

Le fichier est un répertoire plat de clés et de textes. Tout en haut se trouvent deux entrées vides par lesquelles la langue se nomme ; en dessous suit, entrée par entrée, le fonds anglais :

```json
{
  "@@locale": "",
  "@@name": "",
  "toolbar.open": "Open",
  "view.source": "Source",
  "view.split": "Split",
  …
}
```

À gauche la clé, à droite le texte. **Seule la partie droite se traduit.** Les clés restent inchangées — c'est par elles que l'application retrouve ses textes.

Le nom du fichier, en revanche, n'a aucune importance. Il peut changer lors d'une copie, d'un second téléchargement ou d'un renommage ; la langue qu'il porte est écrite **dans** le fichier et non dans son nom.

## Traduire dans son propre éditeur

Le fichier est du JSON ordinaire et se modifie dans tout éditeur qui enregistre le texte en UTF-8. Quatre points méritent attention.

### Nommer la langue

Les deux entrées du haut sont vides afin d'être reconnaissables comme une invitation :

- `@@locale` est le **code** de la langue : deux ou trois lettres, au choix avec un complément d'écriture ou de région, donc par exemple `nds` ou `nds-DE`. Ce qui est vérifié, c'est la forme et non l'existence — qui traduit une langue qu'aucune norme ne recense doit pouvoir la nommer malgré tout. Le code d'une langue fournie n'est pas admis : une langue propre vient **à côté** des langues fournies, elle n'en remplace aucune.
- `@@name` est le **nom d'affichage**, tel qu'il doit apparaître dans la sélection de la langue, 40 caractères au maximum. L'usage veut que la langue soit nommée dans sa propre langue.

### Espaces réservés

Certains textes portent des espaces réservés entre accolades, par exemple `{name}` ou `{n}`. L'application y insère une valeur à l'exécution — un nom de fichier, un nombre. Les espaces réservés sont repris **tels quels** : même orthographe, même ensemble. Leur **place dans la phrase** est en revanche libre, car aucune construction de phrase ne ressemble à une autre.

### Balisage

Une partie des textes porte un balisage Markdown parce qu'elle apparaît dans un tableau du manuel : un mot en caractères de code, plus rarement un lien ou une mise en évidence. La règle est la suivante : un texte traduit peut porter exactement les **types** de balisage que l'original porte à **la même** entrée — pas le même nombre. Là où l'original a un passage en code, il peut y en avoir deux ; là où il n'a pas de lien, aucun ne s'ajoute. Et un lien vise une cible ordinaire : `http`, `https`, `mailto` ou une cible à l'intérieur du manuel.

### L'incomplet est permis

Une traduction n'a pas besoin d'être achevée pour agir. Il suffit que le fichier porte au moins une entrée connue ; tout le reste peut rester en anglais et être complété plus tard. Ce qui manque apparaît en anglais — voir la section « Ce qui n'est pas encore traduit ».

## Charger et vérifier

« Fichier → Votre propre langue → Charger… » demande le fichier. La vérification a lieu **avant** que quoi que ce soit ne soit déposé : taille et structure, puis chaque entrée quant à un texte comme valeur, aux espaces réservés inchangés, au balisage admis et aux cibles de lien admises, ainsi que les deux champs de nommage.

Deux garanties valent ici :

- **Un rejet nomme l'entrée** à laquelle il tient, avec son motif — par exemple que les espaces réservés d'une clé donnée diffèrent de ceux de l'original. Le point est ainsi repérable dans l'éditeur, au lieu de devoir parcourir tout le fichier.
- **Rien n'est repris à moitié.** Si la vérification trouve une infraction, le fonds existant reste intact ; aucune langue ne naît qui serait pour moitié tirée du fichier et pour moitié de rien.

Si la vérification passe, le message nomme la langue et le nombre d'entrées reprises. Les clés que l'application ne connaît pas — restes d'un modèle plus ancien — sont ignorées et comptées dans le même message.

Si une langue propre portant le même code est déjà chargée, **l'application demande d'abord** ; annuler est la valeur par défaut. Le remplacement écrase la version chargée auparavant ; le fichier dont elle provient reste intact.

## Choisir sa propre langue

Elle se choisit comme toute autre : par la sélection de la langue dans la barre d'état ([Vues et affichage](views-display.md)). Les langues propres y figurent dans un groupe à part, « Vos propres langues », sous les langues fournies, avec le nom tiré de `@@name`.

Le choix agit immédiatement et partout : dans la fenêtre, dans les menus et dans les boîtes de dialogue du système d'exploitation, et cela dans toutes les fenêtres ouvertes. Il persiste au-delà d'un redémarrage — la langue propre est un réglage comme un autre.

Si le fichier de langue venait à être introuvable, le réglage demeure malgré tout : l'interface affiche l'anglais et un message indique quelle langue propre manque. Dès que le fichier est de retour, la langue agit de nouveau sans autre intervention.

## Ce qui n'est pas encore traduit

Si une entrée manque dans le fichier de langue propre, l'application affiche le texte **anglais** — entrée par entrée, et non page par page ni boîte de dialogue par boîte de dialogue. C'est voulu et ce n'est pas un défaut : une interface à moitié traduite est utilisable dès le départ, et le travail peut se faire par étapes.

Qui a donc réglé sa propre langue et voit des libellés anglais à côté voit les **lacunes de sa traduction** et non une erreur du programme. Elles se comblent dès que les entrées concernées figurent dans le fichier et que celui-ci est chargé de nouveau.

## Après une nouvelle version du programme

Une application qui grandit apporte des textes qu'un fichier traduit plus tôt ne peut pas connaître. La langue propre vieillit de ce fait, et l'application le dit : un message dans la barre d'état nomme la langue et le **nombre d'entrées manquantes**. Il apparaît une fois par état — le même état ne se signale pas à nouveau, alors qu'un nombre modifié ou une autre version du programme se signale.

« Fichier → Votre propre langue → Mettre à jour… » en fournit le moyen. Ce chemin enregistre le fichier de langue propre à l'état de la version en cours d'exécution : le nommage et les traductions propres subsistent, et les entrées manquantes figurent à leur place en anglais. Traduisez ce qui est encore en anglais et chargez le fichier de nouveau. La différence avec le modèle tient à la seule source — ici la langue propre au lieu de l'anglais.

Une boîte de dialogue propose les langues chargées pour une sélection, même s'il n'en existe qu'une seule ; cela est indépendant de celle qui est réglée. Le message indique combien d'entrées du fichier enregistré sont encore en anglais. Si aucune langue propre n'est chargée, un message le dit au lieu d'une boîte de dialogue vide.

## Supprimer

« Fichier → Votre propre langue → Supprimer… » propose au choix les langues chargées avec leur nom ; annuler est la valeur par défaut. Ce qui est supprimé, c'est le fichier de langue dans le profil de l'utilisateur — le fichier dont il a été chargé reste là où il est.

Si la langue supprimée est celle qui est réglée, l'interface passe à l'anglais. C'est la différence avec le fichier manquant ci-dessus : qui retire lui-même une langue ne doit pas s'en voir rappeler l'absence à chaque démarrage.

## Où se trouve le fichier de langue

Lors du chargement, l'application dépose une copie dans le **profil de l'utilisateur**, dans le dossier `locales`, à côté de ses autres données. Trois garanties en découlent :

- La langue propre **survit à une réinstallation** du programme ; elle se trouve hors du répertoire du programme.
- **Rien n'est écrit dans le répertoire du programme.** Le chemin n'exige donc aucun droit élevé et fonctionne aussi là où le répertoire du programme est protégé en écriture.
- Le fichier déposé est **du même type** que celui qui a été chargé : il porte son nommage plus loin et s'appelle d'après le code de la langue. Qui veut le sauvegarder ou le transmettre le copie.

Le fichier est relu à chaque démarrage et vérifié à nouveau à cette occasion — le dossier est accessible avec un éditeur, et la vérification n'a donc pas lieu au seul chargement.

## Ce que la fonction ne fait pas

Trois limites en font partie, afin que l'attente soit juste :

- **Le manuel reste dans les cinq langues fournies.** Ce qui est traduit, c'est l'interface et non la documentation ; avec une langue propre réglée, les pages du manuel apparaissent en anglais.
- **Il n'y a pas d'aide à la traduction.** L'application ne propose rien, ne traduit rien elle-même et ne vérifie aucune correction linguistique. Elle vérifie la **forme** d'un fichier, non son contenu.
- **Il n'y a pas de lieu d'échange.** Des langues achevées ne s'obtiennent pas auprès d'un point de collecte. Un fichier de langue est un fichier ordinaire et suit le chemin de tout autre : par support de données, en pièce jointe, via un dossier partagé.
