# Version portable

EM4me existe en version installée et en version portable. La version portable ne s'installe pas : il s'agit d'un fichier de programme unique que vous démarrez depuis l'emplacement de votre choix, et elle range tout ce qu'elle enregistre dans un dossier à côté d'elle. Elle peut ainsi être emportée sur une clé USB et utilisée sur un autre ordinateur sans rien y configurer. La version portable est livrée pour Windows ; sous Linux, EM4me range ses données dans le profil de l'utilisateur.

## Démarrer

La version portable est le fichier du programme `EM4me-<Version>-Portable.exe`. Placez-le dans un emplacement où vous disposez des droits d'écriture, par exemple dans un dossier dédié de votre dossier Documents ou sur une clé USB, et démarrez-le depuis cet emplacement.

Rien n'est installé : il n'apparaît ni entrée dans la liste des programmes de Windows ni association d'extensions de fichier avec EM4me.

## Le dossier de données

Au premier démarrage, EM4me crée le dossier `Data` à côté du fichier du programme. Il accueille tout ce qu'EM4me enregistre : paramètres, session, brouillons, langues d'interface personnelles, extensions externes et fichiers temporaires. Si le dossier s'y trouve déjà, EM4me continue de l'utiliser.

**Ne supprimez donc pas le dossier `Data` et ne le renommez pas.** S'il manque au démarrage, EM4me le recrée vide et commence comme au premier démarrage ; ce qui se trouvait dans l'ancien dossier n'est alors pas utilisé.

L'emporter signifie copier le fichier du programme avec le dossier `Data`, le plus simplement en copiant le dossier qui contient les deux, par exemple sur une clé USB ou vers un autre ordinateur. Les paramètres et la session suivent ainsi.

## Où se trouvent les données

Dans la version portable, « Aide → À propos… » affiche la ligne « Version portable – vos données se trouvent dans : » avec le chemin complet du dossier `Data`. Le bouton « Ouvrir le dossier de données » en dessous l'ouvre dans le gestionnaire de fichiers. Dans la version installée, la ligne et le bouton sont absents.

## Le premier démarrage

La version portable ne reprend rien de l'ordinateur sur lequel elle fonctionne. Son premier démarrage commence avec les réglages par défaut, même si la version installée est configurée sur le même ordinateur : la version portable ne lit ni ses paramètres, ni ses listes récentes, ni ses zones. C'est le premier démarrage d'une nouvelle installation — la visite guidée démarre, et EM4me commence en mode de travail Débutant ([Extensions](extensions.md)).

### Emporter sa propre configuration

Qui veut continuer à utiliser la configuration de la version installée l'emporte au moyen d'un fichier d'échange :

1. Dans la version **installée**, choisir « Fichier → Paramètres → Exporter… », sélectionner les types de données souhaités et enregistrer le fichier, par exemple directement sur la clé USB.
2. Dans la version **portable**, choisir « Fichier → Paramètres → Importer… », sélectionner le fichier, lire l'aperçu et choisir « Appliquer ».

Les deux chemins appartiennent à l'extension « Export et import des paramètres », qui n'est activée qu'en mode de travail Complet. Dans une version portable tout juste démarrée, le sous-menu manque donc d'abord ; on l'active sous « Fichier → Paramètres… → Extensions », avec le mode de travail Complet ou avec l'interrupteur individuel de l'extension. Il en va de même dans la version installée si un mode de travail plus restreint y est réglé.

Ce que le fichier emporte et ce qu'il n'emporte pas est décrit sur la page [Exporter et importer les paramètres](setup-exchange.md). Les langues d'interface personnelles et les paquets d'extensions externes n'en font pas partie : une langue personnelle se charge à nouveau dans la version portable ([Votre propre langue d’interface](custom-locale.md)), un paquet d'extension se copie dans son répertoire des extensions ([Créer des extensions](extensions-dev.md)).

## Quand EM4me ne peut pas écrire

Si EM4me ne peut pas créer le dossier `Data` à côté du fichier du programme ou ne peut pas y écrire, par exemple sur une clé USB protégée en écriture ou dans un dossier protégé du système, il le signale au démarrage par « EM4me ne peut pas démarrer » et se ferme. Il n'enregistre alors rien nulle part, pas même dans le profil de l'utilisateur en remplacement. Le message apparaît dans la langue du système d'exploitation, car les paramètres ne sont pas encore lus à ce moment-là.

Remède : placez le fichier du programme dans un emplacement où vous disposez des droits d'écriture, par exemple votre dossier Documents ou une clé USB inscriptible, et démarrez-le depuis cet emplacement.

## Ce que la version portable laisse sur l'ordinateur

La version portable ne s'installe pas. Tout ce qu'EM4me enregistre se trouve dans le dossier `Data` à côté du fichier du programme : paramètres, session, brouillons et aussi fichiers temporaires. Emportez le fichier du programme avec le dossier `Data`, par exemple sur une clé USB, et vous emportez tout.

**Ce que fait le fichier du programme au démarrage.** Au démarrage, le fichier du programme décompresse le programme proprement dit dans le dossier temporaire de Windows et le démarre depuis cet emplacement ; à la fermeture, il le supprime à nouveau. Si EM4me est arrêté de force, par exemple via le Gestionnaire des tâches, cette copie peut y rester. C'est une propriété de ce mode de livraison, qui ne concerne que le programme lui-même, jamais vos données.

Vos documents se trouvent là où vous les rangez. Dans le dossier d'une zone que vous ouvrez, EM4me crée comme d'habitude ses fichiers de zone.

**Ce que Windows consigne.** Windows tient ses propres enregistrements sur chaque programme ; EM4me ne peut pas l'empêcher. On peut y lire qu'EM4me a fonctionné sur l'ordinateur, depuis quel emplacement il a été démarré et quels dossiers vous avez visités dans ses boîtes de dialogue de fichiers. En font partie par exemple le nom d'affichage du programme, les vues de dossier mémorisées et le dernier dossier visité de la boîte de dialogue de fichiers, un cache graphique et l'heure de modification de deux fichiers de l'orthographe. Cette énumération n'est pas complète. Le contenu de vos documents et le nom de vos fichiers ne figurent dans aucun des enregistrements mesurés.

**Ce qu'EM4me fait pour cela.** La version portable n'inscrit rien dans la liste des fichiers récemment utilisés, ne mémorise le dernier dossier visité que tant qu'elle fonctionne et n'ajoute aucun mot au dictionnaire ; le correcteur orthographique lui-même fonctionne comme d'habitude.

## Ce qui est différent dans la version portable

Deux choses se comportent volontairement autrement dans la version portable que dans la version installée, parce qu'elles écriraient ou liraient sinon en dehors du dossier `Data` :

- **Dictionnaire.** Le correcteur orthographique signale les mots et fait des suggestions comme dans la version installée. Les mots ne peuvent toutefois pas être ajoutés au dictionnaire : le menu contextuel de l'éditeur ne propose pas « Ajouter au dictionnaire », et sous « Paramètres → Correcteur orthographique » la suppression de mots individuels est absente. Les deux écriraient dans le dictionnaire de l'utilisateur Windows, donc sur l'ordinateur au lieu du dossier `Data`. Plus d'informations sur la vérification à la page [Outils](tools.md), section « Correcteur orthographique ».
- **Boîtes de dialogue de fichiers.** Après le démarrage, les boîtes de dialogue d'ouverture et d'enregistrement commencent dans le dossier « Documents », à moins que l'action ne propose elle-même un emplacement. EM4me ne mémorise le dernier dossier visité que tant que le programme fonctionne ; après la fermeture, il est oublié, et le démarrage suivant recommence dans « Documents ». Ce que Windows mémorise lui-même au sujet de ces boîtes de dialogue, EM4me ne le lit pas.

Les listes des fichiers et zones récemment ouverts au sein d'EM4me restent disponibles ; elles se trouvent dans le dossier `Data`.
