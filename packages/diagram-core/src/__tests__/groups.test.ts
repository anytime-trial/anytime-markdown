/**
 * 群の語彙（軸と選択肢）の編集と、線に添える字。
 *
 * どちらも**画面から書き換えられる図の中身**で、鍵（軸の id・選択肢の値）は表示名と独立に持つ。
 * 名前を直した瞬間に家族の持つ値が迷子にならないこと、取り除いたときに家族の側へ孤児が
 * 残らないことを測る。
 */

import {
  addDiagramGroupAxis,
  addDiagramGroupValue,
  parseDiagramDocument,
  removeDiagramGroupAxis,
  removeDiagramGroupValue,
  renameDiagramGroupAxis,
  renameDiagramGroupValue,
  serializeDiagramDocument,
  setDiagramLineLabel,
} from '../document';
import { elementAnchor, familyAnchor, lineAnchor, type DiagramDocument } from '../types';
import { SAMPLE } from './fixture';

const axis = (document: DiagramDocument, id: string) => document.groups.find((item) => item.id === id);

describe('群の軸', () => {
  it('足すと id が繰り上がり、表示名はそのまま入る', () => {
    const next = addDiagramGroupAxis(SAMPLE, ' 話 ');
    expect(next.groups).toHaveLength(2);
    expect(next.groups[1]).toEqual({ id: 'g1', label: '話', values: {} });
  });

  it('同じ id を 2 本作らない', () => {
    const next = addDiagramGroupAxis(addDiagramGroupAxis(SAMPLE, '話'), '章');
    expect(next.groups.map((item) => item.id)).toEqual(['volume', 'g1', 'g2']);
  });

  it('表示名が空なら足さない（名前の無い軸を家族に付けられる状態にしない）', () => {
    expect(addDiagramGroupAxis(SAMPLE, '   ')).toBe(SAMPLE);
  });

  it('改名しても id は変わらないので、家族の持つ値はそのまま残る', () => {
    const next = renameDiagramGroupAxis(SAMPLE, 'volume', '巻数');
    expect(axis(next, 'volume')?.label).toBe('巻数');
    expect(next.families[0]!.groups).toEqual({ volume: 'one' });
  });

  it('空の名前では改名しない', () => {
    expect(renameDiagramGroupAxis(SAMPLE, 'volume', ' ')).toBe(SAMPLE);
  });

  it('取り除くと、その軸を使っていた家族の値も落ちる', () => {
    const next = removeDiagramGroupAxis(SAMPLE, 'volume');
    expect(next.groups).toHaveLength(0);
    expect(next.families.map((family) => family.groups)).toEqual([{}, {}, {}]);
  });

  it('知らない軸を取り除こうとしても図を作り直さない', () => {
    expect(removeDiagramGroupAxis(SAMPLE, 'unknown')).toBe(SAMPLE);
  });
});

describe('群の選択肢', () => {
  it('足すと鍵が繰り上がる', () => {
    const next = addDiagramGroupValue(SAMPLE, 'volume', '下巻');
    expect(axis(next, 'volume')?.values).toEqual({ one: '上巻', two: '中巻', v1: '下巻' });
  });

  it('表示名を書き換えても鍵は変わらない（その値を選んでいた家族が残る）', () => {
    const next = renameDiagramGroupValue(SAMPLE, 'volume', 'one', '上つ巻');
    expect(axis(next, 'volume')?.values.one).toBe('上つ巻');
    expect(next.families[0]!.groups).toEqual({ volume: 'one' });
  });

  it('取り除くと、その値を選んでいた家族からも落ちる（他の値の家族は残る）', () => {
    const next = removeDiagramGroupValue(SAMPLE, 'volume', 'one');
    expect(axis(next, 'volume')?.values).toEqual({ two: '中巻' });
    expect(next.families.map((family) => family.groups)).toEqual([{}, { volume: 'two' }, {}]);
  });

  it('知らない値・知らない軸なら何もしない', () => {
    expect(removeDiagramGroupValue(SAMPLE, 'volume', 'three')).toBe(SAMPLE);
    expect(addDiagramGroupValue(SAMPLE, 'unknown', '下巻')).toBe(SAMPLE);
  });
});

describe('線に添える字', () => {
  const WITH_LINK: DiagramDocument = {
    ...SAMPLE,
    nodes: ['独神'],
    connectors: [{
      id: 'c1',
      from: elementAnchor('独神'),
      to: elementAnchor('化生'),
      line: 'solid',
      color: 'default',
      route: 'straight',
      start: 'none',
      end: 'arrow',
    }],
  };

  it('家族の線へ付く（親の組で指す）', () => {
    const next = setDiagramLineLabel(SAMPLE, familyAnchor(['父', '母']), ' 婚姻 ');
    expect(next.families[1]!.label).toBe('婚姻');
    expect(next.families[0]!.label).toBeUndefined();
  });

  it('手で引いた線へ付く（id で指す）', () => {
    const next = setDiagramLineLabel(WITH_LINK, lineAnchor('c1'), '生成');
    expect(next.connectors[0]!.label).toBe('生成');
  });

  it('空にすると項目ごと落ちる（触っていない図に空の項目を残さない）', () => {
    const labelled = setDiagramLineLabel(WITH_LINK, lineAnchor('c1'), '生成');
    const cleared = setDiagramLineLabel(labelled, lineAnchor('c1'), '  ');
    expect('label' in cleared.connectors[0]!).toBe(false);
  });

  it('要素を指す端には付かない（要素の字は名札と注記が受け持つ）', () => {
    expect(setDiagramLineLabel(SAMPLE, elementAnchor('父'), '婚姻')).toBe(SAMPLE);
  });

  it('図に居ない線を指しても図を作り直さない', () => {
    expect(setDiagramLineLabel(WITH_LINK, lineAnchor('c9'), '生成')).toBe(WITH_LINK);
    expect(setDiagramLineLabel(SAMPLE, familyAnchor(['居ない親']), '婚姻')).toBe(SAMPLE);
  });

  it('書き出した字をそのまま読み戻せる', () => {
    const labelled = setDiagramLineLabel(setDiagramLineLabel(WITH_LINK, lineAnchor('c1'), '生成'),
      familyAnchor(['父', '母']), '婚姻');
    expect(parseDiagramDocument(JSON.parse(serializeDiagramDocument(labelled)))).toEqual(labelled);
  });

  it('空白だけの字は読み取りで落とす（保存し直すたびに空の項目が湧かない）', () => {
    const raw = JSON.parse(serializeDiagramDocument(SAMPLE));
    raw.families[0].label = '   ';
    expect(parseDiagramDocument(raw)?.families[0]).toEqual(SAMPLE.families[0]);
  });

  it('文字列でない字は読まずに断る（読み捨てると書いた字が黙って消える）', () => {
    const raw = JSON.parse(serializeDiagramDocument(SAMPLE));
    raw.families[0].label = 3;
    const warnings: string[] = [];
    expect(parseDiagramDocument(raw, (message) => warnings.push(message))).toBeNull();
    expect(warnings).toHaveLength(1);
  });
});
