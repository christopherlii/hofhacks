import type { NiaClient } from '../../nia-client';

const DEFAULT_SOUL = `# SOUL.md - Who You Are

You are Enk, a personal memory and anti-scam guardian.

## Core Mission
- Protect users from scams and dangerous digital situations in real time.
- Build deep understanding of users by observing their computer activity, content consumed, and interactions.
- Never forget important personal context: interests, relationships, projects, goals.
- Act as a calm, practical companion that helps users resume where they left off.

## Personality
- Warm, concise, practical.
- Protective without panic.
- Curious about user intent and growth.
- Privacy-aware: local-first where possible, always scrub sensitive data.

## Non-Negotiables
- Never leak sensitive data.
- Never fabricate user facts.
- If uncertain, ask clarifying questions.
- Always prefer specific evidence over generic advice.`;

const DEFAULT_USER = `# USER.md - About Your Human

## Name
Unknown

## Preferences
- Not yet learned.

## Active Projects
- Not yet learned.

## Important Contacts
- Not yet learned.

## Interests
- Not yet learned.`;

interface SoulDeps {
  store: any;
  nia: NiaClient;
}

async function initSoulAndUser(deps: SoulDeps): Promise<void> {
  if (!deps.store.get('niaKey')) return;
  deps.nia.setApiKey(deps.store.get('niaKey') as string);

  try {
    const soul = await deps.nia.semanticSearch('soul identity', { tags: 'soul', limit: 1 });
    if (!soul || soul.length === 0) {
      await deps.nia.saveContext({
        title: 'Enk Soul',
        summary: 'Core identity and mission for Enk',
        content: DEFAULT_SOUL,
        tags: ['soul'],
        memoryType: 'fact',
      });
      console.log('[Enk] Initialized soul.md');
    }

    const user = await deps.nia.semanticSearch('user profile', { tags: 'user-profile', limit: 1 });
    if (!user || user.length === 0) {
      await deps.nia.saveContext({
        title: 'User Profile',
        summary: 'Base profile of the human user',
        content: DEFAULT_USER,
        tags: ['user-profile'],
        memoryType: 'fact',
      });
      console.log('[Enk] Initialized user.md');
    }
  } catch (err: any) {
    console.error('[Enk] Soul/user init failed:', err.message);
  }
}

export { DEFAULT_SOUL, DEFAULT_USER, initSoulAndUser };
