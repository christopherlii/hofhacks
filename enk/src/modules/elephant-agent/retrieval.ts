import * as nia from '../nia';

import { createStateSignature, queryCaseRecords } from './nia-case-store';
import type { CaseRecord, NowState, RetrievedCase } from './types';

interface RetrievalResult {
  records: RetrievedCase[];
  metadata: {
    embedding_supported: boolean;
    sender_domain_query: string | null;
    intent_query: string;
    fallback_nodes: number;
  };
}

function toFallbackCase(nowState: NowState, node: any, score: number): RetrievedCase {
  const record: CaseRecord = {
    case_id: `fallback-${node.session_id}`,
    correlation_id: nowState.correlation_id,
    timestamp: Number(node.timestamp || Date.now()),
    state_signature: createStateSignature(nowState),
    now_state: {
      ...nowState,
      app: node.app || nowState.app,
      subject: node.task_label || nowState.subject,
      sender: nowState.sender,
      sender_domain: nowState.sender_domain
    },
    intent: nowState.intent,
    suggestion_label: node.task_label || 'Historical memory node',
    actions_taken: [],
    outcome: 'unknown',
    outcome_meta: {
      source: 'nia-node'
    }
  };

  return { record, score };
}

async function retrieveCases(nowState: NowState, topK = 8): Promise<RetrievalResult> {
  const direct = queryCaseRecords(nowState, topK);
  const records = [...direct.records];

  const queries = [
    `${nowState.sender_domain || ''} ${nowState.intent}`.trim(),
    `${nowState.subject || ''}`.trim(),
    `${(nowState.entities || []).join(' ')}`.trim()
  ].filter((query) => query.length > 0);

  let fallbackNodes: any[] = [];
  if (queries.length > 0) {
    try {
      fallbackNodes = await nia.query(queries);
    } catch {
      fallbackNodes = [];
    }
  }

  const existingIds = new Set(records.map((entry) => entry.record.case_id));
  for (const node of fallbackNodes.slice(0, topK)) {
    const fallback = toFallbackCase(nowState, node, Math.min(0.45, Number(node.relevance_score || 0.2)));
    if (!existingIds.has(fallback.record.case_id)) {
      existingIds.add(fallback.record.case_id);
      records.push(fallback);
    }
  }

  records.sort((a, b) => b.score - a.score);

  return {
    records: records.slice(0, topK),
    metadata: {
      embedding_supported: direct.embedding_supported,
      sender_domain_query: nowState.sender_domain,
      intent_query: nowState.intent,
      fallback_nodes: fallbackNodes.length
    }
  };
}

export type { RetrievalResult };
export { retrieveCases };
