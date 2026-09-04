import { readFile, writeFile } from 'node:fs/promises';

export async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}
export async function writeNew(path, text) { await writeFile(path, text, { encoding: 'utf8', flag: 'wx' }); }
export function seconds(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== 'string' || !/^\d{1,3}:\d{2}(?::\d{2})?(?:\.\d+)?$/.test(value)) throw new Error(`Invalid timestamp: ${value}`);
  const parts = value.split(':').map(Number);
  if (parts.slice(1).some(n => n >= 60)) throw new Error(`Invalid timestamp: ${value}`);
  return parts.reduce((n, p) => n * 60 + p, 0);
}
export function time(n) {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
}
export function count(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) throw new Error('Counts must be non-negative integers, not abbreviated values.');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid count');
  return n;
}
export function rates(m) {
  const views = count(m.views), likes = count(m.likes), comments = count(m.comments), shares = count(m.shares), saves = count(m.saves);
  const complete = views > 0 && [likes, comments, shares].every(x => x !== null);
  return { engagement: complete ? (likes + comments + shares) / views * 100 : null,
    withSaves: complete && saves !== null ? (likes + comments + shares + saves) / views * 100 : null };
}
export function normalize(raw, suppliedMetrics, source = '', mode = 'standard') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected an analysis JSON object');
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map(String) : [];
  const meta = raw.metadata ?? {};
  if (!Array.isArray(raw.transcript ?? [])) throw new Error('transcript must be an array');
  const transcript = (raw.transcript ?? []).map((t, i) => {
    if (typeof t.text !== 'string') throw new Error('Transcript text required');
    const start = seconds(t.time ?? t.start);
    const end = t.endTime == null && t.end == null ? null : seconds(t.endTime ?? t.end);
    if (end !== null && end < start) throw new Error('Transcript end precedes start');
    return { id: `transcript:${i}`, start, end, text: t.text };
  });
  const frames = (raw.frames ?? []).map((f, i) => ({ id: `frame:${i}`, time: seconds(f.time), filePath: f.filePath, mimeType: f.mimeType ?? 'image/jpeg' }));
  // Do not combine external snapshot metrics with a different upstream snapshot.
  const base = suppliedMetrics ?? raw.metrics ?? { views: meta.viewCount };
  const metrics = Object.fromEntries(['views', 'likes', 'comments', 'saves', 'shares'].map(k => [k, count(base[k])]));
  metrics.source = base.source ?? (suppliedMetrics ? '' : 'upstream metadata');
  metrics.observedAt = base.observedAt ?? null;
  if (suppliedMetrics && (!metrics.source || !metrics.observedAt)) throw new Error('External metrics require source and observedAt');
  if (suppliedMetrics && meta.viewCount != null && metrics.views !== count(meta.viewCount)) warnings.push('播放量与上游不同；已整组采用用户指定数据来源，未混用。');
  if (!frames.length) warnings.push('没有可检查帧：不得把口播推测写成画面事实。');
  if (!transcript.length) warnings.push('没有转写：这不自动证明无口播，需核对素材。');
  if (!metrics.observedAt) warnings.push('互动数据观察时间未知；不是已核实的最新数据。');
  return { schemaVersion: 1, mode, source: source || meta.url || '', preparedAt: new Date().toISOString(),
    metadata: { title: meta.title ?? '', uploader: meta.uploader ?? '', duration: meta.duration == null ? null : seconds(meta.duration), publishedAt: meta.publishedAt ?? null },
    metrics, rates: rates(metrics), transcript, frames, ocrResults: raw.ocrResults ?? [], warnings };
}

const requiredSections = ['hook', 'pain', 'visual', 'trust', 'structure', 'formula'];
export function validateAnalysis(bundle, analysis) {
  if (bundle.schemaVersion !== 1) throw new Error('Unsupported evidence schema');
  for (const key of requiredSections) if (typeof analysis[key] !== 'string' || !analysis[key].trim()) throw new Error(`Missing section: ${key}`);
  if (!Array.isArray(analysis.segments) || !analysis.segments.length) throw new Error('At least one segment required');
  const refs = new Map([...bundle.transcript, ...bundle.frames].map(x => [x.id, x]));
  let previous = -1;
  for (const s of analysis.segments) {
    const start = seconds(s.start), end = seconds(s.end);
    if (end <= start || start < previous || (bundle.metadata.duration != null && end > bundle.metadata.duration)) throw new Error('Segment time is reversed, overlapping or out of duration');
    previous = end;
    if (!s.role || typeof s.role !== 'string') throw new Error('Segment role required');
    if (s.action && (!s.visualRefs?.length || s.visualChecked !== true)) throw new Error('Visual actions require inspected visualRefs and visualChecked=true');
    for (const ref of s.visualRefs ?? []) {
      const frame = refs.get(ref);
      if (!ref.startsWith('frame:') || !frame || frame.time < start || frame.time > end) throw new Error(`Frame ref outside segment: ${ref}`);
    }
    for (const quote of s.quotes ?? []) {
      const t = refs.get(quote.ref);
      if (!quote.ref?.startsWith('transcript:') || !t || typeof quote.text !== 'string' || !quote.text.trim() || !t.text.includes(quote.text)) throw new Error('Quote must be an exact substring of referenced transcript');
      if (t.start >= end || (t.end ?? t.start) < start) throw new Error('Quote outside segment');
    }
  }
}
function md(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>'); }
function number(v) { return v == null ? '未获取' : v.toLocaleString('en-US'); }
function percent(v) { return v == null ? '无法计算（缺少数据或播放量为0）' : `约${v.toFixed(2)}%`; }
export function render(bundle, analysis) {
  validateAnalysis(bundle, analysis);
  const m = bundle.metrics, r = rates(m), p = analysis.product ?? {};
  const safeLink = /^https?:\/\//.test(bundle.source) ? `[点击查看原视频](${encodeURI(bundle.source).replace(/\(/g, '%28').replace(/\)/g, '%29')})` : md(bundle.source || '未提供');
  const lines = ['# 视频内容拆解', '', ...(analysis.demo ? ['> 合成示例，仅用于验证格式和工具，不是真实视频分析。', ''] : []), '## 信息简介', '',
    `- **视频链接：** ${safeLink}`, `- **品牌：** ${md(p.brand || '待确认')}`, `- **产品：** ${md(p.name || '待确认')}`, `- **产品类型：** ${md(p.type || '待确认')}`, `- **色号／款式：** ${md(p.variant || '未确认')}`,
    `- **产品依据：** ${md(p.source || '未提供，不作确认')}`, `- **博主账号：** ${md(bundle.metadata.uploader || '未获取')}`, `- **发布时间：** ${md(bundle.metadata.publishedAt || '未获取')}`, `- **视频时长：** ${bundle.metadata.duration == null ? '未获取' : time(bundle.metadata.duration)}`,
    `- **播放量：** ${number(m.views)}`, `- **互动数据：** ${number(m.likes)}赞｜${number(m.comments)}评论｜${number(m.saves)}收藏｜${number(m.shares)}分享`,
    `- **互动率：** ${percent(r.engagement)}（点赞＋评论＋分享）÷播放量`, `- **含收藏互动率：** ${percent(r.withSaves)}（点赞＋评论＋收藏＋分享）÷播放量`, `- **数据来源／时间：** ${md(m.source)}／${md(m.observedAt || '未知')}`, '', '## 视频脚本拆解', '', '| 时间 | 做了什么／说了什么 | 内容作用 |', '|---|---|---|'];
  for (const s of analysis.segments) {
    const quotes = (s.quotes ?? []).map(q => `原话（节选）：“${md(q.text)}”${q.translation ? `<br>中文：${md(q.translation)}` : ''}`);
    const action = s.action ? `画面：${md(s.action)}` : '画面：未核实';
    lines.push(`| ${s.approximate ? '约' : ''}${time(seconds(s.start))}–${time(seconds(s.end))} | ${[action, ...quotes].join('<br>')} | ${md(s.role)} |`);
  }
  const headings = { hook: 'Hook', pain: '用户痛点', visual: '视觉方案／视听协同', trust: '信任建立逻辑', structure: '核心爆点结构', formula: '公式提炼' };
  for (const k of requiredSections) lines.push('', `## ${headings[k]}`, '', md(analysis[k]));
  const caveats = [...new Set([...bundle.warnings, ...(analysis.caveats ?? [])])];
  if (caveats.length) lines.push('', '## 核实边界', '', ...caveats.map(c => `- ${md(c)}`));
  return `${lines.join('\n')}\n`;
}
