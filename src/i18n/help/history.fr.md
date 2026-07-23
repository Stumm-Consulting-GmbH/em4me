# Historique du document

L'historique du document enregistre les modifications d'un document Markdown sous forme d'**historique de révisions** : qui entretient un document sur la durée voit quelles modifications ont été faites et quand, peut comparer deux états ligne par ligne et rétablir un état antérieur. L'historique vit dans un **fichier compagnon** à côté du document et voyage avec lui lorsque les deux fichiers sont copiés ou déplacés ensemble.

## Fichiers Markdown-Data (.mdd)

Au document `Notes.md` correspond le fichier compagnon `Notes.mdd` (« Markdown-Data ») dans le même dossier. Il est créé au premier enregistrement avec l'historique actif et contient l'historique complet : l'état initial, tous les paquets de modifications et, à intervalles, des états intermédiaires complets comme points d'ancrage. Le format est du texte lisible (JSON), volontairement transparent ; un fichier `.mdd` ne peut pas être ouvert comme document.

Le même fichier compagnon accueille aussi, à côté de l'historique, la [note du document](notes.md), dans une section propre. Contrairement à l'historique, la note n'a toutefois ni révisions ni restauration.

Deux points à connaître :

- Si le document est **renommé ou déplacé** en dehors de l'application, le fichier compagnon doit être emmené à la main, sinon l'historique perd le lien et repart de zéro.
- Dans les dossiers **synchronisés, sauvegardés ou versionnés** par d'autres programmes, les fichiers `.mdd` voyagent aussi. C'est voulu (l'historique appartient au document), mais il faut le savoir : l'historique complet des modifications d'un document voyage avec le fichier compagnon.

## Activer : trois niveaux

Par défaut, l'historique est **désactivé**. Il s'active sur trois niveaux ; le niveau le plus spécifique gagne, les niveaux non définis héritent du niveau plus général suivant :

| Niveau | Emplacement | Effet |
|---|---|---|
| Document | propriété YAML `history` dans le frontmatter | prime sur zone et application |
| Zone | fichier de zone `Area_Settings.mdda` dans le dossier racine de la zone | prime sur le réglage de l'application, vaut pour tous les documents de la zone |
| Application | Paramètres → Comportement → Historique du document | réglage de base pour tout le reste |

Le niveau document se trouve dans le frontmatter :

```yaml
---
history: true
---
```

`history: false` désactive ; une propriété absente hérite. Le plus simple est le menu du clic sur l'icône de la barre d'état (activer, désactiver, utiliser la valeur héritée). Le défaut de zone se règle dans l'entrée de paramètres « Historique du document » du groupe de navigation « Zone actuelle » (visible uniquement lorsqu'une zone est ouverte) ; le fichier de zone n'est créé qu'au premier réglage.

**Désactiver ne supprime rien.** L'enregistrement est seulement mis en pause ; le fichier compagnon est conservé. À la réactivation, l'écart est consigné comme un paquet regroupé, l'historique reste traçable sans rupture.

## Paquets de modifications

Pour que des enregistrements fréquents (par exemple avec l'enregistrement automatique) n'inondent pas l'historique de micro-étapes, l'application regroupe les enregistrements successifs en un **paquet de modifications**. Deux fenêtres de temps le contrôlent (Paramètres → Comportement) :

- **Durée maximale d'un paquet** (par défaut 5 minutes) : ensuite, un nouveau paquet commence, même en travaillant sans pause.
- **Clôture après inactivité** (par défaut 2 minutes) : après une pause sans modification, le prochain enregistrement ouvre un nouveau paquet.

Chaque paquet porte des horodatages et l'origine détectée : **Édition** (enregistré dans l'application) ou **Externe** (le fichier a été modifié par un autre programme ; l'application le détecte à l'ouverture et avant chaque enregistrement et consigne la différence au lieu de laisser l'historique se rompre).

## Barre d'état

L'icône horloge de la barre d'état montre l'état du document actif :

- **Actif** (rempli) : les modifications sont enregistrées.
- **En pause** (contour) : l'historique est effectivement désactivé, un fichier compagnon existe.
- **Inactif** : l'historique est désactivé, aucun fichier compagnon.

L'info-bulle nomme en plus le niveau qui détermine le réglage (fichier, zone ou application). Un clic ouvre le menu avec la vue de l'historique et les réglages du niveau document.

## Vue de l'historique

« Affichage → Historique du document » (ou le menu de la barre d'état) ouvre la liste des révisions du document actif dans un onglet en lecture seule : la révision la plus récente en haut, en dessous tous les paquets avec date, origine et ampleur (+lignes insérées/−lignes supprimées), tout en bas l'état initial. L'onglet se place immédiatement à droite de l'onglet du document. Il n'existe qu'une seule vue d'historique par fenêtre ; l'ouvrir pour un autre document déplace ce même onglet à côté de l'onglet de celui-ci.

- **Afficher** montre l'état complet d'une révision sous la liste.
- **Comparer** confronte deux états sélectionnés ligne par ligne (colonnes « De » et « À », au choix aussi contre l'état actuel) : lignes supprimées en rouge, insérées en vert, avec des marqueurs d'omission pour les passages inchangés.
- **Restaurer** charge l'état choisi dans l'onglet d'édition du document. Le document compte alors comme modifié ; seul l'enregistrement rend la restauration effective et crée ce faisant une **nouvelle** révision. Les révisions antérieures ne sont jamais supprimées ni écrasées.
