# Notes du document

Chaque document peut porter **une** note, distincte du contenu du document. Elle rassemble le savoir de travail et les méta-informations sur le document (points ouverts, contexte, rappels) qui n'ont pas leur place dans le texte lui-même. La note s'écrit dans un panneau de barre latérale dédié et se stocke dans le **fichier compagnon** du document, le même fichier `.mdd` à côté du document qui porte aussi l'historique.

## Le panneau Notes

Le panneau « Notes » se commute comme tout panneau de barre latérale : via le menu Affichage → Panneaux → Notes, l'icône de bloc-notes dans la barre d'état, ou un raccourci que vous affectez vous-même (aucun n'est défini au départ ; l'affectation se fait dans les paramètres). Le commutateur agit sur la colonne active ; côté, ordre et groupes d'onglets suivent les règles de la [Barre latérale](sidebar.md).

Une note appartient toujours au document actif. Un document encore **sans nom** (jamais enregistré) n'a pas d'emplacement pour le fichier compagnon ; le panneau affiche alors une indication au lieu d'un champ de saisie ; après le premier enregistrement, la note est disponible.

## Écrire et aperçu

Le champ de saisie accepte le Markdown. Un commutateur dans l'en-tête du panneau bascule entre **édition** et **aperçu rendu** du texte de la note. L'aperçu est actif au départ ; qu'un panneau s'ouvre en édition ou en aperçu se règle par « Afficher l'aperçu des notes par défaut » (Paramètres → Apparence). Le commutateur vaut par colonne et pour la session en cours.

Voici à quoi une note peut ressembler :

```markdown
- [ ] Revenir sur le chapitre trois
- [x] Sources vérifiées

Contexte : **brouillon**, pas encore validé.
```

- [ ] Revenir sur le chapitre trois
- [x] Sources vérifiées

Contexte : **brouillon**, pas encore validé.

## Mettre en forme comme dans l'éditeur

Le champ d'édition offre les mêmes aides de mise en forme que l'éditeur principal : le **menu contextuel du clic droit** avec les sections Format, Paragraphe, Insérer et Presse-papiers, ainsi que les raccourcis correspondants (par exemple `Ctrl+B` pour le gras, `Ctrl+I` pour l'italique, ou l'insertion d'un horodatage). Le [Menu contextuel de l'éditeur](context-menu.md) décrit ces fonctions en détail ; elles agissent dans le champ de note comme dans le document.

## Enregistrement automatique

La note est enregistrée **automatiquement**, sans bouton d'enregistrement : peu après la frappe, ainsi qu'en quittant le champ, en changeant de document et en fermant la fenêtre. La note ne fait pas partie du contenu du document ; elle ne marque donc **pas** l'onglet du document comme modifié, et l'enregistrement du document en est indépendant.

## Emplacement et distinction avec l'historique

La note se trouve dans le fichier compagnon `.mdd`, dans une section propre à côté de l'[Historique du document](history.md). Les deux voyagent avec le fichier compagnon lorsque le document et le `.mdd` sont copiés ou déplacés ensemble ; le **renommage au sein de l'application** emmène le fichier compagnon, et donc la note, automatiquement.

Contrairement à l'historique, la note n'a **ni révisions ni restauration** : seul l'état actuel compte, un texte antérieur n'est pas conservé. Si le fichier compagnon est endommagé, la note est suspendue et le panneau le signale au lieu d'écraser un état incertain.

## Plusieurs fenêtres

Si le même document est ouvert dans plusieurs fenêtres, une note enregistrée ailleurs est reprise ici tant que le champ est inchangé. Si une modification externe rencontre votre **propre état non encore enregistré**, le panneau signale que la note a été modifiée dans une autre fenêtre, et votre texte est conservé afin que rien ne soit écrasé à votre insu.
