// SqliteCostRepository.ts — ICostRepository implementation using sql.js

import type { Database } from 'sql.js';
import type {
  ICostRepository,
  SkillModelRow,
  CostOptimizationData,
} from '@anytime-markdown/trail-core';

export class SqliteCostRepository implements ICostRepository {
  constructor(private readonly db: Database) {}

  getSkillModels(): readonly SkillModelRow[] {
    const result = this.db.exec(
      'SELECT skill, canonical_skill, recommended_model FROM skill_models',
    );
    if (!result[0]?.values) return [];

    return result[0].values.map(([skill, canonicalSkill, recommendedModel]) => ({
      skill: skill as string,
      canonicalSkill: canonicalSkill as string | null,
      recommendedModel: recommendedModel as string,
    }));
  }

  registerSkillIfNew(skill: string, defaultModel: string): void {
    this.db.run(
      `INSERT OR IGNORE INTO skill_models (skill, recommended_model) VALUES (?, ?)`,
      [skill, defaultModel],
    );
  }

  rebuildDailyCosts(tzOffset: string): void {
    this.db.run('DELETE FROM daily_costs');

    this.db.run(`
      INSERT INTO daily_costs (date, model, cost_type, input_tokens, output_tokens,
        cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
      SELECT
        date(m.timestamp, '${tzOffset}') as d,
        COALESCE(m.model, 'unknown') as mdl,
        'actual',
        SUM(m.input_tokens),
        SUM(m.output_tokens),
        SUM(m.cache_read_tokens),
        SUM(m.cache_creation_tokens),
        0
      FROM messages m
      WHERE m.type = 'assistant' AND m.timestamp != ''
      GROUP BY d, mdl
    `);
  }

  getCostOptimization(): CostOptimizationData {
    // Actual costs by model
    const actualResult = this.db.exec(`
      SELECT model, SUM(estimated_cost_usd) FROM session_costs GROUP BY model
    `);
    const actualByModel: Record<string, number> = {};
    let actualTotal = 0;
    for (const row of actualResult[0]?.values ?? []) {
      const model = row[0] as string;
      const cost = row[1] as number;
      actualByModel[model] = cost;
      actualTotal += cost;
    }

    // Skill-recommended costs
    const skillResult = this.db.exec(`
      SELECT recommended_model, SUM(estimated_cost_usd) FROM daily_costs
      WHERE cost_type = 'skill' GROUP BY recommended_model
    `);
    const skillByModel: Record<string, number> = {};
    let skillTotal = 0;
    for (const row of skillResult[0]?.values ?? []) {
      const model = row[0] as string;
      const cost = row[1] as number;
      skillByModel[model] = cost;
      skillTotal += cost;
    }

    // Daily breakdown
    const dailyResult = this.db.exec(`
      SELECT date,
        SUM(CASE WHEN cost_type = 'actual' THEN estimated_cost_usd ELSE 0 END),
        SUM(CASE WHEN cost_type = 'skill' THEN estimated_cost_usd ELSE 0 END)
      FROM daily_costs GROUP BY date ORDER BY date
    `);
    const daily = (dailyResult[0]?.values ?? []).map((row) => ({
      date: row[0] as string,
      actualCost: row[1] as number,
      skillCost: row[2] as number,
    }));

    // Model distribution
    const distResult = this.db.exec(`
      SELECT cost_type, model, COUNT(*) FROM daily_costs GROUP BY cost_type, model
    `);
    const actualDist: Record<string, number> = {};
    const skillDist: Record<string, number> = {};
    for (const row of distResult[0]?.values ?? []) {
      const type = row[0] as string;
      const model = row[1] as string;
      const count = row[2] as number;
      if (type === 'actual') {
        actualDist[model] = count;
      } else {
        skillDist[model] = count;
      }
    }

    return {
      actual: { totalCost: actualTotal, byModel: actualByModel },
      skillEstimate: { totalCost: skillTotal, byModel: skillByModel },
      daily,
      modelDistribution: { actual: actualDist, skillRecommended: skillDist },
    };
  }
}
