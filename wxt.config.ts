import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Component Cop',
    short_name: 'Component Cop',
    version_name: '0.1.0',
    description: 'Privacy-first React UI auditor for duplicate components, design drift, and accessibility issues.',
    permissions: ['activeTab', 'scripting', 'storage', 'alarms'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Component Cop',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
    },
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
    browser_specific_settings: {
      gecko: {
        id: 'component-cop@example.com',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['none'],
        },
      } as unknown as { id: string; strict_min_version: string },
      gecko_android: {
        strict_min_version: '142.0',
      },
    },
    web_accessible_resources: [
      {
        resources: ['injected.js'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
