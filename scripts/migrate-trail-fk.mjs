#!/usr/bin/env node
/**
 * trail_test.db のような既存 SQLite ファイルに対し、trail-core/src/domain/schema/tables.ts
 * 相当の FK 制約を後付けする。テーブル再作成パターン (公式 12-step) を使うのでデータは保持する。
 *
 * 使い方:
 *   node scripts/migrate-trail-fk.mjs <db-path>
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

// バックアップ
const bak = abs + ".bak-" + Date.now();
fs.copyFileSync(abs, bak);
console.log("backup ->", bak);

const db = new Database(abs);

// FK 制約を含む新スキーマ。trail-core/tables.ts と一致させる必要がある。
// PRIMARY KEY 含む全カラムをコピーするため、データは保持される。
// CHECK 制約付きのテーブルは CHECK 句もそのまま含める。
const FK_DEFS = [
  {
    name: "session_costs",
    columns: ["session_id", "model", "input_tokens", "output_tokens", "cache_read_tokens", "cache_creation_tokens", "estimated_cost_usd"],
    ddl: `CREATE TABLE session_costs__new (
      session_id TEXT NOT NULL REFERENCES sessions(id),
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, model)
    )`,
  },
  {
    name: "messages",
    columns: ["uuid","session_id","parent_uuid","type","subtype","text_content","user_content","tool_calls","tool_use_result","model","request_id","stop_reason","input_tokens","output_tokens","cache_read_tokens","cache_creation_tokens","service_tier","speed","timestamp","is_sidechain","is_meta","cwd","git_branch","permission_mode","skill","agent_id","source_tool_assistant_uuid","source_tool_use_id","system_command","duration_ms","tool_result_size","agent_description","agent_model","subagent_type"],
    ddl: `CREATE TABLE messages__new (
      uuid TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      parent_uuid TEXT,
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
      is_sidechain INTEGER NOT NULL DEFAULT 0,
      is_meta INTEGER NOT NULL DEFAULT 0,
      cwd TEXT,
      git_branch TEXT,
      permission_mode TEXT,
      skill TEXT,
      agent_id TEXT,
      source_tool_assistant_uuid TEXT,
      source_tool_use_id TEXT,
      system_command TEXT,
      duration_ms INTEGER,
      tool_result_size INTEGER,
      agent_description TEXT,
      agent_model TEXT,
      subagent_type TEXT
    )`,
  },
  {
    name: "session_commits",
    columns: ["session_id","commit_hash","commit_message","author","committed_at","is_ai_assisted","files_changed","lines_added","lines_deleted","repo_name"],
    ddl: `CREATE TABLE session_commits__new (
      session_id TEXT NOT NULL REFERENCES sessions(id),
      commit_hash TEXT NOT NULL,
      commit_message TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      committed_at TEXT NOT NULL DEFAULT '',
      is_ai_assisted INTEGER NOT NULL DEFAULT 0,
      files_changed INTEGER NOT NULL DEFAULT 0,
      lines_added INTEGER NOT NULL DEFAULT 0,
      lines_deleted INTEGER NOT NULL DEFAULT 0,
      repo_name TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (session_id, commit_hash)
    )`,
  },
  {
    name: "session_commit_resolutions",
    columns: ["session_id","repo_name","resolved_at"],
    ddl: `CREATE TABLE session_commit_resolutions__new (
      session_id TEXT NOT NULL REFERENCES sessions(id),
      repo_name TEXT NOT NULL,
      resolved_at TEXT NOT NULL,
      PRIMARY KEY (session_id, repo_name)
    )`,
  },
  {
    name: "message_commits",
    columns: ["message_uuid","session_id","commit_hash","detected_at","match_confidence"],
    ddl: `CREATE TABLE message_commits__new (
      message_uuid TEXT NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      commit_hash TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      match_confidence TEXT NOT NULL CHECK(match_confidence IN ('realtime', 'high', 'medium', 'low')),
      PRIMARY KEY (message_uuid, commit_hash)
    )`,
  },
  {
    name: "release_files",
    columns: ["release_tag","file_path","lines_added","lines_deleted","change_type"],
    ddl: `CREATE TABLE release_files__new (
      release_tag TEXT NOT NULL REFERENCES releases(tag) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      lines_added INTEGER NOT NULL DEFAULT 0,
      lines_deleted INTEGER NOT NULL DEFAULT 0,
      change_type TEXT NOT NULL DEFAULT 'modified',
      PRIMARY KEY (release_tag, file_path)
    )`,
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
    )`,
  },
  {
    name: "message_tool_calls",
    columns: ["id","session_id","message_uuid","turn_index","call_index","tool_name","file_path","command","skill_name","model","is_sidechain","turn_exec_ms","has_thinking","is_error","error_type","timestamp"],
    ddl: `CREATE TABLE message_tool_calls__new (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   TEXT NOT NULL REFERENCES sessions(id),
      message_uuid TEXT NOT NULL REFERENCES messages(uuid),
      turn_index   INTEGER NOT NULL,
      call_index   INTEGER NOT NULL,
      tool_name    TEXT NOT NULL,
      file_path    TEXT,
      command      TEXT,
      skill_name   TEXT,
      model        TEXT,
      is_sidechain INTEGER NOT NULL DEFAULT 0,
      turn_exec_ms INTEGER,
      has_thinking INTEGER NOT NULL DEFAULT 0,
      is_error     INTEGER NOT NULL DEFAULT 0,
      error_type   TEXT,
      timestamp    TEXT NOT NULL,
      UNIQUE (message_uuid, call_index)
    )`,
  },
  {
    name: "release_graphs",
    columns: ["tag","graph_json","tsconfig_path","project_root","analyzed_at","updated_at"],
    ddl: `CREATE TABLE release_graphs__new (
      tag           TEXT PRIMARY KEY REFERENCES releases(tag) ON DELETE CASCADE,
      graph_json    TEXT NOT NULL,
      tsconfig_path TEXT NOT NULL,
      project_root  TEXT NOT NULL,
      analyzed_at   TEXT NOT NULL,
      updated_at    TEXT NOT NULL DEFAULT ''
    )`,
  },
  {
    name: "release_code_graphs",
    columns: ["release_tag","graph_json","generated_at","updated_at"],
    ddl: `CREATE TABLE release_code_graphs__new (
      release_tag  TEXT PRIMARY KEY REFERENCES releases(tag) ON DELETE CASCADE,
      graph_json   TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT '',
      updated_at   TEXT NOT NULL DEFAULT ''
    )`,
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
    )`,
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
      signal_orphan              INTEGER NOT NULL DEFAULT 0,
      signal_fan_in_zero         INTEGER NOT NULL DEFAULT 0,
      signal_no_recent_churn     INTEGER NOT NULL DEFAULT 0,
      signal_zero_coverage       INTEGER NOT NULL DEFAULT 0,
      signal_isolated_community  INTEGER NOT NULL DEFAULT 0,
      is_ignored                 INTEGER NOT NULL DEFAULT 0,
      ignore_reason              TEXT NOT NULL DEFAULT '',
      analyzed_at                TEXT NOT NULL,
      PRIMARY KEY (release_tag, repo_name, file_path)
    )`,
  },
  {
    name: "c4_manual_elements",
    columns: ["repo_name","element_id","type","name","description","external","parent_id","service_type","updated_at"],
    ddl: `CREATE TABLE c4_manual_elements__new (
      repo_name    TEXT NOT NULL,
      element_id   TEXT NOT NULL,
      type         TEXT NOT NULL,
      name         TEXT NOT NULL,
      description  TEXT,
      external     INTEGER NOT NULL DEFAULT 0,
      parent_id    TEXT,
      service_type TEXT,
      updated_at   TEXT NOT NULL,
      PRIMARY KEY (repo_name, element_id),
      FOREIGN KEY (repo_name, parent_id) REFERENCES c4_manual_elements(repo_name, element_id)
    )`,
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
    )`,
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
      signal_fan_in_zero     INTEGER NOT NULL DEFAULT 0,
      analyzed_at            TEXT NOT NULL,
      PRIMARY KEY (release_tag, repo_name, file_path, function_name, start_line)
    )`,
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
  // インデックス・トリガー・ビュー定義を退避
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

const tx = db.transaction(() => {
  for (const def of FK_DEFS) {
    if (!tableExists(def.name)) {
      console.log("- skip (not present):", def.name);
      continue;
    }
    const existingCols = getTableColumns(def.name);
    // 既存行の SELECT 句は新テーブルに存在するカラムのみ
    const sharedCols = def.columns.filter((c) => existingCols.includes(c));
    if (sharedCols.length === 0) {
      console.log("- skip (no shared columns):", def.name);
      continue;
    }
    const related = getRelatedObjects(def.name);
    console.log(`migrating ${def.name} (${sharedCols.length} cols, ${related.length} related objects)`);

    db.exec(`DROP TABLE IF EXISTS "${def.name}__new"`);
    db.exec(def.ddl);
    db.exec(
      `INSERT INTO "${def.name}__new" (${sharedCols.map((c) => `"${c}"`).join(",")})
       SELECT ${sharedCols.map((c) => `"${c}"`).join(",")} FROM "${def.name}"`,
    );
    db.exec(`DROP TABLE "${def.name}"`);
    db.exec(`ALTER TABLE "${def.name}__new" RENAME TO "${def.name}"`);
    for (const obj of related) {
      try {
        db.exec(obj.sql);
      } catch (e) {
        console.warn(`  failed to recreate ${obj.type} ${obj.name}: ${e.message}`);
      }
    }
  }
});
tx();

console.log("PRAGMA foreign_key_check");
const violations = db.pragma("foreign_key_check");
if (violations.length > 0) {
  console.warn("FK violations detected:", violations);
} else {
  console.log("no FK violations");
}

db.pragma("foreign_keys = ON");
db.close();
console.log("done. backup at:", bak);
