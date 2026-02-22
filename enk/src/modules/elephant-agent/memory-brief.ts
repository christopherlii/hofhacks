import type { MemoryBrief, RetrievedCase } from './types';

function formatAge(timestamp: number): string {
  const ageMs = Date.now() - timestamp;
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function composeMemoryBrief(cases: RetrievedCase[]): MemoryBrief {
  const bullets: string[] = [];

  if (cases.length === 0) {
    bullets.push('No prior similar cases matched this context yet.');
    bullets.push('Start with a safe suggestion or search similar history.');
    bullets.push('Your actions here will improve future suggestions.');
    return { bullets };
  }

  const mostSimilar = cases[0];
  bullets.push(
    `Most similar: ${mostSimilar.record.suggestion_label || mostSimilar.record.intent} (${formatAge(mostSimilar.record.timestamp)}).`
  );

  const actionCounts = new Map<string, number>();
  for (const entry of cases) {
    for (const action of entry.record.actions_taken) {
      actionCounts.set(action.type, (actionCounts.get(action.type) || 0) + 1);
    }
  }

  if (actionCounts.size > 0) {
    const mostCommonAction = [...actionCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    bullets.push(`Common next step: ${mostCommonAction[0].replace(/_/g, ' ')} (seen ${mostCommonAction[1]} times).`);
  }

  const bestOutcome = cases.find((entry) => entry.record.outcome === 'accepted' || entry.record.outcome === 'edited');
  if (bestOutcome) {
    bullets.push(`Best outcome: ${bestOutcome.record.outcome} via "${bestOutcome.record.suggestion_label}".`);
  }

  while (bullets.length < 3) {
    bullets.push('Low confidence areas are kept manual for safety.');
  }

  return { bullets: bullets.slice(0, 3) };
}

export { composeMemoryBrief };
