export default [{
  ignores: ['dist/**', '**/src-tauri/target/**', 'src-tauri/icons/**', '**/src-tauri/icons/**']
}, {
  languageOptions: {
    globals: {
      window: 'readonly', localStorage: 'readonly', crypto: 'readonly', clearTimeout: 'readonly', setTimeout: 'readonly', matchMedia: 'readonly', confirm: 'readonly', prompt: 'readonly'
    }
  },
  rules: {
    'no-unused-vars': 'warn',
    'no-undef': 'warn'
  }
}]
