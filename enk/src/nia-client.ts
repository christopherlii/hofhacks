import { net } from 'electron';

const BASE_URL = 'https://apigcp.trynia.ai/v2';

export interface NiaContext {
  id?: string;
  title?: string;
  summary?: string;
  content?: string;
  tags?: string[];
  memory_type?: string;
  agent_source?: string;
}

export interface SaveContextParams {
  title: string;
  summary: string;
  content: string;
  tags?: string[];
  memoryType?: string;
  agentSource?: string;
}

export interface SearchOptions {
  tags?: string;
  limit?: number;
}

export interface ListOptions {
  tags?: string;
  agentSource?: string;
  limit?: number;
}

export class NiaClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  private _request(method: string, path: string, body: Record<string, unknown> | null = null, queryParams: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const qs = Object.entries(queryParams)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');

      const url = `${BASE_URL}${path}${qs ? '?' + qs : ''}`;

      const request = net.request({ method, url });
      request.setHeader('Content-Type', 'application/json');
      request.setHeader('Authorization', `Bearer ${this.apiKey}`);

      let responseData = '';
      let statusCode = 0;

      request.on('response', (response) => {
        statusCode = response.statusCode;
        response.on('data', (chunk) => { responseData += chunk.toString(); });
        response.on('end', () => {
          try {
            const data = JSON.parse(responseData);
            if (statusCode >= 400) {
              console.error(`[Nia] ${method} ${path} failed (${statusCode}):`, responseData.slice(0, 300));
              reject(new Error(`Nia API ${statusCode}: ${JSON.stringify(data)}`));
            } else {
              resolve(data);
            }
          } catch {
            if (statusCode >= 400) {
              reject(new Error(`Nia API ${statusCode}: ${responseData.slice(0, 200)}`));
            } else {
              resolve(responseData);
            }
          }
        });
      });

      request.on('error', (err: Error) => {
        console.error(`[Nia] ${method} ${path} network error:`, err.message);
        reject(err);
      });

      if (body) request.write(JSON.stringify(body));
      request.end();
    });
  }

  async saveContext({ title, summary, content, tags = [], memoryType = 'episodic', agentSource = 'enk' }: SaveContextParams): Promise<any> {
    if (!this.apiKey) throw new Error('Nia API key not set');
    return this._request('POST', '/contexts', {
      action: 'save',
      title,
      summary,
      content,
      tags,
      memory_type: memoryType,
      agent_source: agentSource,
    });
  }

  async semanticSearch(query: string, options: SearchOptions = {}): Promise<NiaContext[]> {
    if (!this.apiKey) throw new Error('Nia API key not set');
    const params: Record<string, unknown> = { q: query, limit: options.limit ?? 20 };
    if (options.tags) params.tags = options.tags;
    const data = await this._request('GET', '/contexts/semantic-search', null, params);
    return data.contexts || data.results || data || [];
  }

  async listContexts(options: ListOptions = {}): Promise<NiaContext[]> {
    if (!this.apiKey) throw new Error('Nia API key not set');
    const params: Record<string, unknown> = { limit: options.limit ?? 20 };
    if (options.tags) params.tags = options.tags;
    if (options.agentSource) params.agent_source = options.agentSource;
    const data = await this._request('GET', '/contexts', null, params);
    return data.contexts || data || [];
  }

  async updateContext(id: string, updates: Partial<Pick<NiaContext, 'title' | 'summary' | 'content' | 'tags'>>): Promise<any> {
    if (!this.apiKey) throw new Error('Nia API key not set');
    return this._request('PUT', `/contexts/${id}`, updates as Record<string, unknown>);
  }

  async deleteContext(id: string): Promise<any> {
    if (!this.apiKey) throw new Error('Nia API key not set');
    return this._request('DELETE', `/contexts/${id}`);
  }
}
