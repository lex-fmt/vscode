import assert from 'node:assert/strict';
import test from 'node:test';
import { injections } from '@lex/shared';

const { mapTokensToDecorations, resolveCategory } = injections;
type InjectionRange = injections.InjectionRange;
type DecorationCategory = injections.DecorationCategory;
type InjectionZone = injections.InjectionZone;
type EmbeddedToken = injections.EmbeddedToken;

function emptyRanges(): Map<DecorationCategory, InjectionRange[]> {
  return new Map<DecorationCategory, InjectionRange[]>([
    ['keyword', []],
    ['string', []],
    ['comment', []],
    ['number', []],
    ['type', []],
    ['function', []],
    ['operator', []],
  ]);
}

const ZONE: InjectionZone = {
  language: 'python',
  text: 'placeholder',
  startRow: 10,
  startCol: 4,
  endRow: 20,
  endCol: 0,
};

const MAP = {
  keyword: 'keyword',
  string: 'string',
  comment: 'comment',
  number: 'number',
  type: 'type',
  function: 'function',
  operator: 'operator',
} as const;

function tok(name: string, line: number, startCol: number, endCol: number): EmbeddedToken {
  return { name, startLine: line, startCol, endLine: line, endCol };
}

test('mapTokensToDecorations: line-0 token shifts startCol by zone.startCol', () => {
  const ranges = emptyRanges();
  mapTokensToDecorations([tok('keyword', 0, 2, 5)], ZONE, MAP, ranges);

  const kw = ranges.get('keyword')!;
  assert.equal(kw.length, 1);
  assert.deepEqual(kw[0], {
    startLine: 10, // zone.startRow + 0
    startCol: 6, // zone.startCol (4) + 2
    endLine: 10,
    endCol: 9, // zone.startCol (4) + 5
  });
});

test('mapTokensToDecorations: subsequent lines use raw col without zone.startCol offset', () => {
  const ranges = emptyRanges();
  mapTokensToDecorations([tok('keyword', 0, 0, 3), tok('string', 2, 4, 9)], ZONE, MAP, ranges);

  assert.deepEqual(ranges.get('keyword')![0], {
    startLine: 10,
    startCol: 4,
    endLine: 10,
    endCol: 7,
  });
  assert.deepEqual(ranges.get('string')![0], {
    startLine: 12, // zone.startRow + 2
    startCol: 4, // raw — no zone.startCol shift
    endLine: 12,
    endCol: 9,
  });
});

test('mapTokensToDecorations: unmapped capture name is skipped', () => {
  const ranges = emptyRanges();
  mapTokensToDecorations([tok('variable', 0, 0, 5)], ZONE, MAP, ranges);
  for (const [, list] of ranges) assert.equal(list.length, 0);
});

test('mapTokensToDecorations: hierarchical names fall back via prefix', () => {
  const ranges = emptyRanges();
  // `function.method` is not in MAP, but `function` is. It should resolve.
  mapTokensToDecorations([tok('function.method', 0, 0, 5)], ZONE, MAP, ranges);
  assert.equal(ranges.get('function')!.length, 1);
});

test('mapTokensToDecorations: more specific name wins over its prefix', () => {
  const ranges = emptyRanges();
  // Both `function.method` and `function` in the map; the specific one wins.
  const map = { ...MAP, 'function.method': 'type' as DecorationCategory };
  mapTokensToDecorations([tok('function.method', 0, 0, 5)], ZONE, map, ranges);
  assert.equal(ranges.get('type')!.length, 1);
  assert.equal(ranges.get('function')!.length, 0);
});

test('mapTokensToDecorations: empty token list produces no ranges', () => {
  const ranges = emptyRanges();
  mapTokensToDecorations([], ZONE, MAP, ranges);
  for (const [, list] of ranges) assert.equal(list.length, 0);
});

test('mapTokensToDecorations: zone with startRow=0 still maps line 0 correctly', () => {
  const ranges = emptyRanges();
  const zone: InjectionZone = {
    language: 'python',
    text: 'x',
    startRow: 0,
    startCol: 8,
    endRow: 2,
    endCol: 0,
  };
  mapTokensToDecorations([tok('keyword', 0, 1, 3)], zone, MAP, ranges);
  assert.deepEqual(ranges.get('keyword')![0], {
    startLine: 0,
    startCol: 9, // 8 + 1
    endLine: 0,
    endCol: 11,
  });
});

test('resolveCategory: returns null when nothing matches', () => {
  assert.equal(resolveCategory('punctuation.bracket', MAP), null);
});

test('resolveCategory: returns the most specific match', () => {
  const map = { keyword: 'keyword', 'keyword.return': 'function' } as const;
  assert.equal(resolveCategory('keyword.return', map), 'function');
  assert.equal(resolveCategory('keyword', map), 'keyword');
  assert.equal(resolveCategory('keyword.something.else', map), 'keyword');
});
