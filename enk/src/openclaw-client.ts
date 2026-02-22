import { net } from 'electron';

export interface OpenClawConfig {
  host?: string;        // Default: 127.0.0.1
  port?: number;        // Default: 18789
  token?: string;       // Gateway auth token
  agentId?: string;     // Default: main
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenClawClient {
  private host: string;
  private port: number;
  private token: string;
  private agentId: string;

  constructor(config: OpenClawConfig = {}) {
    this.host = config.host || '127.0.0.1';
    this.port = config.port || 18789;
    this.token = config.token || '';
    this.agentId = config.agentId || 'main';
  }

  setToken(token: string): void {
    this.token = token;
  }

  setAgentId(agentId: string): void {
    this.agentId = agentId;
  }

  private get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  /**
   * Send a message to the OpenClaw agent and get a response
   */
  async chat(
    message: string,
    options: {
      sessionId?: string;      // Use same sessionId for conversation continuity
      systemPrompt?: string;
      stream?: boolean;
    } = {}
  ): Promise<ChatResponse> {
    const messages: ChatMessage[] = [];
    
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    
    messages.push({ role: 'user', content: message });

    return this.chatCompletions(messages, options);
  }

  /**
   * Send a multi-turn conversation
   */
  async chatCompletions(
    messages: ChatMessage[],
    options: {
      sessionId?: string;
      stream?: boolean;
    } = {}
  ): Promise<ChatResponse> {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}/v1/chat/completions`;
      
      const body = {
        model: `openclaw:${this.agentId}`,
        messages,
        stream: options.stream || false,
        user: options.sessionId,  // Used for session continuity
      };

      const request = net.request({
        method: 'POST',
        url,
      });

      request.setHeader('Content-Type', 'application/json');
      if (this.token) {
        request.setHeader('Authorization', `Bearer ${this.token}`);
      }
      request.setHeader('x-openclaw-agent-id', this.agentId);

      let responseData = '';
      let statusCode = 0;

      request.on('response', (response) => {
        statusCode = response.statusCode;
        
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        response.on('end', () => {
          if (statusCode >= 400) {
            console.error(`[OpenClaw] Chat failed (${statusCode}):`, responseData.slice(0, 500));
            reject(new Error(`OpenClaw API ${statusCode}: ${responseData.slice(0, 200)}`));
            return;
          }

          try {
            const data = JSON.parse(responseData);
            resolve(data);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${responseData.slice(0, 200)}`));
          }
        });
      });

      request.on('error', (err: Error) => {
        console.error('[OpenClaw] Network error:', err.message);
        reject(err);
      });

      request.write(JSON.stringify(body));
      request.end();
    });
  }

  /**
   * Ask the agent to do something and get the result
   * Convenience wrapper with better error handling
   */
  async ask(prompt: string, sessionId?: string): Promise<string> {
    try {
      const response = await this.chat(prompt, { sessionId });
      return response.choices?.[0]?.message?.content || '';
    } catch (error) {
      console.error('[OpenClaw] Ask failed:', error);
      throw error;
    }
  }

  /**
   * Send a context-aware prompt about the current user activity
   */
  async analyzeActivity(context: {
    app: string;
    title: string;
    url?: string;
    content?: string;
    question: string;
  }): Promise<string> {
    const prompt = `Current context:
- App: ${context.app}
- Title: ${context.title}
${context.url ? `- URL: ${context.url}` : ''}
${context.content ? `- Content: ${context.content.slice(0, 500)}` : ''}

${context.question}`;

    return this.ask(prompt);
  }

  /**
   * Check if the gateway is reachable
   */
  async ping(): Promise<boolean> {
    return new Promise((resolve) => {
      const request = net.request({
        method: 'GET',
        url: `${this.baseUrl}/health`,
      });

      request.on('response', (response) => {
        resolve(response.statusCode === 200);
      });

      request.on('error', () => {
        resolve(false);
      });

      request.end();
    });
  }
}

// Default instance
let defaultClient: OpenClawClient | null = null;

export function getOpenClawClient(config?: OpenClawConfig): OpenClawClient {
  if (!defaultClient) {
    defaultClient = new OpenClawClient(config);
  } else if (config) {
    if (config.token) defaultClient.setToken(config.token);
    if (config.agentId) defaultClient.setAgentId(config.agentId);
  }
  return defaultClient;
}