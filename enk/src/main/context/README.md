# Context Architecture Refactor

## Current Problems

1. **Too much noise** - Entity extraction runs on every screenshot diff, creating low-value entities
2. **No intent understanding** - Extracting "what" without understanding "why"
3. **Flat relationships** - Co-occurrence ≠ meaningful connection
4. **No temporal structure** - Everything blends together without session/task boundaries
5. **No importance hierarchy** - Browsing Reddit treated same as deep work

## New Architecture

### Core Concepts

```
Session (30+ min coherent work block)
  └── Task (discrete unit of work with clear intent)
       └── Activity (app + window + time span)
            └── Entity (people, topics, projects extracted from activity)
```

### Session Detection

A session starts when:
- User returns after 30+ min away
- Major context shift (different project/domain)

A session contains:
- Start/end time
- Primary intent (what they were trying to accomplish)
- Key entities (weighted by engagement)
- Task breakdown

### Task Extraction

Instead of extracting entities from every screenshot, we:
1. Accumulate context for 2-5 minutes
2. Run a single "task extraction" that identifies:
   - What the user is trying to do (intent)
   - Who/what is involved (entities with roles)
   - How entities relate (relationships with context)

### Importance Scoring

Each entity gets an importance score based on:
- **Dwell time**: How long user engaged with it
- **Action depth**: Browsed vs created vs edited
- **Recurrence**: How often it appears across sessions
- **Centrality**: How connected to other important entities
- **Recency**: Exponential decay over time

### Relationship Quality

Instead of "A appeared with B", we track:
- **Relationship type**: working_on, researching, communicating_with, etc.
- **Confidence**: How certain we are about the relationship
- **Evidence**: What activities support this relationship
- **Strength**: Based on frequency + recency + importance

## Implementation Plan

### Phase 1: Session Detection
- Detect session boundaries
- Group activities into sessions
- Generate session summary

### Phase 2: Task Extraction
- Batch context accumulation
- Single AI call per task (not per screenshot)
- Extract intent + entities + relationships together

### Phase 3: Importance Scoring
- Implement scoring algorithm
- Use scores for graph visualization
- Decay old, unreinforced entities

### Phase 4: Relationship Quality
- Replace co-occurrence with semantic relationships
- Track evidence for each relationship
- Enable "why are these connected?" queries
