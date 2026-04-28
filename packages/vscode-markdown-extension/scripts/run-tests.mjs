import path from "node:path";
import { fileURLToPath } from "node:url";

import { runTests } from "@vscode/test-electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionDevelopmentPath = path.resolve(__dirname, "..");
const extensionTestsPath = path.resolve(extensionDevelopmentPath, "out/test/extension.test.js");

try {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
