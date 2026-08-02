// ESLint-Regelbasis (flat config). Umgebungs-Trennung: Node/CommonJS für
// src/main, src/shared und scripts; Browser/ESM für src/renderer; Vitest
// (ESM) und Playwright (CJS) für test/. Die gemeinsamen Regeln stehen im
// Regel-Block am Ende; die no-console-Abstufung (Renderer/Shared strikt,
// Main mit info, Skripte frei) in den nachgelagerten Blöcken.
'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    // Nicht handgepflegter bzw. nicht-Code-Bestand.
    ignores: [
      'node_modules/',
      'dist/',
      'releases/',
      'test-results/',
      'playwright-report/',
      'src/renderer/renderer.bundle.js',
      'src/renderer/mermaid.bundle.js',
      'src/renderer/katex/',
    ],
  },

  js.configs.recommended,

  // Node/CommonJS-Seite: Main-Prozess, shared Module, Build-/Wächter-Skripte,
  // Playwright-Specs und Root-Konfigurationen.
  {
    files: [
      'src/main/**/*.js',
      'src/shared/**/*.js',
      'scripts/**/*.js',
      'test/e2e/**/*.js',
      'playwright.config.js',
      'eslint.config.js',
      'eslint.config.gemeinsam.js',
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },

  // Preload: läuft als CommonJS im Renderer-Kontext, sieht Node UND DOM.
  {
    files: ['src/main/preload.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Renderer: ES-Module im Browser-Kontext (esbuild bundelt).
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },

  // Vitest-Unit-Tests: ESM; Node- plus Browser-Globals (jsdom-Umgebungen).
  {
    files: ['test/unit/**/*.js', 'vitest.config.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Playwright-Specs: page.evaluate-Callbacks laufen im Browser-Kontext
  // (window/document); die Regel-Ausnahmen stehen im Override-Block nach
  // den gemeinsamen Regeln (flat config: spätere Einträge gewinnen).
  {
    files: ['test/e2e/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Block-Sanitizer nutzt DOMParser direkt (läuft im Preload-/Browser-
  // Kontext; in purem Node fängt das try/catch den Fallback ab).
  {
    files: ['src/shared/markdown/markdown.js'],
    languageOptions: {
      globals: { DOMParser: 'readonly' },
    },
  },

  // Externe Erweiterungs-Pakete (4T-0299, Epic 3E-0053): eigenständige
  // Pakete außerhalb des App-Bundles. Einstiegs-Module (main.js) sind
  // ES-Module im Renderer-Kontext; markdownPlugin-Dateien laufen als
  // CommonJS-artiger Quelltext im vm-Sandbox-Kontext des Preload-Loaders.
  // Zwei Orte, weil das Referenz-Beispiel seit 4T-0826 (Epic 3E-0103) real
  // in addon_examples/ ausgeliefert wird und nur die Fehlerfall-Pakete
  // Fixtures bleiben.
  {
    files: ['test/fixtures/extensions/**/main.js', 'addon_examples/**/main.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    files: ['test/fixtures/extensions/**/markdown.js', 'addon_examples/**/markdown.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.commonjs },
    },
  },

  // Gemeinsame Regeln ([E]-Regeln der Entwicklungsrichtlinien).
  {
    rules: {
      // '== null'/'!= null' bleibt als bewusstes Null-oder-Undefined-Idiom
      // erlaubt (Entwicklungsrichtlinien §2).
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Logging-Politik: warn/error nur auf Fehlerpfaden, kein console.log.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // no-useless-escape und no-unused-vars kommen aus recommended (error);
      // no-useless-assignment ist nicht in recommended, hier explizit scharf.
      'no-useless-assignment': 'error',
    },
  },

  // Main darf zusätzlich console.info für betriebliche Einmal-Hinweise.
  {
    files: ['src/main/**/*.js'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    },
  },

  // Playwright-Specs: Konsolen-Ausgabe ist Diagnose-Kanal der Tests
  // (z.B. Performance-Messwerte), leere catch-Blöcke sind dort
  // etabliertes Cleanup-Muster.
  {
    files: ['test/e2e/**/*.js'],
    rules: {
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Skripte: die Konsole ist der Ausgabekanal des Werkzeugs.
  {
    files: ['scripts/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
];
