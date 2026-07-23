# Rappels

Un rappel se signale à un moment que vous choisissez et remet une tâche sous les yeux. Il tient au marqueur de rappel ⏰ d'une ligne de tâche et se distingue ainsi de l'échéance 📅 : l'échéance indique la date réelle (quand quelque chose doit être terminé), le marqueur de rappel indique le moment de notification (quand l'application le rappelle). Les rappels sont une extension activable et s'appuient sur les [listes de tâches](tasks.md).

## Marqueur et voies de saisie

Comme les autres marqueurs de tâche, le marqueur se place en fin de ligne :

```
⏰ AAAA-MM-JJ [HH:MM]
```

La partie horaire est facultative. En son absence, le rappel se signale à l'heure par défaut configurée (voir Paramètres).

```markdown
- [ ] Déposer la déclaration ⏰ 2099-04-14
- [ ] Rappeler le client ⏰ 2099-04-14 09:30
```

- [ ] Déposer la déclaration ⏰ 2099-04-14
- [ ] Rappeler le client ⏰ 2099-04-14 09:30

Plusieurs voies existent pour la saisie :

- **Commande « Définir un rappel »** (défaut `Ctrl+Alt+R`) : sur une ligne de tâche, elle ouvre le sélecteur de date et d'heure et écrit le marqueur.
- **Autocomplétion** : sur une ligne de tâche, l'entrée « Rappel… » propose le marqueur et ouvre le même sélecteur.
- **Dialogue d'édition de tâche** : la ligne de rappel du dialogue définit ou modifie le marqueur avec les autres champs.
- **Clic sur la valeur** : un clic sur la valeur ⏰ ou le badge ⏰ ouvre le sélecteur pré-rempli.

## Dialogue de notification

Lorsqu'un rappel est dû, un dialogue le signale avec la description de la tâche et un lien vers le fichier source. Trois voies sont ouvertes :

- **Terminé** : fait avancer la tâche le long de la chaîne de statuts configurée. Si la tâche porte une règle de répétition, l'instance suivante est créée et le marqueur ⏰ passe dans cette instance avec un moment décalé.
- **Me le rappeler plus tard** : reporte le moment de notification. Sont proposées les options de report configurées (défaut 10 minutes, 1 heure, 4 heures, 1 jour, 1 semaine) et un choix de date libre. Le nouveau moment est écrit directement dans le marqueur du fichier source.
- **Fermer** (fermeture ou Échap) : met ce rappel en sourdine jusqu'au prochain démarrage de l'application. La tâche elle-même reste inchangée.

## Uniquement lorsque l'application est ouverte

Les rappels ne se signalent **que tant que l'application est ouverte et la zone active**. Il n'y a pas de service en arrière-plan ni de notification lorsque l'application est fermée. Si l'application n'est pas ouverte au moment de notification, rien n'est perdu pour autant : au démarrage suivant, un **dialogue de rattrapage** rassemble tous les rappels devenus dus entre-temps et les affiche ensemble, avec les mêmes actions que dans le dialogue normal. En dehors d'une zone ouverte, aucune surveillance n'a lieu.

Lorsqu'une zone est ouverte, l'application vérifie en continu les marqueurs de tous les fichiers de la zone (par cycle de 30 secondes sur l'index de zone). Une **notification système** peut être activée en option ; elle apparaît en plus du dialogue lorsque la fenêtre n'est pas au premier plan, et un clic dessus ramène l'application au premier plan.

## Liste des rappels

Un panneau de la barre latérale liste tous les rappels de la zone, regroupés en **En retard**, **Aujourd'hui**, **Demain** et **Plus tard**. Le panneau s'ouvre via l'icône de réveil de la barre d'état ou via Affichage → Panneaux → Rappels.

- Chaque entrée offre les actions directes **Terminé** et **Plus tard**.
- Un clic sur une entrée ouvre le fichier source à la ligne correspondante.
- Le groupe **En retard** comporte aussi les rappels en sourdine et y propose **Déclencher à nouveau**.

## Paramètres et extension

La section de paramètres **Rappels** (Fichier → Paramètres…) contrôle :

- **Heure par défaut** : heure de notification pour les marqueurs sans partie horaire (défaut 09:00).
- **Options de report** : la liste des offres de report dans le dialogue et dans la liste.
- **Notification système** : active ou désactive la notification supplémentaire pour une fenêtre hors du premier plan.

Les rappels sont une **extension** activable avec une dépendance à l'extension **Tâches** : si « Tâches » est désactivée, les rappels sont inactifs eux aussi. Plus de détails sur la page [Extensions](extensions.md).
