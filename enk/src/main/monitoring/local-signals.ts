import { exec } from 'child_process';
import { clipboard } from 'electron';

interface ClipboardEntry {
  text: string;
  timestamp: number;
  app: string;
}

interface NowPlayingEntry {
  track: string;
  artist: string;
  app: string;
  timestamp: number;
}

interface LocalSignalsDeps {
  getCurrentApp: () => string;
  addEntity: (label: string, type: any, sourceContext?: string, contextHintForEdge?: string) => void;
}

class LocalSignalsMonitor {
  private readonly deps: LocalSignalsDeps;
  private readonly clipboardLog: ClipboardEntry[] = [];
  private readonly nowPlayingLog: NowPlayingEntry[] = [];

  private clipboardTimer: ReturnType<typeof setInterval> | null = null;
  private nowPlayingTimer: ReturnType<typeof setInterval> | null = null;

  private lastClipboardText = '';
  private lastNowPlaying = '';

  constructor(deps: LocalSignalsDeps) {
    this.deps = deps;
  }

  getClipboardLog(): ClipboardEntry[] {
    return this.clipboardLog;
  }

  getNowPlayingLog(): NowPlayingEntry[] {
    return this.nowPlayingLog;
  }

  start(): void {
    if (!this.clipboardTimer) {
      this.pollClipboard();
      this.clipboardTimer = setInterval(() => this.pollClipboard(), 1000);
    }

    if (!this.nowPlayingTimer) {
      this.pollNowPlaying();
      this.nowPlayingTimer = setInterval(() => this.pollNowPlaying(), 10000);
    }
  }

  stop(): void {
    if (this.clipboardTimer) {
      clearInterval(this.clipboardTimer);
      this.clipboardTimer = null;
    }

    if (this.nowPlayingTimer) {
      clearInterval(this.nowPlayingTimer);
      this.nowPlayingTimer = null;
    }
  }

  private pollClipboard(): void {
    try {
      const text = clipboard.readText().trim();
      if (!text || text === this.lastClipboardText || text.length > 2000 || text.length < 2) return;

      this.lastClipboardText = text;
      this.clipboardLog.push({ text: text.slice(0, 500), timestamp: Date.now(), app: this.deps.getCurrentApp() });

      if (text.length > 2 && text.length < 200) {
        this.deps.addEntity(text.slice(0, 80), 'topic');
      }

      const urlMatch = text.match(/https?:\/\/[^\s]+/);
      if (!urlMatch) return;

      try {
        const domain = new URL(urlMatch[0]).hostname.replace(/^www\./, '');
        this.deps.addEntity(domain, 'content');
      } catch {
        // ignore invalid URL
      }
    } catch {
      // ignore clipboard read errors
    }
  }

  private pollNowPlaying(): void {
    const script = `
      try
        tell application "System Events"
          set musicApps to {"Spotify", "Music", "Apple Music"}
          repeat with appName in musicApps
            if (exists (processes whose name is appName)) then
              tell application appName
                if player state is playing then
                  return (name of current track) & "|||" & (artist of current track) & "|||" & appName
                end if
              end tell
            end if
          end repeat
        end tell
      end try
      return ""
    `;

    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout.trim()) return;

      const parts = stdout.trim().split('|||');
      if (parts.length < 3) return;

      const [track, artist, musicApp] = parts.map((part) => part.trim());
      const key = `${track} - ${artist}`;
      if (key === this.lastNowPlaying) return;

      this.lastNowPlaying = key;
      this.nowPlayingLog.push({ track, artist, app: musicApp, timestamp: Date.now() });

      if (track) this.deps.addEntity(track, 'content');
      if (artist) this.deps.addEntity(artist, 'person');

      console.log(`[Enk] Now playing: "${track}" by ${artist} (${musicApp})`);
    });
  }
}

export { LocalSignalsMonitor };
export type { ClipboardEntry, NowPlayingEntry };
