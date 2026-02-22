# Mantle

## Inspiration

AI today gives answers, but not understanding.

Every AI copilot sees prompts — not behavior. It operates on isolated inputs instead of the full workflow across tools. As work becomes increasingly fragmented across email, browser tabs, Slack, CRMs, and internal dashboards, AI systems lack the persistent behavioral context needed to act intelligently.

We asked:

> What if AI could observe how you actually work and build a structured understanding over time?

Mantle was inspired by the idea that AI needs a behavioral context layer beneath everything else — a foundation that models how work actually happens.

---

## What It Does

Mantle is a local-first behavioral context engine.

It:

- Captures desktop activity (screenshots + OCR)
- Extracts structured entities (people, projects, topics, workflows)
- Builds a temporal context graph of user behavior
- Retrieves relevant past activity in real time
- Generates high-precision next-action suggestions
- Executes actions with one click

Instead of asking users what they want, Mantle predicts intent from behavioral patterns.

We model context as:

$$
G_t = (V_t, E_t)
$$

Where:
- V_t = entities (people, documents, topics, tools)
- E_t = weighted relationships over time

Suggestions are generated as:

$$
S = f(C_{current}, R(G_t))
$$

Where:
- C_{current} = live screen context  
- R(G_t) = retrieved relevant subgraph  
- S = ranked next-action suggestions  

---

## How to Start

### Prerequisites

- Node.js (v18+ recommended)
- npm or yarn

### Steps

1. **Clone the repo** (if you haven't already)
   ```bash
   git clone <repo-url>
   cd hofhacks
   ```

2. **Install dependencies**
   ```bash
   cd enk
   npm install
   ```

3. **Run Mantle**
   ```bash
   npm run dev
   ```

   Or for production build:
   ```bash
   npm run build
   npm start
   ```

4. **First launch**

   On first run, Mantle will request:
   - **Screen recording permission** (macOS: System Settings → Privacy & Security → Screen Recording)
   - **API keys** in Settings (Anthropic/Claude, Nia) for chat and context retrieval

   Open the chat window (Alt+K or via the menu bar icon) to interact with Mantle.

---

## How We Built It

### Architecture

Desktop Capture → OCR + Vision Parsing → Entity Extraction → Encrypted Local Context Graph → Semantic Retrieval → Suggestion Engine → One-Click Execution  

### Key Technical Components

**Change Detection**

To avoid redundant processing, we compute:

$$
\Delta = \frac{1}{n} \sum_{i=1}^{n} |p_i^{(t)} - p_i^{(t-1)}|
$$

We only process frames when:

$$
\Delta > \theta
$$

**Entity Validation (3+ Co-occurrence Rule)**

$$
w_{ij} =
\begin{cases}
1 & \text{if co-occurrence}(i,j) \ge 3 \\\\
0 & \text{otherwise}
\end{cases}
$$

**Temporal Decay**

To prevent graph bloat:

$$
w_{ij}(t) = w_{ij} \cdot e^{-\lambda \Delta t}
$$

**Similarity-Based Deduplication**

Merge entities when:

$$
\cos(\vec{e_1}, \vec{e_2}) > \tau
$$

All storage is encrypted and local-first by default.

---

## Challenges We Ran Into

### 1. Pixels → Structure

Screens are noisy. UI chrome, timestamps, and dynamic layouts polluted early graphs. Extracting high-signal entities required strict filtering and spatial reasoning.

### 2. Entity Deduplication

Resolving variations like:
- "Chris"
- "Christopher"
- "Telegram @ Chris"

without collapsing distinct identities required careful similarity thresholds.

### 3. Graph Entropy

Without pruning, graph density grows:

$$
|E| \sim O(n^2)
$$

We prune edges when:

$$
w_{ij}(t) < \epsilon
$$

### 4. Latency

We enforce:

$$
T_{capture} + T_{retrieval} + T_{generation} < 8s
$$

Optimizing local processing and rate-limiting vision calls was critical.

### 5. Trust

Precision matters more than recall.  
If:

$$
P(\text{correct suggestion}) < 0.7
$$

users quickly lose confidence.

---

## Accomplishments We're Proud Of

- Built a working behavioral graph from raw desktop activity
- Achieved sub-8s end-to-end suggestion pipeline
- Designed a fully encrypted, local-first architecture
- Implemented entropy control via decay and pruning
- Delivered actionable next steps — not passive summaries

Most importantly: Mantle produces suggestions that feel contextual, not generic.

---

## What We Learned

- Structure > model size.
- Behavioral data is extremely noisy — filtering is everything.
- Users accept passive capture if privacy is explicit and value is immediate.
- Long-term memory requires entropy control.
- AI without persistent behavioral graphs feels shallow.

---

## What's Next for Mantle

- Cold-start seeding via email + calendar ingestion
- Cross-device memory portability
- App-level integrations beyond screen capture
- Enterprise embedding (CRM, support, recruiting)
- Sequence-based intent modeling:

$$
P(Intent \mid Sequence_{t-n:t})
$$

Long term, Mantle becomes the foundational behavioral context layer powering AI across verticals.
