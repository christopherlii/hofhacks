import { ipcMain } from 'electron';

import type { SettingsUpdate } from './settings-store';

interface RegisterIpcHandlersDeps {
  getSettings: () => {
    apiKey: string;
    guardianEnabled: boolean;
    elephantEnabled: boolean;
    firstLaunch: boolean;
  };
  saveSettings: (settings: SettingsUpdate) => void;
  getApiKey: () => string;
  openSettingsWindow: () => void;
  resizeOverlay: (height: number) => void;
  startGuardian: () => void;
  stopGuardian: () => void;
  refreshElephantShortcut: () => void;
}

function registerMainIpcHandlers({
  getSettings,
  saveSettings,
  getApiKey,
  openSettingsWindow,
  resizeOverlay,
  startGuardian,
  stopGuardian,
  refreshElephantShortcut
}: RegisterIpcHandlersDeps): void {
  ipcMain.handle('get-settings', () => getSettings());

  ipcMain.handle('save-settings', (_event, settings: SettingsUpdate) => {
    saveSettings(settings);

    if (settings.guardianEnabled === false) {
      stopGuardian();
    } else if (settings.guardianEnabled === true && getApiKey()) {
      startGuardian();
    }

    refreshElephantShortcut();

    return true;
  });

  ipcMain.handle('get-api-key', () => getApiKey());

  ipcMain.on('open-settings', () => openSettingsWindow());

  ipcMain.on('resize-overlay', (_event, height: number) => {
    resizeOverlay(height);
  });
}

export { registerMainIpcHandlers };
