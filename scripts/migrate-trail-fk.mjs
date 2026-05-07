#!/usr/bin/env node
/**
 * 既存 SQLite DB に対し、trail-core/src/domain/schema/tables.ts と同じ
 * STRICT + 拡張 FK + CHECK + ON DELETE CASCADE 付き DDL でテーブルを再作成する。
 * 公式 12-step テーブル再作成パターンを使うのでデータは保持する。
 *
 * 使い方:
 *   node scripts/migrate-trail-fk.mjs <db-path>
 *
 * 注意:
 * - 既存データが新 CHECK 制約に違反する場合 (例: timestamp の型不一致、
 *   not-0/1 boolean、不正 JSON) はトランザクション全体がロールバックされ、
 *   元 DB は無傷のまま終わる。
 * - PRAGMA foreign_key_check で違反が出ても警告のみで COMMIT は通る (orphan)。
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dbPath = process.argv[2];
if (!dbPath) {
  console.error("Usage: node scripts/migrate-trail-fk.mjs <db-path>");
  process.exit(1);
}

const abs = path.resolve(dbPath);
if (!fs.existsSync(abs)) {
  console.error("DB not found:", abs);
  process.exit(1);
}

const bak = abs + ".bak-" + Date.now();
fs.copyFileSync(abs, bak);
console.log("backup ->", bak);

const db = new Database(abs);

const FK_DEFS = [
  {
    name: "sessions",
    columns: ["id","slug","repo_name","version","entrypoint","model","start_time","end_time","message_count","file_path","file_size","imported_at","commits_resolved_at","peak_context_tokens","initial_context_tokens","git_branch","interruption_reason","interruption_context_tokens","message_commits_resolved_at","source"],
    ddl: `CREATE TABLE sessions__new (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL DEFAULT '',
      repo_name TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      entrypoint TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      message_count INTEGER NOT NULL DEFAULT 0,
      file_path TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT '',
      commits_resolved_at TEXT,
      peak_context_tokens INTEGER,
      initial_context_tokens INTEGER,
      git_branch TEXT,
      interruption_reason TEXT,
      interruption_context_tokens INTEGER,
      message_commits_resolved_at TEXT,
      source TEXT NOT NULL DEFAULT 'claude_code'
        CHECK (source IN ('claude_code', 'codex', 'gemini', 'cursor', 'other'))
    ) STRICT`,
  },
  {
    name: "session_costs",
    columns: ["session_id","model","input_tokens","output_tokens","cache_read_tokens","cache_creation_tokens","estimated_cost_usd"],
    ddl: `CREATE TABLE session_costs__new (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, model)
    ) STRICT`,
  },
  {
    name: "daily_counts",
    columns: ["date","kind","key","count","tokens","input_tokens","output_tokens","cache_read_tokens","cache_creation_tokens","duration_ms","estimated_cost_usd"],
    ddl: `CREATE TABLE daily_counts__new (
      date TEXT NOT NULL,
      kind TEXT NOT NULL
        CHECK (kind IN ('cost_actual','cost_skill','tool','skill','error','model','message','subagent_type')),
      key TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      tokens INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date, kind, key)
    ) STRICT`,
  },
  {
    name: "messages",
    columns: ["uuid","session_id","parent_uuid","type","subtype","text_content","user_content","tool_calls","tool_use_result","model","request_id","stop_reason","input_tokens","output_tokens","cache_read_tokens","cache_creation_tokens","service_tier","speed","timestamp","is_sidechain","is_meta","cwd","git_branch","permission_mode","skill","agent_id","source_tool_assistant_uuid","source_tool_use_id","system_command","duration_ms","tool_result_size","agent_description","agent_model","subagent_type"],
    ddl: `CREATE TABLE messages__new (
      uuid TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      parent_uuid TEXT REFERENCES messages(uuid) ON DELETE SET NULL,
      type TEXT NOT NULL,
      subtype TEXT,
      text_content TEXT,
      user_content TEXT,
      tool_calls TEXT,
      tool_use_result TEXT,
      model TEXT,
      request_id TEXT,
      stop_reason TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      service_tier TEXT,
      speed TEXT,
      timestamp TEXT NOT NULL DEFAULT '',
      is_sidechain INTEGER NOT NULL DEFAULT 0 CHECK (is_sidechain IN (0,1)),
      is_meta INTEGER NOT NULL DEFAULT 0 CHECK (is_meta IN (0,1)),
      cwd TEXT,
      git_branch TEXT,
      permission_mode TEXT,
      skill TEXT,
      agent_id TEXT,
      source_tool_assistant_uuid TEXT REFERENCES messages(uuid) ON DELETE SET NULL,
      source_tool_use_id TEXT,
      system_command TEXT,
      duration_ms INTEGER,
      tool_result_size INTEGER,
      agent_description TEXT,
      agent_model TEXT,
      subagent_type TEXT
    ) STRICT`,
  },
  {
    name: "session_commits",
    columns: ["session_id","commit_hash","commit_message","author","committed_at","is_ai_assisted","files_changed","lines_added","lines_deleted","repo_name"],
    ddl: `CREATE TABLE session_commits__new (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      commit_hash TEXT NOT NULL,
      commit_message TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      committed_at TEXT NOT NULL DEFAULT '',
      is_ai_assisted INTEGER NOT NULL DEFAULT 0 CHECK (is_ai_assisted IN (0,1)),
      files_changed INTEGER NOT NULL DEFAULT 0,
      lines_added INTEGER NOT NULL DEFAULT 0,
      lines_deleted INTEGER NOT NULL DEFAULT 0,
      repo_name TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (session_id, commit_hash)
    ) STRICT`,
  },
  {
    name: "commit_files",
    columns: ["commit_hash","file_path","repo_name"],
    ddl: `CREATE TABLE commit_files__new (
      commit_hash TEXT NOT NULL,
      file_path TEXT NOT NULL,
      repo_name TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (commit_hash, file_path)
    ) STRICT`,
  },
  {
    name: "session_commit_resolutions",
    columns: ["session_id","repo_name","resolved_at"],
    ddl: `CREATE TABLE session_commit_resolutions__new (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      repo_name TEXT NOT NULL,
      resolved_at TEXT NOT NULL,
      PRIMARY KEY (session_id, repo_name)
    ) STRICT`,
  },
  {
    name: "message_commits",
    columns: ["message_uuid","session_id","commit_hash","detected_at","match_confidence"],
    ddl: `CREATE TABLE message_commits__new (
      message_uuid TEXT NOT NULL REFERENCES messages(uuid) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      commit_hash TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      match_confidence TEXT NOT NULL CHECK(match_confidence IN ('realtime','high','medium','low')),
      PRIMARY KEY (message_uuid, commit_hash)
    ) STRICT`,
  },
  {
    name: "current_graphs",
    columns: ["repo_name","commit_id","graph_json","tsconfig_path","project_root","analyzed_at","updated_at"],
    ddl: `CREATE TABLE current_graphs__new (
      repo_name     TEXT PRIMARY KEY,
      commit_id     TEXT NOT NULL DEFAULT '',
      graph_json    TEXT NOT NULL CHECK (json_valid(graph_json)),
      tsconfig_path TEXT NOT NULL,
      project_root  TEXT NOT NULL,
      analyzed_at   TEXT NOT NULL,
      updated_at    TEXT NOT NULL DEFAULT ''
    ) STRICT`,
  },
  {
    name: "release_graphs",
    columns: ["tag","graph_json","tsconfig_path","project_root","analyzed_at","updated_at"],
    ddl: `CREATE TABLE release_graphs__new (
      tag           TEXT PRIMARY KEY REFERENCES releases(tag) ON DELETE CASCADE,
      graph_json    TEXT NOT NULL CHECK (json_valid(graph_json)),
      tsconfig_path TEXT NOT NULL,
      project_root  TEXT NOT NULL,
      analyzed_at   TEXT NOT NULL,
      updated_at    TEXT NOT NULL DEFAULT ''
    ) STRICT`,
  },
  {
    name: "skill_models",
    columns: ["skill","canonical_skill","recommended_model"],
    ddl: `CREATE TABLE skill_models__new (
      skill TEXT PRIMARY KEY,
      canonical_skill TEXT,
      recommended_model TEXT NOT NULL DEFAULT 'sonnet'
    ) STRICT`,
  },
  {
    name: "releases",
    columns: ["tag","released_at","prev_tag","repo_name","package_tags","commit_count","files_changed","lines_added","lines_deleted","feat_count","fix_count","refactor_count","test_count","other_count","affected_packages","duration_days","resolved_at"],
    ddl: `CREATE TABLE releases__new (
      tag TEXT PRIMARY KEY,
      released_at TEXT NOT NULL DEFAULT '',
      prev_tag TEXT REFERENCES releases(tag) ON DELETE SET NULL,
      repo_name TEXT NOT NULL DEFAULT '',
      package_tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(package_tags)),
      commit_count INTEGER NOT NULL DEFAULT 0,
      files_changed INTEGER NOT NULL DEFAULT 0,
      lines_added INTEGER NOT NULL DEFAULT 0,
      lines_deleted INTEGER NOT NULL DEFAULT 0,
      feat_count INTEGER NOT NULL DEFAULT 0,
      fix_count INTEGER NOT NULL DEFAULT 0,
      refactor_count INTEGER NOT NULL DEFAULT 0,
      test_count INTEGER NOT NULL DEFAULT 0,
      other_count INTEGER NOT NULL DEFAULT 0,
      affected_packages TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(affected_packages)),
      duration_days REAL NOT NULL DEFAULT 0,
      resolved_at TEXT
    ) STRICT`,
  },
  {
    name: "release_files",
    columns: ["release_tag","file_path","lines_added","lines_deleted","change_type"],
    ddl: `CREATE TABLE release_files__new (
      release_tag TEXT NOT NULL REFERENCES releases(tag) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      lines_added INTEGER NOT NULL DEFAULT 0,
      lines_deleted INTEGER NOT NULL DEFAULT 0,
      change_type TEXT NOT NULL DEFAULT 'modified'
        CHECK (change_type IN ('added','modified','deleted','renamed','copied')),
      PRIMARY KEY (release_tag, file_path)
    ) STRICT`,
  },
  {
    name: "release_coverage",
    columns: ["release_tag","package","file_path","lines_total","lines_covered","lines_pct","statements_total","statements_covered","statements_pct","functions_total","functions_covered","functions_pct","branches_total","branches_covered","branches_pct"],
    ddl: `CREATE TABLE release_coverage__new (
      release_tag        TEXT    NOT NULL REFERENCES releases(tag) ON DELETE CASCADE,
      package            TEXT    NOT NULL,
      file_path          TEXT    NOT NULL,
      lines_total        INTEGER NOT NULL DEFAULT 0,
      lines_covered      INTEGER NOT NULL DEFAULT 0,
      lines_pct          REAL    NOT NULL DEFAULT 0,
      statements_total   INTEGER NOT NULL DEFAULT 0,
      statements_covered INTEGER NOT NULL DEFAULT 0,
      statements_pct     REAL    NOT NULL DEFAULT 0,
      functions_total    INTEGER NOT NULL DEFAULT 0,
      functions_covered  INTEGER NOT NULL DEFAULT 0,
      functions_pct      REAL    NOT NULL DEFAULT 0,
      branches_total     INTEGER NOT NULL DEFAULT 0,
      branches_covered   INTEGER NOT NULL DEFAULT 0,
      branches_pct       REAL    NOT NULL DEFAULT 0,
      PRIMARY KEY (release_tag, package, file_path)
    ) STRICT`,
  },
  {
    name: "current_coverage",
    columns: ["repo_name","package","file_path","lines_total","lines_covered","lines_pct","statements_total","statements_covered","statements_pct","functions_total","functions_covered","functions_pct","branches_total","branches_covered","branches_pct","updated_at"],
    ddl: `CREATE TABLE current_coverage__new (
      repo_name          TEXT    NOT NULL,
      package            TEXT    NOT NULL,
      file_path          TEXT    NOT NULL,
      lines_total        INTEGER NOT NULL DEFAULT 0,
      lines_covered      INTEGER NOT NULL DEFAULT 0,
      lines_pct          REAL    NOT NULL DEFAULT 0,
      statements_total   INTEGER NOT NULL DEFAULT 0,
      statements_covered INTEGER NOT NULL DEFAULT 0,
      statements_pct     REAL    NOT NULL DEFAULT 0,
      functions_total    INTEGER NOT NULL DEFAULT 0,
      functions_covered  INTEGER NOT NULL DEFAULT 0,
      functions_pct      REAL    NOT NULL DEFAULT 0,
      branches_total     INTEGER NOT NULL DEFAULT 0,
      branches_covered   INTEGER NOT NULL DEFAULT 0,
      branches_pct       REAL    NOT NULL DEFAULT 0,
      updated_at         TEXT    NOT NULL DEFAULT '',
      PRIMARY KEY (repo_name, package, file_path)
    ) STRICT`,
  },
  {
    name: "message_tool_calls",
    columns: ["id","session_id","message_uuid","turn_index","call_index","tool_name","file_path","command","skill_name","model","is_sidechain","turn_exec_ms","has_thinking","is_error","error_type","timestamp"],
    ddl: `CREATE TABLE message_tool_calls__new (
      id           INTEGER PRIMARY KEY,
      session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      message_uuid TEXT NOT NULL REFERENCES messages(uuid) ON DELETE CASCADE,
      turn_index   INTEGER NOT NULL,
      call_index   INTEGER NOT NULL,
      tool_name    TEXT NOT NULL,
      file_path    TEXT,
      command      TEXT,
      skill_name   TEXT,
      model        TEXT,
      is_sidechain INTEGER NOT NULL DEFAULT 0 CHECK (is_sidechain IN (0,1)),
      turn_exec_ms INTEGER,
      has_thinking INTEGER NOT NULL DEFAULT 0 CHECK (has_thinking IN (0,1)),
      is_error     INTEGER NOT NULL DEFAULT 0 CHECK (is_error IN (0,1)),
      error_type   TEXT,
      timestamp    TEXT NOT NULL,
      UNIQUE (message_uuid, call_index)
    ) STRICT`,
  },
  {
    name: "c4_manual_elements",
    columns: ["repo_name","element_id","type","name","description","external","parent_id","service_type","updated_at"],
    ddl: `CREATE TABLE c4_manual_elements__new (
      repo_name    TEXT NOT NULL,
      element_id   TEXT NOT NULL,
      type         TEXT NOT NULL
        CHECK (type IN ('person','system','container','component','code','enterprise')),
      name         TEXT NOT NULL,
      description  TEXT,
      external     INTEGER NOT NULL DEFAULT 0 CHECK (external IN (0,1)),
      parent_id    TEXT,
      service_type TEXT,
      updated_at   TEXT NOT NULL,
      PRIMARY KEY (repo_name, element_id),
      FOREIGN KEY (repo_name, parent_id) REFERENCES c4_manual_elements(repo_name, element_id)
    ) STRICT`,
  },
  {
    name: "c4_manual_relationships",
    columns: ["repo_name","rel_id","from_id","to_id","label","technology","updated_at"],
    ddl: `CREATE TABLE c4_manual_relationships__new (
      repo_name   TEXT NOT NULL,
      rel_id      TEXT NOT NULL,
      from_id     TEXT NOT NULL,
      to_id       TEXT NOT NULL,
      label       TEXT,
      technology  TEXT,
      updated_at  TEXT NOT NULL,
      PRIMARY KEY (repo_name, rel_id),
      FOREIGN KEY (repo_name, from_id) REFERENCES c4_manual_elements(repo_name, element_id),
      FOREIGN KEY (repo_name, to_id)   REFERENCES c4_manual_elements(repo_name, element_id)
    ) STRICT`,
  },
  {
    name: "c4_manual_groups",
    columns: ["repo_name","group_id","member_ids","label","updated_at"],
    ddl: `CREATE TABLE c4_manual_groups__new (
      repo_name  TEXT NOT NULL,
      group_id   TEXT NOT NULL,
      member_ids TEXT NOT NULL CHECK (json_valid(member_ids)),
      label      TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (repo_name, group_id)
    ) STRICT`,
  },
  {
    name: "current_code_graphs",
    columns: ["repo_name","graph_json","generated_at","updated_at"],
    ddl: `CREATE TABLE current_code_graphs__new (
      repo_name    TEXT PRIMARY KEY,
      graph_json   TEXT NOT NULL CHECK (json_valid(graph_json)),
      generated_at TEXT NOT NULL DEFAULT '',
      updated_at   TEXT NOT NULL DEFAULT ''
    ) STRICT`,
  },
  {
    name: "release_code_graphs",
    columns: ["release_tag","graph_json","generated_at","updated_at"],
    ddl: `CREATE TABLE release_code_graphs__new (
      release_tag  TEXT PRIMARY KEY REFERENCES releases(tag) ON DELETE CASCADE,
      graph_json   TEXT NOT NULL CHECK (json_valid(graph_json)),
      generated_at TEXT NOT NULL DEFAULT '',
      updated_at   TEXT NOT NULL DEFAULT ''
    ) STRICT`,
  },
  {
    name: "current_code_graph_communities",
    columns: ["repo_name","community_id","label","name","summary","generated_at","updated_at"],
    ddl: `CREATE TABLE current_code_graph_communities__new (
      repo_name    TEXT    NOT NULL,
      community_id INTEGER NOT NULL,
      label        TEXT    NOT NULL DEFAULT '',
      name         TEXT    NOT NULL DEFAULT '',
      summary      TEXT    NOT NULL DEFAULT '',
      generated_at TEXT    NOT NULL DEFAULT '',
      updated_at   TEXT    NOT NULL DEFAULT '',
      PRIMARY KEY (repo_name, community_id)
    ) STRICT`,
  },
  {
    name: "release_code_graph_communities",
    columns: ["release_tag","community_id","label","name","summary","generated_at","updated_at"],
    ddl: `CREATE TABLE release_code_graph_communities__new (
      release_tag  TEXT    NOT NULL REFERENCES releases(tag) ON DELETE CASCADE,
      community_id INTEGER NOT NULL,
      label        TEXT    NOT NULL DEFAULT '',
      name         TEXT    NOT NULL DEFAULT '',
      summary      TEXT    NOT NULL DEFAULT '',
      generated_at TEXT    NOT NULL DEFAULT '',
      updated_at   TEXT    NOT NULL DEFAULT '',
      PRIMARY KEY (release_tag, community_id)
    ) STRICT`,
  },
  {
    name: "current_file_analysis",
    columns: ["repo_name","file_path","importance_score","fan_in_total","cognitive_complexity_max","line_count","cyclomatic_complexity_max","function_count","dead_code_score","signal_orphan","signal_fan_in_zero","signal_no_recent_churn","signal_zero_coverage","signal_isolated_community","is_ignored","ignore_reason","analyzed_at"],
    ddl: `CREATE TABLE current_file_analysis__new (
      repo_name                  TEXT NOT NULL,
      file_path                  TEXT NOT NULL,
      importance_score           REAL    NOT NULL DEFAULT 0,
      fan_in_total               INTEGER NOT NULL DEFAULT 0,
      cognitive_complexity_max   INTEGER NOT NULL DEFAULT 0,
      line_count                 INTEGER NOT NULL DEFAULT 0,
      cyclomatic_complexity_max  INTEGER NOT NULL DEFAULT 0,
      function_count             INTEGER NOT NULL DEFAULT 0,
      dead_code_score            INTEGER NOT NULL DEFAULT 0,
      signal_orphan              INTEGER NOT NULL DEFAULT 0 CHECK (signal_orphan IN (0,1)),
      signal_fan_in_zero         INTEGER NOT NULL DEFAULT 0 CHECK (signal_fan_in_zero IN (0,1)),
      signal_no_recent_churn     INTEGER NOT NULL DEFAULT 0 CHECK (signal_no_recent_churn IN (0,1)),
      signal_zero_coverage       INTEGER NOT NULL DEFAULT 0 CHECK (signal_zero_coverage IN (0,1)),
      signal_isolated_community  INTEGER NOT NULL DEFAULT 0 CHECK (signal_isolated_community IN (0,1)),
      is_ignored                 INTEGER NOT NULL DEFAULT 0 CHECK (is_ignored IN (0,1)),
      ignore_reason              TEXT NOT NULL DEFAULT '',
      analyzed_at                TEXT NOT NULL,
      PRIMARY KEY (repo_name, file_path)
    ) STRICT`,
  },
  {
    name: "release_file_analysis",
    columns: ["release_tag","repo_name","file_path","importance_score","fan_in_total","cognitive_complexity_max","line_count","cyclomatic_complexity_max","function_count","dead_code_score","signal_orphan","signal_fan_in_zero","signal_no_recent_churn","signal_zero_coverage","signal_isolated_community","is_ignored","ignore_reason","analyzed_at"],
    ddl: `CREATE TABLE release_file_analysis__new (
      release_tag                TEXT NOT NULL REFERENCES releases(tag) ON DELETE CASCADE,
      repo_name                  TEXT NOT NULL,
      file_path                  TEXT NOT NULL,
      importance_score           REAL    NOT NULL DEFAULT 0,
      fan_in_total               INTEGER NOT NULL DEFAULT 0,
      cognitive_complexity_max   INTEGER NOT NULL DEFAULT 0,
      line_count                 INTEGER NOT NULL DEFAULT 0,
      cyclomatic_complexity_max  INTEGER NOT NULL DEFAULT 0,
      function_count             INTEGER NOT NULL DEFAULT 0,
      dead_code_score            INTEGER NOT NULL DEFAULT 0,
      signal_orphan              INTEGER NOT NULL DEFAULT 0 CHECK (signal_orphan IN (0,1)),
      signal_fan_in_zero         INTEGER NOT NULL DEFAULT 0 CHECK (signal_fan_in_zero IN (0,1)),
      signal_no_recent_churn     INTEGER NOT NULL DEFAULT 0 CHECK (signal_no_recent_churn IN (0,1)),
      signal_zero_coverage       INTEGER NOT NULL DEFAULT 0 CHECK (signal_zero_coverage IN (0,1)),
      signal_isolated_community  INTEGER NOT NULL DEFAULT 0 CHECK (signal_isolated_community IN (0,1)),
      is_ignored                 INTEGER NOT NULL DEFAULT 0 CHECK (is_ignored IN (0,1)),
      ignore_reason              TEXT NOT NULL DEFAULT '',
      analyzed_at                TEXT NOT NULL,
      PRIMARY KEY (release_tag, repo_name, file_path)
    ) STRICT`,
  },
  {
    name: "current_function_analysis",
    columns: ["repo_name","file_path","function_name","start_line","end_line","language","fan_in","cognitive_complexity","cyclomatic_complexity","data_mutation_score","side_effect_score","line_count","importance_score","signal_fan_in_zero","analyzed_at"],
    ddl: `CREATE TABLE current_function_analysis__new (
      repo_name              TEXT NOT NULL,
      file_path              TEXT NOT NULL,
      function_name          TEXT NOT NULL,
      start_line             INTEGER NOT NULL,
      end_line               INTEGER NOT NULL DEFAULT 0,
      language               TEXT NOT NULL DEFAULT '',
      fan_in                 INTEGER NOT NULL DEFAULT 0,
      cognitive_complexity   INTEGER NOT NULL DEFAULT 0,
      cyclomatic_complexity  INTEGER NOT NULL DEFAULT 0,
      data_mutation_score    INTEGER NOT NULL DEFAULT 0,
      side_effect_score      INTEGER NOT NULL DEFAULT 0,
      line_count             INTEGER NOT NULL DEFAULT 0,
      importance_score       REAL    NOT NULL DEFAULT 0,
      signal_fan_in_zero     INTEGER NOT NULL DEFAULT 0 CHECK (signal_fan_in_zero IN (0,1)),
      analyzed_at            TEXT NOT NULL,
      PRIMARY KEY (repo_name, file_path, function_name, start_line)
    ) STRICT`,
  },
  {
    name: "release_function_analysis",
    columns: ["release_tag","repo_name","file_path","function_name","start_line","end_line","language","fan_in","cognitive_complexity","cyclomatic_complexity","data_mutation_score","side_effect_score","line_count","importance_score","signal_fan_in_zero","analyzed_at"],
    ddl: `CREATE TABLE release_function_analysis__new (
      release_tag            TEXT NOT NULL REFERENCES releases(tag) ON DELETE CASCADE,
      repo_name              TEXT NOT NULL,
      file_path              TEXT NOT NULL,
      function_name          TEXT NOT NULL,
      start_line             INTEGER NOT NULL,
      end_line               INTEGER NOT NULL DEFAULT 0,
      language               TEXT NOT NULL DEFAULT '',
      fan_in                 INTEGER NOT NULL DEFAULT 0,
      cognitive_complexity   INTEGER NOT NULL DEFAULT 0,
      cyclomatic_complexity  INTEGER NOT NULL DEFAULT 0,
      data_mutation_score    INTEGER NOT NULL DEFAULT 0,
      side_effect_score      INTEGER NOT NULL DEFAULT 0,
      line_count             INTEGER NOT NULL DEFAULT 0,
      importance_score       REAL    NOT NULL DEFAULT 0,
      signal_fan_in_zero     INTEGER NOT NULL DEFAULT 0 CHECK (signal_fan_in_zero IN (0,1)),
      analyzed_at            TEXT NOT NULL,
      PRIMARY KEY (release_tag, repo_name, file_path, function_name, start_line)
    ) STRICT`,
  },
];

function tableExists(name) {
  return db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) != null;
}

function getTableColumns(name) {
  return db.pragma(`table_info("${name}")`).map((c) => c.name);
}

function getRelatedObjects(table) {
  return db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE tbl_name = ? AND type IN ('index','trigger','view')
         AND sql IS NOT NULL`,
    )
    .all(table);
}

console.log("PRAGMA foreign_keys = OFF (during migration)");
db.pragma("foreign_keys = OFF");

// migration 中にビューが壊れないよう、先にすべての view / trigger 定義を退避し DROP しておく
const viewDefs = db
  .prepare("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL")
  .all();
const triggerDefs = db
  .prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")
  .all();
console.log(`stashing ${viewDefs.length} views, ${triggerDefs.length} triggers`);
for (const t of triggerDefs) {
  db.exec(`DROP TRIGGER IF EXISTS "${t.name}"`);
}
for (const v of viewDefs) {
  db.exec(`DROP VIEW IF EXISTS "${v.name}"`);
}

const tx = db.transaction(() => {
  for (const def of FK_DEFS) {
    if (!tableExists(def.name)) {
      console.log("- skip (not present):", def.name);
      continue;
    }
    const existingCols = getTableColumns(def.name);
    const sharedCols = def.columns.filter((c) => existingCols.includes(c));
    if (sharedCols.length === 0) {
      console.log("- skip (no shared columns):", def.name);
      continue;
    }
    const related = getRelatedObjects(def.name);
    console.log(`migrating ${def.name} (${sharedCols.length} cols, ${related.length} related objects)`);

    db.exec(`DROP TABLE IF EXISTS "${def.name}__new"`);
    db.exec(def.ddl);
    // STRICT テーブルでは型不一致 (TEXT 値→REAL 列など) が拒否されるため、
    // 新テーブルの宣言型に合わせて CAST する。
    const newColInfo = db
      .prepare(`PRAGMA table_info("${def.name}__new")`)
      .all();
    const typeByCol = new Map(newColInfo.map((c) => [c.name, (c.type || "").toUpperCase()]));
    const selectExprs = sharedCols.map((c) => {
      const t = typeByCol.get(c) || "";
      if (t === "INT" || t === "INTEGER" || t === "REAL") {
        // NULL は CAST しても NULL のまま
        return `CAST("${c}" AS ${t}) AS "${c}"`;
      }
      return `"${c}"`;
    });
    db.exec(
      `INSERT INTO "${def.name}__new" (${sharedCols.map((c) => `"${c}"`).join(",")})
       SELECT ${selectExprs.join(",")} FROM "${def.name}"`,
    );
    db.exec(`DROP TABLE "${def.name}"`);
    db.exec(`ALTER TABLE "${def.name}__new" RENAME TO "${def.name}"`);
    for (const obj of related) {
      // view / trigger は最後にまとめて再作成 (ここではスキップ)
      if (obj.type === "view" || obj.type === "trigger") continue;
      try {
        db.exec(`DROP INDEX IF EXISTS "${obj.name}"`);
        db.exec(obj.sql);
      } catch (e) {
        console.warn(`  failed to recreate ${obj.type} ${obj.name}: ${e.message}`);
      }
    }
  }
});
tx();

// 退避した view / trigger を最後に再作成
for (const v of viewDefs) {
  try {
    db.exec(v.sql);
  } catch (e) {
    console.warn(`failed to recreate view ${v.name}: ${e.message}`);
  }
}
for (const t of triggerDefs) {
  try {
    db.exec(t.sql);
  } catch (e) {
    console.warn(`failed to recreate trigger ${t.name}: ${e.message}`);
  }
}

console.log("PRAGMA foreign_key_check (before cleanup)");
const violationsBefore = db.pragma("foreign_key_check");
if (violationsBefore.length === 0) {
  console.log("no FK violations");
} else {
  console.warn(`FK violations detected: ${violationsBefore.length} rows (orphans). running cleanup...`);

  // 各違反を fkid 単位で集計し、PRAGMA foreign_key_list の on_delete を参照して
  // SET NULL なら親カラムを NULL に、それ以外 (NO ACTION / CASCADE / RESTRICT) なら行を削除する
  const fkInfoCache = new Map();
  function getFkInfo(table) {
    if (!fkInfoCache.has(table)) {
      fkInfoCache.set(table, db.pragma(`foreign_key_list("${table}")`));
    }
    return fkInfoCache.get(table);
  }

  // (table, fkid) でグルーピング → rowid 一覧
  const groups = new Map();
  for (const v of violationsBefore) {
    const key = `${v.table}::${v.fkid}`;
    if (!groups.has(key)) groups.set(key, { table: v.table, fkid: v.fkid, rowids: [] });
    if (v.rowid != null) groups.get(key).rowids.push(v.rowid);
  }

  const cleanupTx = db.transaction(() => {
    for (const g of groups.values()) {
      const fkList = getFkInfo(g.table);
      // 同じ fkid に複数行 (複合 FK) があり得るが、on_delete はどれも同じ
      const matched = fkList.filter((f) => f.id === g.fkid);
      if (matched.length === 0) {
        console.warn(`  fk meta missing for ${g.table} fkid=${g.fkid}, skip`);
        continue;
      }
      const onDelete = (matched[0].on_delete || "NO ACTION").toUpperCase();
      const fromCols = matched.map((m) => m.from);
      if (g.rowids.length === 0) continue;

      // 大量 rowid 対応のため 500 件ずつバッチ
      const chunkSize = 500;
      let processed = 0;
      for (let i = 0; i < g.rowids.length; i += chunkSize) {
        const chunk = g.rowids.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(",");
        if (onDelete === "SET NULL") {
          const setClause = fromCols.map((c) => `"${c}" = NULL`).join(",");
          db.prepare(
            `UPDATE "${g.table}" SET ${setClause} WHERE rowid IN (${placeholders})`,
          ).run(...chunk);
        } else {
          db.prepare(`DELETE FROM "${g.table}" WHERE rowid IN (${placeholders})`).run(...chunk);
        }
        processed += chunk.length;
      }
      console.log(`  ${g.table} fkid=${g.fkid} (${onDelete}): processed ${processed} rows`);
    }
  });
  cleanupTx();

  console.log("PRAGMA foreign_key_check (after cleanup)");
  const violationsAfter = db.pragma("foreign_key_check");
  if (violationsAfter.length === 0) {
    console.log("no FK violations after cleanup");
  } else {
    console.warn(`!! still ${violationsAfter.length} violations remain after cleanup`);
  }
}

db.pragma("foreign_keys = ON");
db.close();
console.log("done. backup at:", bak);
