import { BrowserWindow, Notification, screen } from 'electron';
import path from 'path';

import type { ScamResult } from '../../types';

class AppWindows {
  private chatWindow: BrowserWindow | null = null;
  private indicatorWindow: BrowserWindow | null = null;
  private overlayWindow: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;

  private uiPath(...segments: string[]): string {
    return path.join(__dirname, '..', '..', 'ui', ...segments);
  }

  private preloadPath(): string {
    return path.join(__dirname, '..', '..', 'preload.js');
  }

  createChatWindow(): void {
    if (this.chatWindow && !this.chatWindow.isDestroyed()) {
      this.chatWindow.focus();
      return;
    }

    this.chatWindow = new BrowserWindow({
      width: 900,
      height: 650,
      minWidth: 700,
      minHeight: 500,
      frame: true,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      backgroundColor: '#0f172a',
      webPreferences: {
        preload: this.preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    void this.chatWindow.loadFile(this.uiPath('chat.html'));
    this.chatWindow.on('closed', () => {
      this.chatWindow = null;
    });
  }

  createIndicatorWindow(): void {
    this.indicatorWindow = new BrowserWindow({
      width: 72,
      height: 72,
      x: screen.getPrimaryDisplay().workAreaSize.width - 90,
      y: screen.getPrimaryDisplay().workAreaSize.height - 90,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      hasShadow: false,
      webPreferences: {
        preload: this.preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
      },
    } as any);

    void this.indicatorWindow.loadFile(this.uiPath('indicator.html'));
    this.indicatorWindow.setIgnoreMouseEvents(true, { forward: true });
    this.indicatorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.indicatorWindow.setContentProtection(true);
  }

  createOverlayWindow(): void {
    const { width } = screen.getPrimaryDisplay().workAreaSize;
    this.overlayWindow = new BrowserWindow({
      width: 520,
      height: 100,
      x: width - 520 - 12,
      y: 12,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      hasShadow: false,
      webPreferences: {
        preload: this.preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
      },
    } as any);

    void this.overlayWindow.loadFile(this.uiPath('overlay.html'));
    this.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.overlayWindow.setContentProtection(true);
    this.overlayWindow.showInactive();
  }

  createSettingsWindow(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.settingsWindow.focus();
      return;
    }

    this.settingsWindow = new BrowserWindow({
      width: 520,
      height: 650,
      frame: true,
      resizable: false,
      webPreferences: {
        preload: this.preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    void this.settingsWindow.loadFile(this.uiPath('settings.html'));
    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;
    });
  }

  updateStatus(status: string): void {
    if (this.indicatorWindow && !this.indicatorWindow.isDestroyed()) {
      this.indicatorWindow.webContents.send('status-update', status);
    }
  }

  showScamAlert(data: ScamResult): void {
    if (Notification.isSupported()) {
      new Notification({
        title: 'Possible Scam Detected',
        body: data.reason,
        urgency: 'critical',
      }).show();
    }

    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.send('show-alert', data);
      this.overlayWindow.showInactive();
    }
  }

  dismissAlert(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.send('hide-alert');
    }
  }

  setOverlayInteractive(interactive: boolean): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      if (interactive) {
        this.overlayWindow.setIgnoreMouseEvents(false);
      } else {
        this.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      }
    }
  }

  resizeOverlay(height: number): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      const bounds = this.overlayWindow.getBounds();
      this.overlayWindow.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: Math.max(100, height),
      });
    }
  }
}

export { AppWindows };
