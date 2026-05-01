import React, { useState, useEffect } from 'react';
import { Chapter } from '../types';
import { aiApi } from '../api';

interface Props { projectId: string; chapters: Chapter[]; }

type Mode = 'brainstorm' | 'conflict' | 'plot_twist' | 'hook' | 'diagnose';

const MODES: { key: Mode; label: string; icon: string; desc: string }[] = [
  { key: 'brainstorm', label: '情节走向',  icon: '🧭', desc: '基于近期章节，推演后续可能走向' },
  { key: 'conflict',   label: '冲突设计',  icon: '⚡', desc: '设计章节内小冲突或主线大冲突' },
  { key: 'plot_twist', label: '转折反转',  icon: '🌀', desc: '选取章节，生成出人意料的反转点' },
  { key: 'hook',       label: '章节钩子',  icon: '🪝', desc: '生成吸引读者继续阅读的悬念钩子' },
  { key: 'diagnose',   label: '写作诊断',  icon: '🔍', desc: '选取一章，AI 给出具体写作改进建议' },
];

// 章节选择限制
const MIN_CHAPTERS = 3;
const MAX_CHAPTERS = 8;
const HARD_LIMIT   = 10;

// 把选中章节转为 AI 输入文本（带摘要缓存，长度差<20字则复用）
const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

async function chaptersToText(selected: Chapter[], allChapters: Chapter[], forceRefresh?: Set<string>): Promise<string> {
  const summaries = await Promise.all(selected.map(async (c) => {
    const globalIdx = allChapters.findIndex(x => x.id === c.id) + 1;
    if (!c.content.trim()) return null;
    if (!forceRefresh?.has(c.id)) {
      const cached = await aiApi.getSummary(c.id);
      if (cached && Math.abs(cached.content_length - c.content.length) < 20) {
        return `第${globalIdx}章《${c.title}》：${cached.summary}`;
      }
    }
    const summary = await aiApi.assist('summarize', c.content);
    aiApi.saveSummary(c.id, summary, c.content.length);
    return `第${globalIdx}章《${c.title}》：${summary}`;
  }));
  return summaries.filter(Boolean).join('\n\n');
}

export default function Inspiration({ projectId, chapters }: Props) {
  const [mode, setMode] = useState<Mode>('brainstorm');
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd,   setRangeEnd]   = useState<number | null>(null);
  const [extraHint,    setExtraHint]    = useState('');
  const [conflictType, setConflictType] = useState<'minor' | 'major'>('minor');
  const [majorInput,   setMajorInput]   = useState('');
  const [results, setResults] = useState<Partial<Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [comboSummarizing, setComboSummarizing] = useState(false);
  const [forceRefreshIds, setForceRefreshIds] = useState<Set<string>>(new Set());

  // 侧边栏状态
  const [writingTips,    setWritingTips]    = useState<string[]>([]);
  const [plotStructures, setPlotStructures] = useState<{ name: string; beats: string[] }[]>([]);
  const [randSettings,   setRandSettings]   = useState<string[]>([]);
  const [randRelations,  setRandRelations]  = useState<string[]>([]);
  const [randConflicts,  setRandConflicts]  = useState<string[]>([]);
  const [tipIdx,    setTipIdx]    = useState(0);
  const [structIdx, setStructIdx] = useState(0);
  const [randWords, setRandWords] = useState<{ setting: string; relation: string; conflict: string } | null>(null);
  const [randLoading, setRandLoading] = useState(false);
  const [diagnoseChapter, setDiagnoseChapter] = useState<string>('');
  const [diagnoseResult, setDiagnoseResult] = useState<{dimension:string;issue:string;suggestion:string}[]>([]);

  // 从服务端加载配置
  useEffect(() => {
    aiApi.inspirationConfig().then(cfg => {
      setWritingTips(cfg.writing_tips);
      setPlotStructures(cfg.plot_structures);
      setRandSettings(cfg.rand_settings);
      setRandRelations(cfg.rand_relations);
      setRandConflicts(cfg.rand_conflicts);
    });
  }, []);

  const resultKey = mode === 'conflict' ? `${mode}_${conflictType}` : mode;
  const result    = results[resultKey] || '';
  const setResult = (v: string | ((p: string) => string)) =>
    setResults(prev => ({ ...prev, [resultKey]: typeof v === 'function' ? v(prev[resultKey] || '') : v }));


  // 用 AI 生成贴合故事的灵感组合
  const genAiCombo = async () => {
    if (chapters.length === 0) {
      setRandWords({ setting: pick(randSettings), relation: pick(randRelations), conflict: pick(randConflicts) });
      return;
    }
    setComboSummarizing(true);
    const text = await chaptersToText(chapters.slice(-5), chapters, forceRefreshIds);
    setComboSummarizing(false);
    setForceRefreshIds(new Set());
    setRandLoading(true);
    try {
      const result = await aiApi.assist('inspiration_combo' as any, text);
      const parsed = JSON.parse(result);
      if (parsed.setting && parsed.relation && parsed.conflict) {
        setRandWords({ setting: parsed.setting, relation: parsed.relation, conflict: parsed.conflict });
        setRandLoading(false);
        return;
      }
    } catch { /* fallback to random */ }
    setRandWords({ setting: pick(randSettings), relation: pick(randRelations), conflict: pick(randConflicts) });
    setRandLoading(false);
  };

  // ── 连续章节选择逻辑 ──────────────────────────────────────────
  // 点击章节按钮：首次点击设起点，第二次点击设终点（自动排序），第三次重置
  const handleChapterClick = (idx: number) => {
    if (rangeStart === null) {
      setRangeStart(idx);
      setRangeEnd(null);
    } else if (rangeEnd === null && idx === rangeStart) {
      // 再次点击同一章 → 取消选中
      setRangeStart(null);
      setRangeEnd(null);
    } else if (rangeEnd === null && idx !== rangeStart) {
      const lo = Math.min(rangeStart, idx);
      const hi = Math.max(rangeStart, idx);
      // 硬限制
      if (hi - lo + 1 > HARD_LIMIT) {
        const clipped = lo + HARD_LIMIT - 1;
        setRangeEnd(clipped);
      } else {
        setRangeEnd(hi);
        setRangeStart(lo);
      }
    } else {
      // 重置，重新选
      setRangeStart(idx);
      setRangeEnd(null);
    }
  };

  const isInRange = (idx: number) => {
    if (rangeStart === null) return false;
    const lo = rangeStart;
    const hi = rangeEnd ?? rangeStart;
    return idx >= lo && idx <= hi;
  };

  // 选中的章节列表（连续区间）
  const selectedChapters: Chapter[] = (() => {
    if (rangeStart === null) return [];
    const lo = rangeStart;
    const hi = rangeEnd ?? rangeStart;
    return chapters.slice(lo, hi + 1);
  })();

  // 默认：最近5章（但不超过章节总数）
  const defaultChapters = chapters.slice(-Math.min(5, chapters.length));
  const effectiveChapters = selectedChapters.length > 0 ? selectedChapters : defaultChapters;

  const selectedCount = selectedChapters.length;
  const overRecommended = selectedCount > MAX_CHAPTERS;
  const overHard = selectedCount > HARD_LIMIT;

  // ── streaming ────────────────────────────────────────────────
  const stream = async (action: string, text: string, context?: string) => {
    setLoading(true);
    setResult('');
    try {
      const baseURL = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api';
      const token = localStorage.getItem('token');
      const resp = await fetch(`${baseURL}/ai/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action, text, context }),
      });
      if (resp.status === 429) {
        const data = await resp.json();
        setResult('⚠️ ' + (data.error || '今日次数已用完'));
        setLoading(false);
        return;
      }
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop()!;
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          const parsed = JSON.parse(data);
          if (parsed.text)  setResult(prev => prev + parsed.text);
          if (parsed.error) setResult('错误：' + parsed.error);
        }
      }
    } catch (err: any) {
      setResult('错误：' + err.message);
    }
    setLoading(false);
  };

  // ── 执行生成 ─────────────────────────────────────────────────
  const run = async () => {
    if (mode === 'brainstorm') {
      setSummarizing(true);
      const text = await chaptersToText(effectiveChapters, chapters, forceRefreshIds);
      setSummarizing(false);
      setForceRefreshIds(new Set());
      if (!text) { setResult('暂无章节内容，请先创作章节。'); return; }
      await stream('brainstorm', text, extraHint || undefined);

    } else if (mode === 'conflict') {
      if (conflictType === 'major') {
        if (!majorInput.trim()) return;
        await stream('conflict', majorInput, 'major');
      } else {
        setSummarizing(true);
        const text = await chaptersToText(effectiveChapters, chapters, forceRefreshIds);
        setSummarizing(false);
        setForceRefreshIds(new Set());
        if (!text) { setResult('暂无章节内容，请先创作章节。'); return; }
        await stream('conflict', text, 'minor');
      }

    } else if (mode === 'plot_twist' || mode === 'hook') {
      setSummarizing(true);
      const text = await chaptersToText(effectiveChapters, chapters, forceRefreshIds);
      setSummarizing(false);
      setForceRefreshIds(new Set());
      if (!text) { setResult('暂无章节内容，请先创作章节。'); return; }
      await stream(mode, text);

    } else if (mode === 'diagnose') {
      const ch = chapters.find(c => c.id === diagnoseChapter) || chapters[chapters.length - 1];
      if (!ch) { setResult('暂无章节内容'); return; }
      setLoading(true);
      setDiagnoseResult([]);
      try {
        const res = await aiApi.assist('diagnose' as any, ch.content);
        const parsed = JSON.parse(res);
        setDiagnoseResult(parsed);
      } catch {
        setResult('解析失败，请重试');
      } finally {
        setLoading(false);
      }
    }
  };

  const canRun = () => {
    if (loading) return false;
    if (mode === 'diagnose') return chapters.length > 0;
    if (mode === 'conflict' && conflictType === 'major') return majorInput.trim().length > 0;
    return chapters.length > 0 && !overHard;
  };

  // ── 章节选择器（所有模式通用）──────────────────────────────
  const showMajorConflictInput = mode === 'conflict' && conflictType === 'major';

  const ChapterSelector = () => (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">选择章节范围</span>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <button onClick={() => { setRangeStart(null); setRangeEnd(null); }}
              className="text-xs text-slate-400 hover:text-red-400 transition-colors">
              重置
            </button>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            selectedCount === 0 ? 'bg-slate-100 text-slate-400' :
            overRecommended   ? 'bg-amber-100 text-amber-600' :
                                'bg-violet-100 text-violet-600'
          }`}>
            {selectedCount === 0 ? `默认最近 ${defaultChapters.length} 章` : `已选 ${selectedCount} 章`}
          </span>
        </div>
      </div>

      {/* 提示文字 */}
      <div className={`text-xs mb-3 px-3 py-2 rounded-xl border ${
        overRecommended
          ? 'bg-amber-50 border-amber-200 text-amber-600'
          : 'bg-slate-50 border-slate-200 text-slate-400'
      }`}>
        {overRecommended
          ? `⚠️ 已选 ${selectedCount} 章，超过建议上限 ${MAX_CHAPTERS} 章，生成速度会明显变慢。`
          : `点击起始章节，再点击末尾章节，自动选中连续区间（建议 ${MIN_CHAPTERS}–${MAX_CHAPTERS} 章，最多 ${HARD_LIMIT} 章）`
        }
      </div>

      {/* 章节格子 */}
      <div className="flex flex-wrap gap-2">
        {chapters.map((c, idx) => {
          const inRange  = isInRange(idx);
          const isStart  = idx === rangeStart;
          const isEnd    = rangeEnd !== null && idx === rangeEnd;
          const isSingle = rangeStart !== null && rangeEnd === null && idx === rangeStart;
          return (
            <button key={c.id} onClick={() => handleChapterClick(idx)}
              title={`第${idx + 1}章 ${c.title}`}
              className={`px-2.5 py-1.5 rounded-lg text-xs border transition-all select-none ${
                inRange
                  ? isStart || isEnd || isSingle
                    ? 'bg-violet-600 text-white border-violet-600 font-semibold ring-2 ring-violet-300'
                    : 'bg-violet-100 text-violet-700 border-violet-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-600'
              }`}>
              第{idx + 1}章
            </button>
          );
        })}
      </div>

      {selectedCount > 0 && (
        <div className="mt-2 text-xs text-slate-400">
          已选：第{(rangeStart ?? 0) + 1}章
          {rangeEnd !== null && rangeEnd !== rangeStart ? ` — 第${rangeEnd + 1}章` : ''}
          （共 {selectedCount} 章）
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto px-8 py-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-1">情节灵感</h2>
        <p className="text-sm text-slate-400 mb-6">AI 读取章节内容，辅助激发创作灵感</p>

        <div className="flex gap-6 items-start">
        {/* ── 左侧主区域 ── */}
        <div className="flex-1 min-w-0">

        {/* Mode tabs */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {MODES.map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              className={`flex flex-col items-start gap-1.5 px-4 py-4 rounded-2xl border text-left transition-all ${
                mode === m.key
                  ? 'bg-violet-600 text-white border-violet-600 shadow-md'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:shadow-sm'
              }`}>
              <span className="text-xl">{m.icon}</span>
              <span className="text-sm font-semibold">{m.label}</span>
              <span className={`text-xs leading-relaxed ${mode === m.key ? 'text-violet-200' : 'text-slate-400'}`}>{m.desc}</span>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">

          {/* 冲突设计：先选小/大冲突类型 */}
          {mode === 'conflict' && (
            <div className="flex gap-2 mb-5">
              <button onClick={() => setConflictType('minor')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${conflictType === 'minor' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                ⚡ 章节小冲突
              </button>
              <button onClick={() => setConflictType('major')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${conflictType === 'major' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                💥 主线大冲突
              </button>
            </div>
          )}

          {/* 写作诊断：单章下拉选择 */}
          {mode === 'diagnose' ? (
            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-700 mb-2">选择要诊断的章节</label>
              <select
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                value={diagnoseChapter}
                onChange={e => setDiagnoseChapter(e.target.value)}
              >
                {chapters.map((c, idx) => (
                  <option key={c.id} value={c.id}>第{idx + 1}章 {c.title}</option>
                ))}
              </select>
            </div>
          ) : /* 主线大冲突：手动输入背景，无需读章节 */
          showMajorConflictInput ? (
            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-700 mb-2">描述故事整体背景</label>
              <textarea
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm placeholder-slate-400 h-32 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="描述故事整体情况：主角、核心目标、主要势力、世界背景…"
                value={majorInput} onChange={e => setMajorInput(e.target.value)}
              />
            </div>
          ) : (
            /* 其他所有模式：显示章节选择器 */
            <>
              <ChapterSelector />

              {/* 情节走向：额外补充方向 */}
              {mode === 'brainstorm' && (
                <div className="mb-5">
                  <label className="block text-sm font-medium text-slate-700 mb-2">补充创作方向（可选）</label>
                  <textarea
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm placeholder-slate-400 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    placeholder="例如：想要加入一个背叛情节，或者希望节奏加快…"
                    value={extraHint} onChange={e => setExtraHint(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          {/* 生成按钮 */}
          <button onClick={run} disabled={!canRun() || summarizing}
            className="w-full bg-violet-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors mb-2">
            {summarizing
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
                  正在逐章总结，请耐心等待…
                </span>
              : loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
                  AI 生成中…
                </span>
              : `✨ 生成${MODES.find(m => m.key === mode)!.label}`
            }
          </button>
          {!showMajorConflictInput && overHard && (
            <p className="text-xs text-center text-red-400 mb-2">选择章节超过上限 {HARD_LIMIT} 章，请缩小范围后再生成</p>
          )}

          {/* 结果 */}
          {mode === 'diagnose' && diagnoseResult.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-700">诊断结果</h4>
                <span className="text-xs text-slate-400">仅供参考</span>
              </div>
              <div className="flex flex-col gap-3">
                {diagnoseResult.map((item, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <div className="text-xs font-semibold text-violet-600 mb-1">{item.dimension}</div>
                    <div className="text-xs text-slate-500 mb-1"><span className="font-medium text-slate-600">问题：</span>{item.issue}</div>
                    <div className="text-xs text-slate-700"><span className="font-medium">建议：</span>{item.suggestion}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {mode !== 'diagnose' && result && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-semibold text-slate-700">生成结果</h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">仅供参考</span>
                  <button onClick={run} disabled={loading}
                    className="text-xs border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors">
                    重新生成
                  </button>
                  <button onClick={() => navigator.clipboard.writeText(result)}
                    className="text-xs border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                    复制
                  </button>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {result}
              </div>
              <div className="mt-2 text-right">
                <button
                  onClick={() => {
                    const ids = new Set(effectiveChapters.map(c => c.id));
                    setForceRefreshIds(ids);
                    run();
                  }}
                  disabled={loading || summarizing}
                  className="text-xs text-slate-400 hover:text-violet-600 transition-colors disabled:opacity-50">
                  结果不准确？重新读取章节 ↺
                </button>
              </div>
            </div>
          )}
        </div>{/* end white card */}
        </div>{/* end left col */}

        {/* ── 右侧侧边栏 ── */}
        <div className="w-64 shrink-0 flex flex-col gap-4 sticky top-8 self-start">

          {/* 写作技巧 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">写作技巧</span>
              <button onClick={() => setTipIdx(i => (i + 1) % writingTips.length)}
                className="text-xs text-slate-400 hover:text-violet-600 transition-colors">
                换一条 ↻
              </button>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{writingTips[tipIdx] ?? '加载中…'}</p>
            <div className="mt-2 text-xs text-slate-300">{writingTips.length > 0 ? `${tipIdx + 1} / ${writingTips.length}` : ''}</div>
          </div>

          {/* 情节结构参考 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">情节结构</span>
              {plotStructures.length > 0 && (
                <button onClick={() => setStructIdx(i => (i + 1) % plotStructures.length)}
                  className="text-xs text-slate-400 hover:text-violet-600 transition-colors">切换 ↻</button>
              )}
            </div>
            {plotStructures[structIdx] ? (
              <>
                <div className="text-xs font-semibold text-violet-600 mb-2">{plotStructures[structIdx].name}</div>
                <ol className="flex flex-col gap-1.5">
                  {plotStructures[structIdx].beats.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center shrink-0 font-semibold text-[10px] mt-0.5">{i + 1}</span>
                      {b}
                    </li>
                  ))}
                </ol>
              </>
            ) : <p className="text-xs text-slate-400">加载中…</p>}
          </div>

          {/* 随机灵感词 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="mb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">随机灵感</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              {chapters.length > 0
                ? `基于最新 ${Math.min(5, chapters.length)} 章内容，AI 延展生成贴合故事的灵感组合（场景 + 关系 + 冲突）`
                : '随机组合场景 + 关系 + 冲突，打破思维定势'}
            </p>
            {randWords && (
              <div className="flex flex-col gap-1.5 mb-3">
                {([
                  { label: '场景', value: randWords.setting,  color: 'bg-blue-50 text-blue-700 border-blue-200' },
                  { label: '关系', value: randWords.relation, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                  { label: '冲突', value: randWords.conflict, color: 'bg-amber-50 text-amber-700 border-amber-200' },
                ] as const).map(({ label, value, color }) => (
                  <div key={label} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${color}`}>
                    <span className="font-semibold shrink-0">{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={genAiCombo} disabled={randLoading || comboSummarizing}
              className="w-full py-2 rounded-xl text-xs font-medium border border-violet-200 text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-50">
              {comboSummarizing
                ? <span className="flex items-center justify-center gap-1"><span className="inline-block w-3 h-3 border border-violet-300 border-t-violet-600 rounded-full animate-spin" />逐章总结中…</span>
                : randLoading
                ? <span className="flex items-center justify-center gap-1"><span className="inline-block w-3 h-3 border border-violet-300 border-t-violet-600 rounded-full animate-spin" />生成中…</span>
                : randWords ? '再来一组 ↻' : '生成灵感组合'}
            </button>
            {randWords && chapters.length > 0 && (
              <div className="mt-1 text-right">
                <button
                  onClick={() => { setForceRefreshIds(new Set(chapters.slice(-5).map(c => c.id))); genAiCombo(); }}
                  disabled={randLoading || comboSummarizing}
                  className="text-xs text-slate-400 hover:text-violet-600 transition-colors disabled:opacity-50">
                  结果不准确？重新读取章节 ↺
                </button>
              </div>
            )}
          </div>

        </div>{/* end sidebar */}
        </div>{/* end flex row */}
      </div>
    </div>
  );
}
