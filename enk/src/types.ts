import type { NativeImage } from 'electron';

// --- Window & Activity ---

export interface WindowInfo {
  app: string;
  title: string;
  url: string | null;
}

export interface BrowserInfo {
  url: string | null;
  tabTitle: string | null;
}

export interface ActivityEntry {
  app: string;
  title: string;
  url: string | null;
  start: number;
  end: number;
  duration: number;
  summary: string | null;
}

export interface ContentSnapshot {
  timestamp: number;
  app: string;
  title: string;
  url: string | null;
  text: string;
  fullText: string;
  summary: string | null;
}

// --- Screen & OCR ---

export interface ScreenCapture {
  id: string;
  name: string;
  nativeImage: NativeImage;
}

export interface OcrResult {
  text: string;
  confidence: number;
}

// --- Context ---

export interface NowContext {
  activeApp: string | null;
  windowTitle: string | null;
  url: string | null;
  visibleText: string | null;
  ocrConfidence: number;
  timestamp: number;
}

// --- Claude API ---

export interface ClaudeRequestBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: string; content: unknown }[];
}

export interface ClaudeResponse {
  content?: { text: string }[];
  error?: unknown;
}

// --- Safety & Scam Detection ---

export interface GuardianResult {
  flagged: boolean;
  risk_level?: 'low' | 'medium' | 'high';
  reason: string;
}

export interface ScamResult {
  flagged: boolean;
  risk_level: string;
  reason: string;
}

// --- Nia ---

export interface NiaNode {
  session_id: string;
  timestamp: number;
  app: string | null;
  window_title: string | null;
  url: string | null;
  task_label: string;
  entities: string[];
  visible_text: string | null;
  raw_context: unknown;
}

export interface NiaQueryResult {
  session_id: string;
  task_label: string;
  app: string | null;
  url: string | null;
  timestamp: number;
  relevance_score: number;
  snippet: string;
}

// --- Settings ---

export interface Settings {
  anthropicKey: string;
  niaKey: string;
  enabled: boolean;
  scamDetection: boolean;
  firstLaunch: boolean;
  apiKey?: string;
  guardianEnabled?: boolean;
  elephantEnabled?: boolean;
}

// --- Entity Graph ---

export interface EntityNode {
  id: string;
  label: string;
  type: 'person' | 'topic' | 'app' | 'content' | 'place' | 'project';
  weight: number;
  firstSeen: number;
  lastSeen: number;
  contexts: string[];
  verified: boolean;
}

export interface EntityEdge {
  source: string;
  target: string;
  weight: number;
}
