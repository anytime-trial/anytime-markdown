-- supabase/migrations/004_trail_skill_cost.sql

-- 1. skill_models テーブル作成
CREATE TABLE IF NOT EXISTS trail_skill_models (
  skill TEXT PRIMARY KEY,
  canonical_skill TEXT,
  recommended_model TEXT NOT NULL DEFAULT 'sonnet'
);

-- 2. エイリアス解決済みビュー
CREATE OR REPLACE VIEW trail_skill_models_resolved AS
SELECT
  s.skill,
  COALESCE(
    (SELECT c.recommended_model FROM trail_skill_models c WHERE c.skill = s.canonical_skill),
    s.recommended_model
  ) AS recommended_model
FROM trail_skill_models s;

-- 3. 初期データ
-- opus
INSERT INTO trail_skill_models (skill, recommended_model) VALUES
  ('resolve-issues', 'opus'),
  ('security-review', 'opus'),
  ('superpowers:systematic-debugging', 'opus')
ON CONFLICT (skill) DO NOTHING;

-- sonnet
INSERT INTO trail_skill_models (skill, recommended_model) VALUES
  ('superpowers:brainstorming', 'sonnet'),
  ('superpowers:writing-plans', 'sonnet'),
  ('superpowers:subagent-driven-development', 'sonnet'),
  ('superpowers:executing-plans', 'sonnet'),
  ('superpowers:using-git-worktrees', 'sonnet'),
  ('superpowers:finishing-a-development-branch', 'sonnet'),
  ('superpowers:writing-skills', 'sonnet'),
  ('superpowers:requesting-code-review', 'sonnet'),
  ('superpowers:verification-before-completion', 'sonnet'),
  ('superpowers:test-driven-development', 'sonnet'),
  ('markdown-output', 'sonnet'),
  ('production-release', 'sonnet'),
  ('code-review-checklist', 'sonnet'),
  ('tech-article', 'sonnet'),
  ('design-md', 'sonnet'),
  ('daily-research', 'sonnet'),
  ('documentation-update', 'sonnet'),
  ('claude-code-guide', 'sonnet'),
  ('feature-dev', 'sonnet'),
  ('update-config', 'sonnet'),
  ('anytime-note', 'sonnet'),
  ('claude-api', 'sonnet'),
  ('weekly-research', 'sonnet'),
  ('daily-humanities-research', 'sonnet'),
  ('daily-cs-research', 'sonnet'),
  ('daily-patent-research', 'sonnet')
ON CONFLICT (skill) DO NOTHING;

-- haiku
INSERT INTO trail_skill_models (skill, recommended_model) VALUES
  ('dotfiles-commit', 'haiku'),
  ('find-skills', 'haiku'),
  ('web-search', 'haiku'),
  ('test-spec-generator', 'haiku'),
  ('brainstorming', 'haiku'),
  ('deploy-cms-remote', 'haiku'),
  ('daily-essay', 'haiku'),
  ('simplify', 'haiku'),
  ('health', 'haiku'),
  ('manual-guide', 'haiku')
ON CONFLICT (skill) DO NOTHING;

-- aliases
INSERT INTO trail_skill_models (skill, canonical_skill, recommended_model) VALUES
  ('note', 'anytime-note', 'sonnet'),
  ('release', 'production-release', 'sonnet'),
  ('writing-skills', 'superpowers:writing-skills', 'sonnet'),
  ('claude-health', 'health', 'haiku')
ON CONFLICT (skill) DO NOTHING;
