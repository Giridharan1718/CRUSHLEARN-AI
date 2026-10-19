# CrushLearn AI — Requirements

## Product Overview
CrushLearn AI is a multilingual, swipe-based microlearning platform that proves understanding before progress. It uses short reels, micro-actions, and ethical AI hints to create mastery-based learning for diverse learners across India and beyond.

## Target Users
- Students (school/college)
- Working professionals
- Homemakers
- Senior citizens
- First-generation and non-tech learners

## Problem Statement
Most learning apps enable passive consumption and time-based progress. Learners advance without true understanding, leading to frustration, drop-off, and poor transfer to real life.

## Functional Requirements
### Core Learning Loop (Mandatory)
1. Swipe Reel (30–60s)
2. Micro-Action (practice task)
3. AI Guided Hints (max 45%)
4. Evaluation
5. Reinforcement (if needed)
6. Unlock / Adaptive Path

### Understanding-Gated Progression (UGP)
- Learners cannot move forward without demonstrating understanding.
- Progress is mastery-based, not time-based.
- No skipping content and no binge-watching.

### Concept-Crush Learning Map
- Candy-Crush-style concept graph.
- Each node represents one micro-concept.
- Failure opens helper paths instead of penalizing.

### Ethical AI Chatbot (45% Hint Rule)
- AI never gives full answers.
- Hint content is capped at 45%.
- Three roles:
  - Thinking Coach (logic direction)
  - Mistake Mirror (reflect errors)
  - Path Guide (what to learn next)

### Forgetfulness-Aware Learning
- Detect forgetting via performance decline and spaced intervals.
- Inject short refresh reels automatically.

### Explain-It-Back Check
- Learner explains concept in own words.
- AI validates idea coverage, not grammar or accent.

### Confidence-Aware Difficulty
- Difficulty adapts via behavior signals:
  - hesitation time
  - retries
  - hint usage
- No emotion detection or sensitive inference.

### Extra Learning Intelligence Features
1. Learning Energy Meter (behavior-based focus estimate)
2. Real-Life Task Mode (apply learning immediately)
3. Confusion Heatmap (struggle visualization)
4. Learn Together, Fail Privately (anonymous struggle indicators)
5. Learning Story Mode (narrative learning summary)

## Non-Functional Requirements
- Mobile-first, fast, and low-bandwidth friendly
- Multilingual UI and content support
- Low cognitive load UI
- Secure storage of learner data
- Privacy-first analytics
- Scalable to hackathon demo traffic

## Learning Rules & Constraints
- No skipping reels or actions.
- No binge-watching.
- Progress unlocks only after understanding is proven.
- Reinforcement must trigger after failed evaluation.

## AI Ethics Rules
- No answer dumping.
- Hints capped at 45% content assistance.
- AI feedback must be constructive and non-judgmental.
- No profiling based on emotions, caste, religion, or sensitive traits.

## Multilingual Requirements
- Simple English as default.
- Hinglish and regional Indian languages.
- Localized examples: UPI, college projects, office Excel, government forms.
- Language selection must be obvious and reversible.

## Analytics & Reporting Requirements (Mandatory)
Generate a Learner Intelligence Report with:
- Learning pace curve
- Peak learning time
- Effort vs mastery
- Hint dependency ratio
- Forgetting & recovery score
- Time-to-Mastery (primary metric)
- AI-generated summary (positive & motivating)

Reports must be:
- Easy for students
- Understandable for parents
- Actionable for mentors

## Success Metrics
- Time-to-Mastery reduction
- Completion rate per concept node
- Hint dependency ratio decrease over time
- Retention improvement via refresh reels
- User-reported confidence gains
- Mentor satisfaction with reports
