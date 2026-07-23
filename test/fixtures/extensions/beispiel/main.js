// Referenz-Erweiterung (4T-0299, Epic 3E-0053): UI-Einstiegspunkt.
// ES-Modul; der Renderer lädt es per dynamischem import() und ruft
// activate(ctx) mit der API-v1-Fassade. Die Erweiterung demonstriert alle
// Beitrags-Arten außer dem Markdown-Plugin (das liegt in markdown.js und
// läuft im Preload): Sidebar-Panel, Kommando mit Standard-Kürzel,
// Einstellungs-Bereich mit storage-Persistenz, Übersetzungen mit
// Fallback sowie Lese-Zugriff auf Sprache, Theme und Theme-Variablen.
let counter = 0;
let counterEls = [];

export default {
  activate(ctx) {
    ctx.addTranslations(
      {
        de: {
          'panel.title': 'Beispiel-Panel',
          'panel.counterLabel': 'Zähler',
          'command.title': 'Beispiel: Zähler erhöhen',
          'settings.title': 'Beispiel-Erweiterung',
          'settings.noteLabel': 'Notiz',
        },
        en: {
          'panel.title': 'Example panel',
          'panel.counterLabel': 'Counter',
          'command.title': 'Example: increment counter',
          'settings.title': 'Example extension',
          'settings.noteLabel': 'Note',
        },
      },
      'en',
    );

    ctx.registerSidebarPanel({
      id: 'demo',
      titleKey: 'panel.title',
      render(body) {
        const info = document.createElement('div');
        info.className = 'ext-beispiel-info';
        info.textContent =
          `${ctx.manifest.name} ${ctx.manifest.version} · ` +
          `${ctx.getLanguage()} · ${ctx.getTheme()} · ` +
          `Akzent ${ctx.getThemeVariable('--render-font-size') || '–'}`;
        const row = document.createElement('div');
        const label = document.createElement('span');
        label.setAttribute('data-i18n', 'ext.beispiel.panel.counterLabel');
        label.textContent = ctx.t('panel.counterLabel');
        const value = document.createElement('span');
        value.className = 'ext-beispiel-counter';
        value.textContent = String(counter);
        row.append(label, ': ', value);
        body.append(info, row);
        counterEls.push(value);
      },
    });

    ctx.registerCommand({
      id: 'zaehlen',
      titleKey: 'command.title',
      defaultBinding: 'CmdOrCtrl+Alt+9',
      run() {
        counter += 1;
        for (const el of counterEls) el.textContent = String(counter);
      },
    });

    ctx.registerSettingsSection({
      id: 'einstellungen',
      titleKey: 'settings.title',
      render(container) {
        const label = document.createElement('label');
        label.textContent = `${ctx.t('settings.noteLabel')}: `;
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'ext-beispiel-notiz';
        ctx.storage.get('notiz').then((v) => {
          input.value = typeof v === 'string' ? v : '';
        });
        input.addEventListener('change', () => {
          ctx.storage.set('notiz', input.value);
        });
        label.appendChild(input);
        container.appendChild(label);
      },
    });
  },

  deactivate() {
    counter = 0;
    counterEls = [];
  },
};
