import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/** 拡張機能が配置した Claude Code スキルを削除する */
const INSTALLED_SKILLS = ['anytime-fcmap'];

for (const skillName of INSTALLED_SKILLS) {
  const skillDir = path.join(os.homedir(), '.claude', 'skills', skillName);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true });
  }
}
