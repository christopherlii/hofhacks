import { composeMemoryBrief } from '../modules/elephant-agent/memory-brief';
import { generateSuggestions } from '../modules/elephant-agent/suggestions';
import type { CaseRecord, NowState, RetrievedCase } from '../modules/elephant-agent/types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const nowState: NowState = {
  correlation_id: 'dryrun-001',
  timestamp: Date.now(),
  app: 'Google Chrome',
  url: 'https://mail.google.com/mail/u/0/#inbox/FMfcgzQb',
  mode: 'reply',
  sender: 'Alex Doe',
  sender_domain: 'example.com',
  subject: 'Q3 contract timeline',
  snippet: 'Can you confirm if legal review is complete by Friday?',
  intent: 'approval_request',
  entities: ['Q3', 'contract'],
  recent_actions: [],
  ui_targets: ['gmail_compose_body', 'gmail_cc_field'],
  confidence: 'high'
};

const priorCase: CaseRecord = {
  case_id: 'case-001',
  correlation_id: 'prior-001',
  timestamp: Date.now() - 48 * 60 * 60 * 1000,
  state_signature: 'Google Chrome|reply|example.com|approval_request',
  now_state: nowState,
  intent: 'approval_request',
  suggestion_label: 'Insert draft reply',
  actions_taken: [
    {
      type: 'insert_text',
      args: {
        text: 'Hi Alex, thanks for the note. Legal review is in progress and I will confirm by Friday afternoon.'
      },
      reversible: true,
      verify: true
    },
    {
      type: 'add_cc',
      args: {
        email: 'legal@example.com'
      },
      reversible: true,
      verify: true
    }
  ],
  outcome: 'accepted',
  outcome_meta: {
    verification_ok: true,
    edit_distance_proxy: 24,
    source: 'dryrun'
  }
};

const retrieved: RetrievedCase[] = [{ score: 0.88, record: priorCase }];

const memoryBrief = composeMemoryBrief(retrieved);
async function main(): Promise<void> {
  const suggestions = await generateSuggestions('', nowState, retrieved);

  assert(suggestions.length > 0, 'Expected at least one suggestion');
  assert(suggestions.length <= 3, 'Suggestions should be capped at 3');

  for (const suggestion of suggestions) {
    assert(Boolean(suggestion.id), 'Suggestion id is required');
    assert(Boolean(suggestion.label), 'Suggestion label is required');
    assert(Boolean(suggestion.why), 'Suggestion why is required');
    assert(Boolean(suggestion.tool_plan?.steps?.length), 'Suggestion tool_plan requires at least one step');
  }

  console.log('--- Elephant Workflow Dry Run ---');
  console.log(`State: ${nowState.mode} | ${nowState.sender || 'Unknown sender'} | ${nowState.subject || 'No subject'}`);
  console.log('Memory brief:');
  for (const bullet of memoryBrief.bullets) {
    console.log(`- ${bullet}`);
  }
  console.log('Suggestions:');
  for (const suggestion of suggestions) {
    console.log(`- ${suggestion.label}`);
    console.log(`  Why: ${suggestion.why}`);
    console.log(`  Tool plan: ${suggestion.tool_plan.summary}`);
  }
  console.log('Schema validation: OK');
}

void main();
