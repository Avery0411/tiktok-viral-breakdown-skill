#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readJson, writeNew, normalize, render } from './core.mjs';

const help = `TikTok evidence & report helper (Node 22.12+)
prepare --source URL_OR_FILE | --input UPSTREAM_JSON --out NEW_DIRECTORY
        [--metrics SNAPSHOT_JSON] [--mode standard|light|showcase] [--engine UPSTREAM_INDEX_JS]
render  --bundle EVIDENCE_JSON --analysis ANALYSIS_JSON --out NEW_REPORT_MD
No AI is called by this helper. The skill's host analyzes the evidence.
External metrics require source and observedAt. Output files are never overwritten.`;

export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (!command || command === '--help' || command === '-h') { console.log(help); return; }
  const { values: v, positionals } = parseArgs({ args, allowPositionals: true, options: Object.fromEntries(['source','input','out','metrics','mode','engine','bundle','analysis'].map(k => [k, { type: 'string' }])) });
  if (positionals.length) throw new Error('Unexpected positional arguments');
  if (!v.out) throw new Error('--out required');
  if (command === 'prepare') {
    if (!!v.input === !!v.source) throw new Error('Provide exactly one of --source or --input');
    const mode = v.mode ?? 'standard';
    if (!['standard','light','showcase'].includes(mode)) throw new Error('Invalid mode');
    const out = resolve(v.out);
    let raw;
    const metrics = v.metrics ? await readJson(v.metrics) : undefined;
    if (v.input) raw = await readJson(v.input);
    // No recursive mkdir on final path: refuse reuse of an existing output directory.
    await mkdir(dirname(out), { recursive: true });
    await mkdir(out);
    if (!v.input) {
      let engine = v.engine ? resolve(v.engine) : null;
      if (!engine) {
        try { engine = createRequire(import.meta.url).resolve('mcp-video-analyzer'); }
        catch { throw new Error('Install dependencies with npm install at repository root, or pass --engine path/to/dist/index.js'); }
      }
      await stat(engine);
      const source = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(v.source) ? v.source : resolve(v.source);
      // No shell: URLs are passed as arguments, never executed as commands.
      const result = spawnSync(process.execPath, [engine, 'analyze', source, '--detail', 'standard', '--max-frames', mode === 'light' ? '6' : mode === 'showcase' ? '8' : '12', '--out', join(out, 'frames')], { encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024, shell: false, env: { ...process.env, MCP_CACHE_DIR: process.env.MCP_CACHE_DIR || join(out, 'cache') } });
      if (result.error || result.status !== 0) throw new Error(`Upstream extraction failed. ${result.error?.message ?? result.stderr.slice(-800)}. Use a new --out after resolving the issue.`);
      try { raw = JSON.parse(result.stdout); } catch { throw new Error('Upstream output was not valid JSON'); }
      await writeNew(join(out, 'raw.json'), `${JSON.stringify(raw, null, 2)}\n`);
    }
    const bundle = normalize(raw, metrics, v.source ?? '', mode);
    // Imported frame paths are relative to the input JSON, not this command's cwd.
    for (const frame of bundle.frames) {
      if (typeof frame.filePath !== 'string') throw new Error('Frame filePath must be a string');
      frame.filePath = resolve(v.input ? dirname(resolve(v.input)) : out, frame.filePath);
      try { await stat(frame.filePath); } catch { bundle.warnings.push(`帧不可读取：${frame.id}，不能据此填写动作。`); }
    }
    await writeNew(join(out, 'evidence.json'), `${JSON.stringify(bundle, null, 2)}\n`);
    console.log(JSON.stringify({ evidence: join(out, 'evidence.json'), frames: bundle.frames.length, transcriptEntries: bundle.transcript.length, warnings: bundle.warnings }, null, 2));
  } else if (command === 'render') {
    if (!v.bundle || !v.analysis) throw new Error('--bundle and --analysis required');
    const bundle = await readJson(v.bundle), analysis = await readJson(v.analysis);
    // Reject missing files when a report asserts observations based on them.
    for (const ref of new Set((analysis.segments ?? []).flatMap(s => s.visualRefs ?? []))) {
      const frame = bundle.frames.find(f => f.id === ref);
      if (!frame) throw new Error(`Unknown visual ref: ${ref}`);
      await stat(frame.filePath);
    }
    const report = render(bundle, analysis);
    await mkdir(dirname(resolve(v.out)), { recursive: true });
    await writeNew(resolve(v.out), report);
    console.log(resolve(v.out));
  } else throw new Error(`Unknown command: ${command}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
