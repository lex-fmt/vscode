import assert from 'node:assert/strict';
import test from 'node:test';
import { injections } from '@lex/shared';

const { computeInjectionDecorations } = injections;
type InjectionZone = injections.InjectionZone;
type InjectionHostAdapter = injections.InjectionHostAdapter;
type SemanticTokens = injections.SemanticTokens;

function makeZone(lang: string, text: string, row: number, col: number): InjectionZone {
  return {
    language: lang,
    text,
    startRow: row,
    startCol: col,
    endRow: row + 3,
    endCol: 0,
  };
}

const KW_STR_LEGEND = { tokenTypes: ['keyword', 'string'] };

function tokensPayload(data: Uint32Array): SemanticTokens {
  return { legend: KW_STR_LEGEND, data };
}

test('computeInjectionDecorations: aggregates ranges across multiple zones', async () => {
  const zones = [
    makeZone('python', 'def x: pass', 10, 2),
    makeZone('javascript', 'const y = 1', 20, 0),
  ];

  const host: InjectionHostAdapter = {
    getRegisteredLanguages: () => Promise.resolve(new Set(['python', 'javascript'])),
    // Each zone yields one keyword at (0, 0) length 3
    getSemanticTokens: () => Promise.resolve(tokensPayload(new Uint32Array([0, 0, 3, 0, 0]))),
  };

  const ranges = await computeInjectionDecorations(zones, host);
  const kw = ranges.get('keyword')!;
  assert.equal(kw.length, 2);
  assert.deepEqual(kw[0], { startLine: 10, startCol: 2, endLine: 10, endCol: 5 });
  assert.deepEqual(kw[1], { startLine: 20, startCol: 0, endLine: 20, endCol: 3 });

  for (const category of ['string', 'comment', 'number', 'type', 'function', 'operator'] as const) {
    assert.deepEqual(ranges.get(category), []);
  }
});

test('computeInjectionDecorations: unregistered language is skipped', async () => {
  const zones = [makeZone('python', 'def x', 0, 0), makeZone('cobol', 'DISPLAY "X"', 5, 0)];
  let calls = 0;
  const host: InjectionHostAdapter = {
    getRegisteredLanguages: () => Promise.resolve(new Set(['python'])),
    getSemanticTokens: () => {
      calls++;
      return Promise.resolve(tokensPayload(new Uint32Array([0, 0, 3, 0, 0])));
    },
  };

  const ranges = await computeInjectionDecorations(zones, host);
  assert.equal(calls, 1, 'getSemanticTokens should only be called for registered languages');
  assert.equal(ranges.get('keyword')!.length, 1);
});

test('computeInjectionDecorations: null tokens skip the zone silently', async () => {
  const zones = [makeZone('python', 'x', 0, 0), makeZone('rust', 'y', 5, 0)];
  const host: InjectionHostAdapter = {
    getRegisteredLanguages: () => Promise.resolve(new Set(['python', 'rust'])),
    getSemanticTokens: (zoneIndex) =>
      Promise.resolve(zoneIndex === 0 ? tokensPayload(new Uint32Array([0, 0, 1, 0, 0])) : null),
  };

  const ranges = await computeInjectionDecorations(zones, host);
  assert.equal(ranges.get('keyword')!.length, 1);
});

test('computeInjectionDecorations: thrown error skips the zone, does not bubble', async () => {
  const zones = [makeZone('python', 'x', 0, 0), makeZone('rust', 'y', 5, 0)];
  const host: InjectionHostAdapter = {
    getRegisteredLanguages: () => Promise.resolve(new Set(['python', 'rust'])),
    getSemanticTokens: (zoneIndex) => {
      if (zoneIndex === 1) return Promise.reject(new Error('provider boom'));
      return Promise.resolve(tokensPayload(new Uint32Array([0, 0, 1, 0, 0])));
    },
  };

  const ranges = await computeInjectionDecorations(zones, host);
  assert.equal(ranges.get('keyword')!.length, 1, 'only the non-throwing zone contributes');
});

test('computeInjectionDecorations: synchronous throw from getSemanticTokens is also skipped', async () => {
  const zones = [makeZone('python', 'x', 0, 0), makeZone('rust', 'y', 5, 0)];
  const host: InjectionHostAdapter = {
    getRegisteredLanguages: () => Promise.resolve(new Set(['python', 'rust'])),
    getSemanticTokens: (zoneIndex) => {
      if (zoneIndex === 1) throw new Error('sync boom');
      return Promise.resolve(tokensPayload(new Uint32Array([0, 0, 1, 0, 0])));
    },
  };

  const ranges = await computeInjectionDecorations(zones, host);
  assert.equal(ranges.get('keyword')!.length, 1);
});

test('computeInjectionDecorations: empty zones returns all-empty category map', async () => {
  const host: InjectionHostAdapter = {
    getRegisteredLanguages: () =>
      Promise.reject(new Error('should not be called when zones is empty')),
    getSemanticTokens: () => Promise.reject(new Error('should not be called when zones is empty')),
  };
  const ranges = await computeInjectionDecorations([], host);
  assert.equal(ranges.size, 7);
  for (const [, list] of ranges) {
    assert.equal(list.length, 0);
  }
});

test('computeInjectionDecorations: getRegisteredLanguages called exactly once per invocation', async () => {
  const zones = [
    makeZone('python', 'a', 0, 0),
    makeZone('python', 'b', 5, 0),
    makeZone('javascript', 'c', 10, 0),
  ];
  let registeredCalls = 0;
  const host: InjectionHostAdapter = {
    getRegisteredLanguages: () => {
      registeredCalls++;
      return Promise.resolve(new Set(['python', 'javascript']));
    },
    getSemanticTokens: () => Promise.resolve(tokensPayload(new Uint32Array([]))),
  };

  await computeInjectionDecorations(zones, host);
  assert.equal(registeredCalls, 1);
});

test('computeInjectionDecorations: zone index passed to host matches zones array index', async () => {
  const zones = [
    makeZone('python', 'first', 0, 0),
    makeZone('python', 'second', 5, 0),
    makeZone('python', 'third', 10, 0),
  ];
  const seen: Array<{ idx: number; content: string; lang: string }> = [];
  const host: InjectionHostAdapter = {
    getRegisteredLanguages: () => Promise.resolve(new Set(['python'])),
    getSemanticTokens: (zoneIndex, content, langId) => {
      seen.push({ idx: zoneIndex, content, lang: langId });
      return Promise.resolve(tokensPayload(new Uint32Array([])));
    },
  };

  await computeInjectionDecorations(zones, host);
  assert.deepEqual(seen, [
    { idx: 0, content: 'first', lang: 'python' },
    { idx: 1, content: 'second', lang: 'python' },
    { idx: 2, content: 'third', lang: 'python' },
  ]);
});
