import js from '@eslint/js'
import globals from 'globals'
import importPlugin from 'eslint-plugin-import'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.codegraph/**',
      '**/.engram/**',
      '**/.git/**',
      '**/*.min.js',
    ],
  },

  js.configs.recommended,

  {
    files: ['backend/**/*.js', 'e2e/**/*.js'],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },

    plugins: {
      import: importPlugin,
    },

    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-undef': 'error',

      'import/no-unresolved': 'off',
      'import/order': [
        'warn',
        {
          alphabetize: {
            order: 'asc',
          },
          'newlines-between': 'always',
        },
      ],
    },
  },

  {
    // El callback de page.evaluate() corre en el contexto del navegador (Puppeteer),
    // no en Node — necesita los globals de browser aunque el archivo viva en backend/.
    files: ['backend/src/templates/oferta/pdf-utils.js'],

    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  {
    files: ['frontend/**/*.js'],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },

    plugins: {
      import: importPlugin,
    },

    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-undef': 'error',
    },
  },

  eslintConfigPrettier,
]
