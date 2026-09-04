import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readJson, count, rates, seconds, normalize, render, validateAnalysis } from '../skills/tiktok-viral-breakdown/scripts/core.mjs';

const raw = await readJson(new URL('../examples/raw.json', import.meta.url));
const metrics = await readJson(new URL('../examples/metrics.json', import.meta.url));
const analysis = await readJson(new URL('../examples/analysis.json', import.meta.url));
const make = () => normalize(raw, metrics);
test('rates exclude saves from the standard numerator', () => {
  assert.deepEqual(rates(metrics), { engagement: 5.5, withSaves: 6.3 });
});
test('missing vs zero metrics remain distinct', () => {
  assert.equal(rates({ views: 100, likes: 0, comments: 0, shares: 0 }).engagement, 0);
  assert.equal(rates({ views: 100, likes: 5, comments: 0 }).engagement, null);
  assert.equal(rates({ ...metrics, views: 0 }).engagement, null);
  assert.equal(rates({ ...metrics, saves: null }).withSaves, null);
});
test('bad counts are rejected', () => {
  for (const n of ['33.3k', -1, true, Infinity, 1.5, ['123']]) assert.throws(() => count(n));
  assert.equal(count('1234'), 1234);
});
test('time parsing rejects malformed seconds and supports hours', () => {
  assert.equal(seconds('01:02:03.5'), 3723.5);
  assert.throws(() => seconds('00:99'));
  assert.throws(() => seconds(-1));
});
test('external snapshot does not borrow missing upstream views', () => {
  const b = normalize({ ...raw, metadata: { viewCount: 500 } }, { likes: 20, source: 'screenshot', observedAt: '2026-01-01' });
  assert.equal(b.metrics.views, null);
  assert.equal(b.rates.engagement, null);
  assert.throws(() => normalize(raw, { views: 5 }));
});
test('preserves all transcript entries, even in light mode', () => {
  const b = normalize({ ...raw, transcript: Array.from({length: 20}, (_,i) => ({time: i, text: `entry ${i}`})) }, undefined, '', 'light');
  assert.equal(b.transcript.length, 20);
});
test('local media creation time is not a platform publication date', () => {
  assert.equal(normalize({metadata:{creationTime:'2026-01-01'}}).metadata.publishedAt,null);
});
test('report renders supplied original words and missing visual boundary', () => {
  const result = render(make(), analysis);
  assert.match(result, /I want color without the constant touch-ups/);
  assert.match(result, /画面：未核实/);
  assert.match(result, /约5.50%/);
  assert.match(result, /合成示例/);
});
test('rejects invented quote', () => {
  const a = structuredClone(analysis); a.segments[0].quotes[0].text = 'It lasts seven days';
  assert.throws(() => validateAnalysis(make(), a), /exact substring/);
});
test('rejects visual actions without inspected evidence', () => {
  const a = structuredClone(analysis); a.segments[0].action = 'She rubs her lips';
  assert.throws(() => validateAnalysis(make(), a), /Visual actions/);
});
test('checks image time and review flag', () => {
  const b = make(); b.frames = [{id:'frame:0', time:2, filePath:'example.jpg'}];
  const a = structuredClone(analysis); Object.assign(a.segments[0], {action:'Static frame: lips visible', visualRefs:['frame:0'], visualChecked:true});
  assert.doesNotThrow(() => validateAnalysis(b, a));
  b.frames[0].time = 7;
  assert.throws(() => validateAnalysis(b, a), /outside segment/);
});
test('rejects reversed, overlapping and out of bounds times', () => {
  for (const change of [{start:4,end:2}, {start:0,end:9}]) {
    const a = structuredClone(analysis); Object.assign(a.segments[0],change);
    assert.throws(() => validateAnalysis(make(),a));
  }
  const a = structuredClone(analysis); a.segments[1].start = 3;
  assert.throws(() => validateAnalysis(make(),a));
});
test('missing section rejected', () => {
  const a = structuredClone(analysis); delete a.hook;
  assert.throws(() => validateAnalysis(make(),a), /Missing section/);
});
test('CLI offline pipeline, unicode paths and overwrite protection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tiktok-skill-test-'));
  const cli = resolve('skills/tiktok-viral-breakdown/scripts/cli.mjs');
  const out = join(dir, '中文 证据');
  const run = args => spawnSync(process.execPath, [cli, ...args], {encoding:'utf8'});
  const prep = ['prepare','--input','examples/raw.json','--metrics','examples/metrics.json','--out',out];
  assert.equal(run(prep).status, 0);
  assert.notEqual(run(prep).status, 0);
  const report = join(out, 'report.md');
  const args = ['render','--bundle',join(out,'evidence.json'),'--analysis','examples/analysis.json','--out',report];
  assert.equal(run(args).status, 0);
  assert.notEqual(run(args).status, 0);
  assert.match(await readFile(report,'utf8'), /公式提炼/);
});
test('CLI propagates upstream failures without writing false report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tiktok-engine-test-'));
  const engine = join(dir, 'engine.mjs');
  await writeFile(engine, 'process.stderr.write("fixture failure"); process.exit(2);');
  const r = spawnSync(process.execPath, ['skills/tiktok-viral-breakdown/scripts/cli.mjs','prepare','--source','https://example.com/video.mp4','--engine',engine,'--out',join(dir,'run')], {encoding:'utf8'});
  assert.notEqual(r.status,0); assert.match(r.stderr,/Upstream extraction failed/);
});
