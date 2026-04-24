import assert from 'node:assert/strict';
import test from 'node:test';
import { injections } from '@lex/shared';

const { mapTokensToDecorations } = injections;
type InjectionRange = injections.InjectionRange;
type DecorationCategory = injections.DecorationCategory;
type InjectionZone = injections.InjectionZone;

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

// Standard LSP semantic-token legend — `keyword` at index 0, `string` at 1, etc.
const LEGEND = {
  tokenTypes: ['keyword', 'string', 'comment', 'number', 'operator', 'variable'],
};

test('mapTokensToDecorations: single token on line 0 uses zone.startCol offset', () => {
  const ranges = emptyRanges();
  // One keyword token at (0, 2), length 3
  const data = new Uint32Array([0, 2, 3, 0, 0]);
  mapTokensToDecorations({ legend: LEGEND, data }, ZONE, ranges);

  const kw = ranges.get('keyword')!;
  assert.equal(kw.length, 1);
  assert.deepEqual(kw[0], {
    startLine: 10, // zone.startRow + 0
    startCol: 6, // zone.startCol (4) + startChar (2)
    endLine: 10,
    endCol: 9, // startCol + length (3)
  });
});

test('mapTokensToDecorations: multi-line delta — subsequent lines use raw startChar', () => {
  const ranges = emptyRanges();
  // Two tokens: keyword at virtual (0, 0) len 3, string at virtual (2, 4) len 5
  // After the first token, current (line=0, startChar=0).
  // Second delta: deltaLine=2 → line=2, startChar=4 (resets)
  const data = new Uint32Array([0, 0, 3, 0, 0, 2, 4, 5, 1, 0]);
  mapTokensToDecorations({ legend: LEGEND, data }, ZONE, ranges);

  const kw = ranges.get('keyword')!;
  const str = ranges.get('string')!;
  assert.equal(kw.length, 1);
  assert.deepEqual(kw[0], {
    startLine: 10, // zone.startRow + 0
    startCol: 4, // zone.startCol (4) + 0
    endLine: 10,
    endCol: 7,
  });
  assert.equal(str.length, 1);
  assert.deepEqual(str[0], {
    startLine: 12, // zone.startRow (10) + 2
    startCol: 4, // raw startChar (no zone.startCol offset on lines > 0)
    endLine: 12,
    endCol: 9,
  });
});

test('mapTokensToDecorations: same-line delta accumulates startChar', () => {
  const ranges = emptyRanges();
  // Two tokens on same line: keyword at (0, 0) len 3, string at (0, +5) len 4
  // After first token, line=0 startChar=0. deltaLine=0 → startChar += 5 = 5.
  const data = new Uint32Array([0, 0, 3, 0, 0, 0, 5, 4, 1, 0]);
  mapTokensToDecorations({ legend: LEGEND, data }, ZONE, ranges);

  const kw = ranges.get('keyword')!;
  const str = ranges.get('string')!;
  assert.equal(kw.length, 1);
  assert.deepEqual(kw[0], {
    startLine: 10,
    startCol: 4,
    endLine: 10,
    endCol: 7,
  });
  assert.equal(str.length, 1);
  assert.deepEqual(str[0], {
    startLine: 10,
    startCol: 9, // zone.startCol (4) + accumulated startChar (5)
    endLine: 10,
    endCol: 13,
  });
});

test('mapTokensToDecorations: unknown token-type index (out of legend) is skipped', () => {
  const ranges = emptyRanges();
  // typeIndex=99 — outside legend
  const data = new Uint32Array([0, 0, 3, 99, 0]);
  mapTokensToDecorations({ legend: LEGEND, data }, ZONE, ranges);

  for (const [, list] of ranges) {
    assert.equal(list.length, 0);
  }
});

test('mapTokensToDecorations: unmapped token-type name (e.g. variable) is skipped', () => {
  const ranges = emptyRanges();
  // variable (index 5 in legend) — not in SEMANTIC_TOKEN_MAP
  const data = new Uint32Array([0, 0, 3, 5, 0]);
  mapTokensToDecorations({ legend: LEGEND, data }, ZONE, ranges);

  for (const [, list] of ranges) {
    assert.equal(list.length, 0);
  }
});

test('mapTokensToDecorations: routes aliased token types to the right category', () => {
  const ranges = emptyRanges();
  // Custom legend to cover the aliased mappings.
  const legend = {
    tokenTypes: ['class', 'method', 'regexp', 'modifier', 'macro', 'namespace'],
  };
  // Each on its own virtual line so deltas are simple.
  const data = new Uint32Array([
    0,
    0,
    1,
    0,
    0, // class → type
    1,
    0,
    1,
    1,
    0, // method → function
    1,
    0,
    1,
    2,
    0, // regexp → string
    1,
    0,
    1,
    3,
    0, // modifier → keyword
    1,
    0,
    1,
    4,
    0, // macro → function
    1,
    0,
    1,
    5,
    0, // namespace → type
  ]);
  mapTokensToDecorations({ legend, data }, ZONE, ranges);

  assert.equal(ranges.get('type')!.length, 2);
  assert.equal(ranges.get('function')!.length, 2);
  assert.equal(ranges.get('string')!.length, 1);
  assert.equal(ranges.get('keyword')!.length, 1);
});

test('mapTokensToDecorations: empty data produces no ranges', () => {
  const ranges = emptyRanges();
  mapTokensToDecorations({ legend: LEGEND, data: new Uint32Array([]) }, ZONE, ranges);
  for (const [, list] of ranges) {
    assert.equal(list.length, 0);
  }
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
  const data = new Uint32Array([0, 1, 2, 0, 0]); // keyword at (0, 1) len 2
  mapTokensToDecorations({ legend: LEGEND, data }, zone, ranges);
  const kw = ranges.get('keyword')!;
  assert.equal(kw.length, 1);
  assert.deepEqual(kw[0], {
    startLine: 0,
    startCol: 9, // 8 + 1
    endLine: 0,
    endCol: 11,
  });
});
