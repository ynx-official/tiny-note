import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/**', 'node_modules/**', '**/src-tauri/target/**', 'src-tauri/icons/**', '**/src-tauri/icons/**'] },
  ...tseslint.configs.recommended.map(config => ({ ...config, files: ['**/*.ts'] })),
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'], sourceType: 'module' } },
    rules: {
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',
      'vue/html-closing-bracket-spacing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/no-mutating-props': 'off',
      'vue/no-v-html': 'off',
      'vue/require-default-prop': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-indent': 'off'
    }
  },
  {
    files: ['src/services/browserBackend.ts'],
    rules: { '@typescript-eslint/ban-ts-comment': 'off' }
  },
  {
    rules: { 'prefer-const': 'off' }
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly' } }
  }
]
