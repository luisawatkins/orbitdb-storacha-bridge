module.exports = {
  env: {
    browser: false,
    es2022: true,
    node: true,
    mocha: true
  },
  extends: [
    'eslint:recommended'
  ],
  globals: {
    // Add test globals for Mocha
    describe: 'readonly',
    it: 'readonly',
    before: 'readonly',
    after: 'readonly',
    beforeEach: 'readonly',
    afterEach: 'readonly',
    expect: 'readonly'
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    // Allow console.log in demo/example files
    'no-console': 'off',
    // Make unused vars warnings, allow _ prefix
    'no-unused-vars': ['warn', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
    // Make prefer-const a warning instead of error
    'prefer-const': 'warn',
    'no-var': 'error'
  },
  overrides: [
    {
      // Be extra lenient with example files
      files: ['examples/**/*.js'],
      rules: {
        'no-unused-vars': 'off',
        'no-console': 'off'
      }
    },
    {
      // Strict rules for lib files
      files: ['lib/**/*.js'],
      rules: {
        'prefer-const': 'error',
        'no-unused-vars': ['error', { 
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }]
      }
    }
  ],
  ignorePatterns: [
    'node_modules/',
    'coverage/',
    '*.min.js',
    'dist/',
    'orbitdb/'
  ]
}
