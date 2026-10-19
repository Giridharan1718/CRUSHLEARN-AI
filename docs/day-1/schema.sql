-- ============================================================================
-- CrushLearn AI — Draft PostgreSQL schema
--
-- STATUS: DESIGN DRAFT. NOT EXECUTED. NOT VERIFIED.
-- Target: PostgreSQL 15+
-- Companion: docs/day-1/ARCHITECTURE.md
--
-- This file is a proposal for Phase 2. It is not used by the current Vite app.
-- Do not treat it as a migration that has passed review.
--
-- Design rules reflected here:
--   * UUID primary keys; human slugs are scoped to their parent.
--   * Objectives are reusable across courses and form a prerequisite DAG.
--   * Activities are typed; assessments extend graded activities.
--   * Attempts and evidence are append-only.
--   * Mastery thresholds and hint rules are data, not constants.
--   * The current learner state is a projection that can be rebuilt.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

create type user_role as enum ('learner', 'author', 'reviewer', 'admin');
create type course_status as enum ('draft', 'published', 'archived');
create type enrollment_status as enum ('active', 'completed', 'dropped');

create type activity_kind as enum (
  'explanation',
  'demonstration',
  'guided_practice',
  'independent_practice',
  'retrieval_quiz',
  'error_review',
  'project',
  'transfer_task'
);

create type assessment_kind as enum ('diagnostic', 'practice', 'mastery', 'review', 'project');
create type question_kind as enum (
  'single_choice',
  'multi_choice',
  'numeric',
  'short_text',
  'long_text',
  'code',
  'file',
  'rubric'
);

create type lesson_state as enum (
  'not_started',
  'in_progress',
  'mastery_pending',
  'mastered',
  'completed',
  'review_due'
);

create type activity_progress_status as enum ('not_started', 'viewed', 'completed');

create type attempt_status as enum ('in_progress', 'submitted', 'scored', 'voided');

create type evidence_state as enum (
  'not_assessed',
  'needs_practice',
  'developing',
  'demonstrated',
  'review_recommended'
);

create type evaluator_type as enum ('auto', 'human', 'ai_assisted');

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  display_name text not null,
  role user_role not null default 'learner',
  password_hash text,                       -- null when SSO-only; Argon2id otherwise
  locale text not null default 'en',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Course structure
-- ---------------------------------------------------------------------------

create table courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subject text not null,
  description text not null default '',
  level text,
  status course_status not null default 'draft',
  version integer not null default 1 check (version > 0),
  default_mastery_threshold numeric(5,2) not null default 80
    check (default_mastery_threshold between 0 and 100),
  default_practice_ratio numeric(4,3) not null default 0.800
    check (default_practice_ratio between 0 and 1),
  created_by uuid references users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  slug text not null,
  title text not null,
  description text not null default '',
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, slug),
  unique (course_id, position)
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references modules(id) on delete cascade,
  slug text not null,
  title text not null,
  summary text not null default '',
  position integer not null check (position >= 0),
  estimated_minutes integer not null default 15 check (estimated_minutes > 0),
  concept_ratio numeric(4,3) not null default 0.200
    check (concept_ratio between 0 and 1),
  is_published boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, slug),
  unique (module_id, position)
);

-- ---------------------------------------------------------------------------
-- Objectives and prerequisites
-- ---------------------------------------------------------------------------

create table learning_objectives (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  code text not null,
  title text not null,
  description text not null default '',
  difficulty smallint not null default 1 check (difficulty between 1 and 5),
  created_at timestamptz not null default now(),
  unique (subject, code)
);

create table objective_prerequisites (
  objective_id uuid not null references learning_objectives(id) on delete cascade,
  prerequisite_objective_id uuid not null references learning_objectives(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (objective_id, prerequisite_objective_id),
  check (objective_id <> prerequisite_objective_id)
);

-- Cycle detection is enforced by the application/content validator.
-- A recursive query is used to reject edges that would create a cycle.

create table course_objectives (
  course_id uuid not null references courses(id) on delete cascade,
  objective_id uuid not null references learning_objectives(id) on delete cascade,
  is_required boolean not null default true,
  primary key (course_id, objective_id)
);

create table lesson_objectives (
  lesson_id uuid not null references lessons(id) on delete cascade,
  objective_id uuid not null references learning_objectives(id) on delete cascade,
  is_primary boolean not null default false,
  primary key (lesson_id, objective_id)
);

create unique index lesson_one_primary_objective_idx
  on lesson_objectives (lesson_id)
  where is_primary;

-- ---------------------------------------------------------------------------
-- Mastery policy
-- ---------------------------------------------------------------------------

create table mastery_policies (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  objective_id uuid references learning_objectives(id) on delete cascade,
  threshold numeric(5,2) not null default 80 check (threshold between 0 and 100),
  min_evidence integer not null default 2 check (min_evidence >= 1),
  hints_allowed boolean not null default false,
  require_apply boolean not null default false,
  rule_version text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table mastery_policies is
  'Resolution order: objective-specific > course-specific > global (both null). '
  'Every mastery result stores the resolved rule_version. Old policies remain as '
  'history; only one active policy may exist per scope.';

create unique index mastery_policy_global_active_idx
  on mastery_policies (is_active)
  where is_active and course_id is null and objective_id is null;

create unique index mastery_policy_course_active_idx
  on mastery_policies (course_id)
  where is_active and course_id is not null and objective_id is null;

create unique index mastery_policy_objective_active_idx
  on mastery_policies (objective_id)
  where is_active and objective_id is not null and course_id is null;

create unique index mastery_policy_scoped_active_idx
  on mastery_policies (course_id, objective_id)
  where is_active and course_id is not null and objective_id is not null;

-- ---------------------------------------------------------------------------
-- Activities and assessments
-- ---------------------------------------------------------------------------

create table activities (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  kind activity_kind not null,
  position integer not null check (position >= 0),
  title text not null,
  instructions text not null default '',
  config jsonb not null default '{}'::jsonb,
  estimated_minutes integer not null default 5 check (estimated_minutes > 0),
  is_graded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, position)
);

create table assessments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null unique references activities(id) on delete cascade,
  kind assessment_kind not null,
  passing_score numeric(5,2) not null default 80
    check (passing_score between 0 and 100),
  max_attempts integer check (max_attempts is null or max_attempts > 0),
  time_limit_seconds integer check (time_limit_seconds is null or time_limit_seconds > 0),
  hints_allowed boolean not null default true,
  mastery_policy_id uuid references mastery_policies(id) on delete set null,
  created_at timestamptz not null default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  objective_id uuid references learning_objectives(id) on delete set null,
  position integer not null check (position >= 0),
  kind question_kind not null,
  prompt text not null,
  options jsonb,                 -- choices, constraints, starter code, etc.
  answer_key jsonb,              -- server-only; null for rubric/evaluator-graded work
  explanation text not null default '',
  difficulty smallint not null default 1 check (difficulty between 1 and 5),
  points numeric(6,2) not null default 1 check (points > 0),
  created_at timestamptz not null default now(),
  unique (assessment_id, position)
);

comment on column questions.answer_key is
  'Never include this column in a learner-facing API payload.';

-- ---------------------------------------------------------------------------
-- Rubrics and projects
-- ---------------------------------------------------------------------------

create table rubrics (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null unique references activities(id) on delete cascade,
  title text not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now()
);

create table rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references rubrics(id) on delete cascade,
  position integer not null check (position >= 0),
  title text not null,
  description text not null default '',
  max_points numeric(6,2) not null default 1 check (max_points > 0),
  weight numeric(5,4) not null default 1 check (weight > 0),
  unique (rubric_id, position)
);

-- ---------------------------------------------------------------------------
-- Enrollment and progress
-- ---------------------------------------------------------------------------

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  status enrollment_status not null default 'active',
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (learner_id, course_id)
);

create table lesson_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  state lesson_state not null default 'not_started',
  started_at timestamptz,
  mastery_verified_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (enrollment_id, lesson_id)
);

create table activity_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  status activity_progress_status not null default 'not_started',
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (enrollment_id, activity_id)
);

-- ---------------------------------------------------------------------------
-- Attempts
-- ---------------------------------------------------------------------------

create table attempts (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references users(id) on delete cascade,
  assessment_id uuid not null references assessments(id) on delete cascade,
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  status attempt_status not null default 'in_progress',
  score numeric(5,2) check (score is null or score between 0 and 100),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  hint_count integer not null default 0 check (hint_count >= 0),
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index attempts_idempotency_idx
  on attempts (learner_id, idempotency_key)
  where idempotency_key is not null;

create table attempt_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  response jsonb,
  is_correct boolean,
  points_awarded numeric(6,2) check (points_awarded is null or points_awarded >= 0),
  error_category text,
  time_ms integer check (time_ms is null or time_ms >= 0),
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- ---------------------------------------------------------------------------
-- Project submissions
-- ---------------------------------------------------------------------------

create table project_submissions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  learner_id uuid not null references users(id) on delete cascade,
  attempt_id uuid references attempts(id) on delete set null,
  artifact_url text,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'evaluated', 'returned')),
  submitted_at timestamptz not null default now()
);

create table project_evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references project_submissions(id) on delete cascade,
  rubric_id uuid not null references rubrics(id) on delete restrict,
  evaluator_type evaluator_type not null,
  evaluator_id uuid references users(id) on delete set null,
  scores jsonb not null default '{}'::jsonb,
  total_score numeric(6,2) not null default 0 check (total_score >= 0),
  feedback text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Evidence ledger and derived state
-- ---------------------------------------------------------------------------

create table evidence_events (
  id bigserial primary key,
  learner_id uuid not null references users(id) on delete cascade,
  objective_id uuid not null references learning_objectives(id) on delete cascade,
  attempt_id uuid references attempts(id) on delete cascade,
  project_evaluation_id uuid references project_evaluations(id) on delete cascade,
  state evidence_state not null,
  score numeric(5,2) check (score is null or score between 0 and 100),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  rule_version text not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(attempt_id, project_evaluation_id) = 1)
);

-- Append-only by policy: the application DB role must not have UPDATE/DELETE on
-- evidence_events. Corrections are new events, not edits.

create table learner_objective_states (
  learner_id uuid not null references users(id) on delete cascade,
  objective_id uuid not null references learning_objectives(id) on delete cascade,
  state evidence_state not null default 'not_assessed',
  best_score numeric(5,2) check (best_score is null or best_score between 0 and 100),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  last_evidence_at timestamptz,
  mastered_at timestamptz,
  rule_version text,
  updated_at timestamptz not null default now(),
  primary key (learner_id, objective_id)
);

-- This table is a projection rebuilt from evidence_events. It is not the
-- source of truth and may be regenerated after a rule or data correction.

-- ---------------------------------------------------------------------------
-- Spaced repetition and hints
-- ---------------------------------------------------------------------------

create table review_items (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references users(id) on delete cascade,
  objective_id uuid not null references learning_objectives(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete set null,
  ease_factor numeric(4,2) not null default 2.50 check (ease_factor >= 1.30),
  interval_days integer not null default 1 check (interval_days >= 1),
  repetitions integer not null default 0 check (repetitions >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  quality_last smallint check (quality_last between 0 and 5),
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (learner_id, objective_id)
);

create table hint_events (
  id bigserial primary key,
  learner_id uuid not null references users(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  attempt_id uuid references attempts(id) on delete set null,
  level smallint not null check (level between 1 and 3),
  revealed_steps integer not null default 0 check (revealed_steps >= 0),
  total_steps integer not null default 0 check (total_steps >= 0),
  content_hash text not null,
  created_at timestamptz not null default now(),
  check (revealed_steps <= total_steps)
);

-- ---------------------------------------------------------------------------
-- Certificates and AI audit (optional)
-- ---------------------------------------------------------------------------

create table certificates (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  issued_at timestamptz not null default now(),
  verification_code text not null unique,
  status text not null default 'issued' check (status in ('issued', 'revoked')),
  mastery_snapshot jsonb not null default '{}'::jsonb,
  unique (learner_id, course_id)
);

create table ai_interactions (
  id bigserial primary key,
  learner_id uuid not null references users(id) on delete cascade,
  activity_id uuid references activities(id) on delete set null,
  role text not null check (role in ('thinking_coach', 'mistake_mirror', 'path_guide')),
  prompt_hash text not null,
  response text not null,
  grounded_refs jsonb not null default '[]'::jsonb,
  model text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index modules_course_idx on modules (course_id);
create index lessons_module_idx on lessons (module_id);
create index activities_lesson_idx on activities (lesson_id);
create index questions_assessment_idx on questions (assessment_id);
create index questions_objective_idx on questions (objective_id);

create index course_objectives_objective_idx on course_objectives (objective_id);
create index lesson_objectives_objective_idx on lesson_objectives (objective_id);
create index objective_prerequisites_prereq_idx
  on objective_prerequisites (prerequisite_objective_id);

create index enrollments_learner_idx on enrollments (learner_id);
create index lesson_progress_enrollment_idx on lesson_progress (enrollment_id);
create index activity_progress_enrollment_idx on activity_progress (enrollment_id);

create index attempts_learner_idx on attempts (learner_id, created_at desc);
create index attempts_assessment_idx on attempts (assessment_id);
create index attempt_responses_attempt_idx on attempt_responses (attempt_id);

create index evidence_events_learner_objective_idx
  on evidence_events (learner_id, objective_id, created_at desc);
create index evidence_events_attempt_idx on evidence_events (attempt_id);

create index review_items_due_idx on review_items (learner_id, due_at);
create index hint_events_learner_idx on hint_events (learner_id, created_at desc);

create index project_submissions_activity_idx on project_submissions (activity_id);
create index project_submissions_learner_idx on project_submissions (learner_id);
create index project_evaluations_submission_idx
  on project_evaluations (submission_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

create trigger courses_set_updated_at
  before update on courses
  for each row execute function set_updated_at();

create trigger modules_set_updated_at
  before update on modules
  for each row execute function set_updated_at();

create trigger lessons_set_updated_at
  before update on lessons
  for each row execute function set_updated_at();

create trigger activities_set_updated_at
  before update on activities
  for each row execute function set_updated_at();

create trigger lesson_progress_set_updated_at
  before update on lesson_progress
  for each row execute function set_updated_at();

create trigger activity_progress_set_updated_at
  before update on activity_progress
  for each row execute function set_updated_at();

create trigger learner_objective_states_set_updated_at
  before update on learner_objective_states
  for each row execute function set_updated_at();

create trigger review_items_set_updated_at
  before update on review_items
  for each row execute function set_updated_at();

-- ============================================================================
-- End of draft.
--
-- Before this becomes a real migration:
--   1. Review with PostgreSQL 15/16.
--   2. Add reversible `down` migrations or use a migration tool.
--   3. Add seed/import scripts for validated course content.
--   4. Add DB roles that enforce append-only evidence.
--   5. Add integration tests for every constraint and transaction.
--   6. Decide retention/deletion policy for PII and AI logs.
-- ============================================================================
