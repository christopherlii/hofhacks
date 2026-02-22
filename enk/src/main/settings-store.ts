const Store = require('electron-store').default;

interface SettingsStore {
  apiKey: string;
  guardianEnabled: boolean;
  elephantEnabled: boolean;
  firstLaunch: boolean;
  enabled?: boolean;
  lensEnabled?: boolean;
}

export interface SettingsUpdate {
  apiKey?: string;
  guardianEnabled?: boolean;
  elephantEnabled?: boolean;
  firstLaunch?: boolean;
}

const store: any = new Store({
  name: 'enk-config',
  schema: {
    apiKey: { type: 'string', default: '' },
    guardianEnabled: { type: 'boolean', default: true },
    elephantEnabled: { type: 'boolean', default: true },
    firstLaunch: { type: 'boolean', default: true }
  },
  encryptionKey: 'enk-secure-storage-key-v1'
});

if (store.has('enabled')) {
  store.set('guardianEnabled', Boolean(store.get('enabled')));
  store.delete('enabled');
}

if (store.has('lensEnabled')) {
  store.set('elephantEnabled', Boolean(store.get('lensEnabled')));
  store.delete('lensEnabled');
}

function getSettings(): SettingsStore {
  return {
    apiKey: getApiKey(),
    guardianEnabled: isGuardianEnabled(),
    elephantEnabled: isElephantEnabled(),
    firstLaunch: isFirstLaunch()
  };
}

function saveSettings(settings: SettingsUpdate): void {
  if (settings.apiKey !== undefined) store.set('apiKey', settings.apiKey);
  if (settings.guardianEnabled !== undefined) store.set('guardianEnabled', settings.guardianEnabled);
  if (settings.elephantEnabled !== undefined) store.set('elephantEnabled', settings.elephantEnabled);
  if (settings.firstLaunch !== undefined) store.set('firstLaunch', settings.firstLaunch);
}

function getApiKey(): string {
  return String(store.get('apiKey') || '');
}

function isGuardianEnabled(): boolean {
  return Boolean(store.get('guardianEnabled'));
}

function isElephantEnabled(): boolean {
  return Boolean(store.get('elephantEnabled'));
}

function isFirstLaunch(): boolean {
  return Boolean(store.get('firstLaunch'));
}

export { getSettings, saveSettings, getApiKey, isGuardianEnabled, isElephantEnabled, isFirstLaunch };
