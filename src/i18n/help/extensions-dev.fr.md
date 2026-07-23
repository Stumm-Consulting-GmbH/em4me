# Créer des extensions

Les extensions externes sont des paquets créés par vous-même qui étendent le rendu et l'interface de l'application via une interface définie et versionnée (API d'extension v1). Cette page décrit la structure d'un paquet, l'API complète et le chemin de l'installation à l'activation.

> [!warning] Avertissement de sécurité
> Une extension externe activée est du code tiers avec **un accès complet à vos documents et à toute l'application**. Il n'existe pas de couche de protection technique (pas de bac à sable) ; la protection est votre décision consciente dans la boîte de dialogue d'avertissement. N'activez que des extensions dont vous connaissez la source et dont vous pouvez examiner le code.

## Structure d'un paquet

Un paquet d'extension est un dossier dans le répertoire des extensions du profil utilisateur. L'action « Ouvrir le dossier » de la section de paramètres Extensions (externes) ouvre le répertoire dans l'explorateur de fichiers.

```text
<profil utilisateur>/extensions/
└── mon-extension/
    ├── manifest.json     (obligatoire : décrit le paquet)
    ├── main.js           (point d'entrée UI, module ES)
    └── markdown.js       (contribution de rendu, plugin markdown-it)
```

Le nom du dossier doit correspondre à l'ID de l'extension. D'autres fichiers sont autorisés ; `main.js` peut les charger via des instructions `import` relatives.

## Référence du manifeste

Le fichier `manifest.json` décrit le paquet :

```json
{
  "id": "mon-extension",
  "name": "Mon extension",
  "version": "1.0",
  "apiVersion": "1.0",
  "description": "Brève description pour la section de paramètres.",
  "entry": "main.js",
  "markdownPlugin": "markdown.js"
}
```

| Champ | Obligatoire | Signification |
|---|---|---|
| `id` | oui | Identifiant stable en minuscules avec tirets (kebab-case) ; doit correspondre au nom du dossier. |
| `name` | oui | Nom affiché dans la section de paramètres et la boîte d'avertissement. |
| `version` | oui | Version du paquet (`major.minor.patch`). La confirmation de confiance vaut par version ; après un changement de version, une nouvelle confirmation est requise. |
| `apiVersion` | oui | Version de l'API contre laquelle le paquet est construit (voir versionnage). |
| `entry` | l'un des deux | Point d'entrée UI : module ES avec `activate(ctx)`. |
| `markdownPlugin` | l'un des deux | Contribution de rendu : fichier exportant un plugin markdown-it. |
| `description` | non | Brève description pour la section de paramètres. |

`entry` et `markdownPlugin` sont de simples noms de fichiers dans le dossier du paquet (pas de chemins). Au moins l'un des deux champs est obligatoire.

## Installation et activation

1. Copiez le dossier du paquet dans le répertoire des extensions.
2. Dans la section Extensions (externes), cliquez sur « Actualiser » — le paquet apparaît avec le statut « Non activée ». Les paquets nouvellement détectés sont toujours désactivés.
3. « Activer… » ouvre la boîte d'avertissement. Le code ne s'exécute qu'après confirmation ; la confirmation est enregistrée par extension et par version.
4. L'extension prend effet immédiatement et dans toutes les fenêtres ; l'état survit au redémarrage.

« Désactiver » retire immédiatement toutes les contributions (la confirmation reste enregistrée ; réactiver la même version ne redemande pas). « Supprimer… » efface définitivement le dossier du paquet après sa propre confirmation.

## Contribution de rendu : plugin markdown-it

Le fichier nommé dans `markdownPlugin` exporte une fonction de plugin markdown-it :

```js
'use strict';
module.exports = function monPlugin(md) {
  md.inline.ruler.after('emphasis', 'mon-smiley', function (state, silent) {
    if (state.src.slice(state.pos, state.pos + 3) !== ':-)') return false;
    if (!silent) {
      const token = state.push('html_inline', '', 0);
      token.content = '<span class="ext-beispiel-smiley">☺</span>';
    }
    state.pos += 3;
    return true;
  });
};
```

Le fichier s'exécute dans un environnement propre et vide : `module` et `exports` existent, mais il n'y a **pas** de `require`, pas de `process` et pas de DOM. Le plugin est appliqué aux deux instances de rendu (affichage et export portable), après tous les enregistrements intégrés. Si le plugin lève une erreur à l'enregistrement, l'extension est désactivée automatiquement et le texte d'erreur s'affiche dans la section de paramètres.

## Point d'entrée UI

Le fichier nommé dans `entry` est un module ES. Son export par défaut fournit `activate(ctx)` et, en option, `deactivate()` :

```js
export default {
  activate(ctx) {
    // enregistrer les contributions (voir la référence ctx)
  },
  deactivate() {
    // optionnel : votre propre nettoyage ; les contributions
    // enregistrées sont retirées par l'application elle-même
  },
};
```

`activate` s'exécute au démarrage de l'application (si l'extension est active) et à chaque activation. Si `activate` lève une erreur, toutes les contributions déjà enregistrées sont annulées et l'extension est désactivée automatiquement.

### Référence ctx (API v1)

| Membre | Signification |
|---|---|
| `ctx.apiVersion` | Version de l'API de l'application (p. ex. `1.0`). |
| `ctx.manifest` | Copie figée de `id`, `name`, `version`, `description`. |
| `ctx.registerSidebarPanel(def)` | Contribuer un panneau de barre latérale (voir ci-dessous). |
| `ctx.registerCommand(def)` | Contribuer une commande, avec raccourci par défaut optionnel. |
| `ctx.registerSettingsSection(def)` | Contribuer sa propre section de paramètres. |
| `ctx.addTranslations(bundles, defaultLocale)` | Enregistrer ses propres traductions. |
| `ctx.t(key)` | Résoudre une traduction : langue active → langue par défaut → clé. |
| `ctx.getLanguage()` | Langue active de l'interface (`de`, `en`, `fr`, `es`, `it`). |
| `ctx.getTheme()` | Thème actif (`light` ou `dark`). |
| `ctx.getThemeVariable(name)` | Valeur d'une variable CSS du thème, p. ex. `--render-font-size`. |
| `ctx.storage.get(key)` / `ctx.storage.set(key, value)` | Espace de persistance de l'extension (asynchrone). |

Tout ce qui n'est pas listé ici ne fait pas partie de l'API publique — même si c'est techniquement accessible — et peut changer à tout moment.

### Panneau de barre latérale

```js
ctx.registerSidebarPanel({
  id: 'demo',
  titleKey: 'panel.title',
  render(body, paneIdx) {
    body.textContent = 'Contenu du panneau';
  },
});
```

Le panneau reçoit sa propre section par colonne et reste visible tant que l'extension est active. Position, côté et groupes d'onglets suivent la disposition normale de la barre latérale (page de manuel Barre latérale) et sont enregistrés. À la place de `titleKey` (recommandé, multilingue via `addTranslations`), un `title` fixe est aussi possible.

### Commande

```js
ctx.registerCommand({
  id: 'compter',
  titleKey: 'command.title',
  defaultBinding: 'CmdOrCtrl+Alt+9',
  run() {
    // action
  },
});
```

La commande apparaît dans l'éditeur de raccourcis clavier (groupe « Général ») et peut y être réaffectée ; `defaultBinding` est optionnel. Les entrées de menu et les entrées de la page de manuel générée des raccourcis ne font pas partie de la v1.

### Section de paramètres

```js
ctx.registerSettingsSection({
  id: 'parametres',
  titleKey: 'settings.title',
  render(container) {
    const input = document.createElement('input');
    ctx.storage.get('valeur').then((v) => {
      input.value = typeof v === 'string' ? v : '';
    });
    input.addEventListener('change', () => ctx.storage.set('valeur', input.value));
    container.appendChild(input);
  },
});
```

La section apparaît dans la navigation des paramètres tant que l'extension est active. Les valeurs vont dans l'espace `ctx.storage` ; elles sont conservées à la désactivation.

### Traductions

```js
ctx.addTranslations(
  {
    fr: { 'panel.title': 'Mon panneau' },
    en: { 'panel.title': 'My panel' },
  },
  'en',
);
```

`ctx.t('panel.title')` résout dans la langue active et retombe sur la langue par défaut de l'extension (deuxième argument), puis sur la clé elle-même. Les clés des champs `titleKey` sont résolues par le même mécanisme et suivent le changement de langue de l'application.

## Versionnage et compatibilité

L'API d'extension porte son propre numéro de version sémantique. Un paquet déclare dans `apiVersion` la version d'API contre laquelle il est construit. Il est compatible si la version majeure correspond à celle de l'application et si la version mineure déclarée n'est pas plus récente que celle de l'application. Les paquets incompatibles ne sont jamais chargés et sont listés dans la section de paramètres avec un message clair.

Promesse de stabilité : les signatures documentées sur cette page restent stables au sein de la même version majeure.

## Diagnostic des erreurs

- Si une extension lève une erreur au chargement (erreur de manifeste, erreur d'import, `activate`, enregistrement du plugin), elle est désactivée automatiquement ; la section de paramètres affiche le statut « Erreur » avec le texte d'erreur — même après un redémarrage.
- Les manifestes invalides sont listés avec des détails de diagnostic et ne sont jamais chargés.
- Les erreurs d'exécution dans les commandes ou lors du dessin d'un panneau ne font pas planter l'application ; les détails figurent dans le journal de la console.
- « Activer… » après une erreur retente le chargement (le texte d'erreur est réinitialisé).

## Notes de qualité

L'isolation des erreurs intercepte les plantages, pas la mauvaise qualité. Relèvent notamment de votre responsabilité :

- **Performance de rendu :** les règles markdown-it s'exécutent à chaque rendu ; des règles coûteuses ralentissent la frappe et l'aperçu.
- **Sortie propre :** le HTML généré doit s'accorder au style du document et ne pas charger de ressources distantes (liens de démonstration vers `example.org`).
- **Nettoyage :** vos propres minuteurs, écouteurs hors des contributions enregistrées et états globaux vont dans `deactivate()`.

L'extension de référence `beispiel` sert de modèle exécutable avec tous les types de contribution de cette page ; sa structure correspond exactement aux exemples ci-dessus.
