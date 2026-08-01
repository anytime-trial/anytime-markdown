// raw .md import 用の jest transformer（webpack asset/source 相当）。
// ファイル実体の文字列を default export する。個別テストの jest.mock は本 transform より優先される。
module.exports = {
  process(sourceText) {
    return { code: `module.exports = ${JSON.stringify(sourceText)};` };
  },
};
