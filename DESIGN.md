# CrushLearn AI — Design

## Design Philosophy
- Prove understanding before progress.
- Keep learning light, fun, and practical.
- Make AI a guide, not a crutch.
- Build for diverse learners with simple language and familiar contexts.

## UX Principles
- Fun, simple, non-intimidating
- Tap-first, swipe-first interactions
- Clear micro-goals and instant feedback
- Minimal text, maximum clarity

## Reel-Based Interaction Flow
1. **Swipe Reel (30–60s)**
   - One concept per reel
   - Short, visual, example-driven
2. **Micro-Action**
   - Quick practice: select, type, arrange, or speak
3. **AI Guided Hints (max 45%)**
   - Hint meter shows usage and cap
4. **Evaluation**
   - Pass/Fail with feedback
5. **Reinforcement**
   - Short refresh reel or alternate explanation
6. **Unlock / Adaptive Path**
   - New node unlocked or helper path opened

## 3D / Layered / Motion-Based UI Concepts
- Layered cards for reels (depth via shadows/parallax)
- Progress rings around node tiles
- Micro-animations for correct/incorrect feedback
- Subtle motion cues for next action

## Concept-Crush Map Behavior
- Graph grid with node clusters
- Each node is a micro-concept with 1–3 actions
- Failure opens helper path nodes, not penalties
- Node colors: locked, active, mastered, refresh-needed

## Chatbot UX with Hint Meter
- Always visible “Help” chip
- Hint meter with 45% cap
- Role tabs:
  - Thinking Coach
  - Mistake Mirror
  - Path Guide
- Copy-proof: disables direct answers, focuses on guidance

## Analytics & Report UI Design
### Learner Intelligence Report
- Visual cards for:
  - Learning pace curve
  - Peak learning time
  - Effort vs mastery
  - Hint dependency ratio
  - Forgetting & recovery score
  - Time-to-Mastery (primary metric)
- AI summary card: motivational and positive

### Confusion Heatmap
- Concept grid with color intensity
- Drill down into specific nodes

### Learning Story Mode
- Timeline narrative with milestones

## Accessibility & Inclusivity
- Large touch targets
- High-contrast modes
- Audio support for reels and hints
- Low-text option for non-tech learners
- Region-specific examples and language toggles

## Mobile-First Responsiveness
- Single-column flow
- 360–480px optimized layout
- Offline caching for last 3 reels

## System Flow (Textual)
1. User opens reel → fetch from S3
2. User completes micro-action → send to Lambda
3. Lambda evaluates → stores state in DynamoDB
4. Step Functions orchestrates learning loop transitions
5. Bedrock generates hints, reels, summaries
6. CloudWatch captures events for analytics dashboards

## AWS-Native Architecture (Functional)
- **Amazon Bedrock:** AI generation for reels, hints, summaries
- **AWS Lambda:** Evaluation, rules enforcement, hint gating, analytics aggregation
- **AWS Step Functions:** Orchestrates learning loop and reinforcement paths
- **DynamoDB:** Learner state, concept graph, progress, hints usage
- **Amazon S3:** Reel media and assets
- **CloudWatch:** Metrics, logs, learning analytics events
