# Context Architecture

## Overview

The context engine transforms raw computer activity (screenshots, OCR, app usage) into a structured user model that apps can consume.

```
Raw Activity → Entity Extraction → Graph Storage → User Model → App API
```

## Core Concepts

### Entity Types
- **person** - People the user interacts with
- **project** - Named projects, repos, ongoing work
- **topic** - Subjects the user is interested in
- **content** - Specific articles, videos, documents
- **skill** - Tools, languages, technologies
- **app** - Applications used
- **place** - Locations
- **goal** - Plans, intentions, aspirations

### Relationship Types
- **working_on** - Person actively working on a project
- **collaborating_with** - People working together
- **interested_in** - Clear interest in a topic
- **uses** - Uses a tool/skill
- **related_to** - General association

## User Model API

The primary interface for apps consuming context. Apps call these methods instead of querying the raw graph.

### getUserModel()
Complete user model in one call:
```typescript
{
  topPeople: PersonEntity[],      // Who they work with
  activeProjects: ProjectEntity[], // What they're working on
  expertise: SkillEntity[],        // What they know
  workPatterns: WorkPatterns,      // How they work
  currentFocus: { task, entities, confidence },
  dataQuality: 'sparse' | 'moderate' | 'rich',
}
```

### getCurrentContext()
What's happening right now:
```typescript
{
  app: string,
  task: string,                    // "Coding: enk/graph/service.ts"
  intent: 'creating' | 'researching' | 'communicating' | 'consuming' | 'navigating',
  focusDepth: number,              // 0-1, flow state indicator
  activeProject: ProjectEntity | null,
  activePeople: PersonEntity[],
  contextDurationMs: number,
  confidence: 'low' | 'medium' | 'high',
}
```

### getTopPeople(limit?)
People the user interacts with most:
```typescript
{
  id: string,
  name: string,
  relationship: 'collaborator' | 'manager' | 'friend' | 'contact' | 'mentor',
  context: 'work' | 'social' | 'learning' | ...,
  lastInteraction: number,
  interactionCount: number,
  communicationChannels: string[],  // ['slack', 'email', 'messages']
  sharedProjects: string[],
  salience: number,
}
```

### getActiveProjects(limit?)
Projects the user is working on:
```typescript
{
  id: string,
  name: string,
  status: 'active' | 'paused' | 'completed',
  lastActivity: number,
  totalEngagementMs: number,
  recentEngagementMs: number,
  relatedPeople: string[],
  relatedTools: string[],
  salience: number,
}
```

### getExpertise(limit?)
Skills and tools the user knows:
```typescript
{
  id: string,
  name: string,
  proficiency: number,             // 0-1
  totalEngagementMs: number,
  lastUsed: number,
  trend: 'increasing' | 'stable' | 'decreasing' | 'new',
  relatedProjects: string[],
}
```

### getTaskBlocks(limit?)
Activity grouped into coherent work sessions:
```typescript
{
  id: string,
  label: string,                   // "Working on Enk context engine"
  intent: string,                  // "coding", "researching", "communicating"
  startTime: number,
  endTime: number,
  durationMs: number,
  apps: string[],
  entities: string[],
  project: string | null,
  people: string[],
  focusScore: number,              // 0-1
  confidence: 'low' | 'medium' | 'high',
}
```

### getTimeline(fromMs, toMs)
Task blocks for a date range.

### getDaySummary(dateMs?)
Summary of a day's activity:
```typescript
{
  date: string,
  totalActiveMs: number,
  topApps: { app, durationMs }[],
  topProjects: ProjectEntity[],
  topPeople: PersonEntity[],
  taskBlocks: TaskBlock[],
  focusScore: number,
}
```

### searchEntities(query, limit?)
Search entities by name.

### getRelatedEntities(entityId, limit?)
Find entities semantically related to a given entity.

## Architecture

```
src/main/graph/
├── api.ts           # Factory + API surface
├── service.ts       # GraphService class (core logic)
├── entity-store.ts  # Entity/edge storage + deduplication
├── extraction.ts    # Rule-based + AI entity extraction
├── enrichment.ts    # Salience, roles, trends, context
├── maintenance.ts   # Decay, cleanup, Nia edge building
├── queries.ts       # Low-level graph queries
└── user-model.ts    # User model computation (semantic layer)
```

## Data Flow

1. **Capture** - Screenshots taken periodically
2. **OCR** - Text extracted from screenshots
3. **Activity Tracking** - App/window/URL logged
4. **Entity Extraction** - Rule-based + AI extraction
5. **Graph Storage** - Entities and relationships stored
6. **Signal Recording** - Engagement time, sessions tracked
7. **Enrichment** - Salience, roles, context computed
8. **User Model** - Semantic queries derive meaning from graph

## Enrichment Properties

Each entity node gets computed properties:

- **salience** (0-1) - How important to the user right now
- **role** - User's relationship: creator, consumer, learner, collaborator
- **engagementTrend** - increasing, stable, decreasing, new
- **primaryContext** - work, learning, entertainment, social
- **proficiency** (for skills) - 0-1 based on usage time

## IPC API

All User Model methods are exposed via IPC:

```typescript
// From renderer
window.enk.getUserModel()
window.enk.getCurrentContext()
window.enk.getTopPeople(10)
window.enk.getActiveProjects()
window.enk.getExpertise()
window.enk.getTaskBlocks(20)
window.enk.getTimeline(fromMs, toMs)
window.enk.searchEntities("query")
window.enk.getDaySummary()
```

## Design Principles

1. **Apps get answers, not graphs** - The API returns semantic structures, not raw nodes/edges
2. **Compute on demand** - User model derived from graph, not stored separately
3. **Confidence everywhere** - Every output includes confidence indicators
4. **Privacy first** - All data local, no external calls except user-configured AI
5. **Quality over quantity** - Better to return 5 confident entities than 50 noisy ones
