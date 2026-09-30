// 全ワークスペースの package.json（ルート + packages/*）から dependencies / devDependencies を集計し、
// 同一モジュールの版の混在を列挙する。weekly-research トピック 6 の手順 1 で使う。
// 使い方: node .claude/skills-archive/weekly-research/scripts/deps-inventory.cjs <リポジトリルート>
const fs=require("fs"),path=require("path");
const root=process.argv[2]; const m=new Map(); let n=0;
const dirs=["."].concat(fs.readdirSync(path.join(root,"packages")).map(d=>"packages/"+d));
for (const d of dirs) {
  const p=path.join(root,d,"package.json"); if(!fs.existsSync(p)) continue; n++;
  const j=JSON.parse(fs.readFileSync(p,"utf8"));
  for (const k of ["dependencies","devDependencies"]) for (const [name,v] of Object.entries(j[k]??{})) {
    if (name.startsWith("@anytime-markdown/")) continue;
    if(!m.has(name)) m.set(name,new Map()); const vs=m.get(name); vs.set(v,[...(vs.get(v)??[]),d]);
  }
}
const mixed=[...m].filter(([,vs])=>vs.size>1);
console.log(`package.json: ${n} / モジュール: ${m.size} / 版の混在: ${mixed.length}`);
for (const [name,vs] of mixed.sort()) console.log("MIXED", name, [...vs].map(([v,ds])=>`${v}(${ds.length})`).join(" "));
