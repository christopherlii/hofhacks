import type { Settings } from '../../types';

interface SaveSettingsDeps {
  setNiaApiKey: (key: string) => void;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  refreshElephantShortcut: () => void;
}

function isElephantEnabled(store: any): boolean {
  const raw = store?.get('elephantEnabled');
  return typeof raw === 'boolean' ? raw : true;
}

function getApiKey(store: any): string {
  return (store?.get('anthropicKey') as string) || '';
}

function getSettingsPayload(store: any): Settings {
  const anthropicKey = store.get('anthropicKey') as string;
  const enabled = store.get('enabled') as boolean;

  return {
    anthropicKey,
    niaKey: store.get('niaKey') as string,
    enabled,
    scamDetection: store.get('scamDetection') as boolean,
    firstLaunch: store.get('firstLaunch') as boolean,
    apiKey: anthropicKey,
    guardianEnabled: enabled,
    elephantEnabled: isElephantEnabled(store),
  };
}

function saveSettingsPayload(store: any, settings: Partial<Settings>, deps: SaveSettingsDeps): boolean {
  const anthropicKey = settings.anthropicKey ?? settings.apiKey;
  const monitoringEnabled = settings.enabled ?? settings.guardianEnabled;

  if (anthropicKey !== undefined) store.set('anthropicKey', anthropicKey);
  if (settings.niaKey !== undefined) store.set('niaKey', settings.niaKey);
  if (monitoringEnabled !== undefined) store.set('enabled', monitoringEnabled);
  if (settings.scamDetection !== undefined) store.set('scamDetection', settings.scamDetection);
  if (settings.elephantEnabled !== undefined) store.set('elephantEnabled', settings.elephantEnabled);
  if (settings.firstLaunch !== undefined) store.set('firstLaunch', settings.firstLaunch);

  if (settings.niaKey) deps.setNiaApiKey(settings.niaKey);

  if (monitoringEnabled === false) deps.stopMonitoring();
  else if (monitoringEnabled === true) deps.startMonitoring();

  deps.refreshElephantShortcut();
  return true;
}

export { getApiKey, getSettingsPayload, isElephantEnabled, saveSettingsPayload };
