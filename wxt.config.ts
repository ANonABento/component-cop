import { defineConfig } from 'wxt';

export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Component Cop',
    description: 'UI component duplication auditor for React applications',
    permissions: ['activeTab', 'scripting', 'storage', 'alarms'],
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    commands: {
      'trigger-scan': {
        suggested_key: { default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' },
        description: 'Scan current page for component duplicates',
      },
      'toggle-picker': {
        suggested_key: { default: 'Ctrl+Shift+P', mac: 'Command+Shift+P' },
        description: 'Toggle element picker mode',
      },
    },
    options_ui: {
      page: 'options/index.html',
      open_in_tab: true,
    },
    web_accessible_resources: [
      {
        resources: ['injected.js'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
