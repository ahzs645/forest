import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'FPBC Source/**',
      'cli-game.tsx',
      'tui/**/*.tsx'
    ]
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error'
    }
  }
];
