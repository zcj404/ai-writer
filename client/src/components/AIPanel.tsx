import React, { useState, useEffect, useRef } from 'react';
import { AIAction } from '../types';
import { Chapter } from '../types';

interface ProofreadItem {
  original: string;
  suggestion: string;
  reason: string;
  accepted?: boolean;
  ignored?: boolean;
}

interface Props {
  selectedText?: string;
  onInsert?: (text: string) => void;
  onClearSelection?: () => void;
  currentChapter?: Chapter | null;
  fullContent?: string;
  onApplyFix?: (original: string, suggestion: string) => void;
  chapters?: Chapter[];
  hideHeader?: boolean;
}

const ACTIONS: { key: AIAction; label: string; desc: string; icon: string }[] = [
  { key: 'continue', label: '续写', desc: '从当前内容继续创作', icon: '✍️' },
  { key: 'expand', label: '扩写', desc: '扩展内容，增加细节', icon: '📝' },
  { key: 'rewrite', label: '改写', desc: '改写选中内容', icon: '🔄' },
  { key: 'polish', label: '润色', desc: '优化语言表达', icon: '✨' },
  { key: 'summarize', label: '摘要', desc: '生成内容摘要', icon: '📋' },
  { key: 'proofread', label: '校对', desc: '检查错别字和语病', icon: '🔍' },
];

// Simple hash for change detection
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; }
  return h.toString(36);
}

function getProofreadKey(chapterId: string) { return `proofread_hash_${chapterId}`; }

export default function AIPanel({ selectedText, onInsert, onClearSelection, currentChapter, fullContent, onApplyFix, chapters = [], hideHeader }: Props) {
  const [action, setAction] = useState<AIAction>('continue');
  const [inputs, setInputs] = useState<Partial<Record<AIAction, string>>>({});
  const [results, setResults] = useState<Partial<Record<AIAction, string>>>({});
  const [loading, setLoading] = useState(false);

  // Proofread state
  const [proofItems, setProofItems] = useState<Record<'selection'|'chapter', ProofreadItem[]>>({ selection: [], chapter: [] });
  const [proofScope, setProofScope] = useState<'selection' | 'chapter'>('selection');
  const [proofError, setProofError] = useState<Record<'selection'|'chapter', string>>({ selection: '', chapter: '' });
  const [showReproofConfirm, setShowReproofConfirm] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  // Smooth progress: displayPct animates toward targetPct
  const [displayPct, setDisplayPct] = useState(0);
  const targetPctRef = useRef(0);
  const animFrameRef = useRef(0);
  const progressLabelRef = useRef('');

  const input = inputs[action] || '';
  const result = results[action] || '';
  const setInput = (v: string) => setInputs(prev => ({ ...prev, [action]: v }));
  const setResult = (v: string | ((p: string) => string)) =>
    setResults(prev => ({ ...prev, [action]: typeof v === 'function' ? v(prev[action] || '') : v }));

  // When switching away from proofread, clear proofItems
  useEffect(() => {
    if (action !== 'proofread') {
      setProofItems({ selection: [], chapter: [] });
      setProofError({ selection: '', chapter: '' });
    }
  }, [action]);

  // Sync selectedChapterId with currentChapter
  useEffect(() => {
    if (currentChapter && !selectedChapterId) setSelectedChapterId(currentChapter.id);
  }, [currentChapter]);

  const startSmoothProgress = (total: number) => {
    targetPctRef.current = 0;
    setDisplayPct(0);
    progressLabelRef.current = total > 1 ? `正在校对第 1/${total} 段` : '校对中…';
    const animate = () => {
      setDisplayPct(prev => {
        const delta = targetPctRef.current - prev;
        return Math.abs(delta) < 0.2 ? targetPctRef.current : prev + delta * 0.08;
      });
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
  };

  const advanceProgress = (done: number, total: number) => {
    // cap at 95% until fully done
    targetPctRef.current = Math.min((done / total) * 95, 95);
    if (total > 1) progressLabelRef.current = done < total ? `正在校对第 ${done + 1}/${total} 段` : `校对完成`;
  };

  const finishProgress = () => {
    targetPctRef.current = 100;
    setTimeout(() => { cancelAnimationFrame(animFrameRef.current); setDisplayPct(0); }, 500);
  };

  const streamRun = async (actionKey: AIAction, text: string, context?: string) => {
    setLoading(true);
    setResult('');
    try {
      const baseURL = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api';
      const token = localStorage.getItem('token');
      const resp = await fetch(`${baseURL}/ai/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: actionKey, text, context }),
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
          if (parsed.text) setResult(prev => prev + parsed.text);
          if (parsed.error) setResult('错误：' + parsed.error);
        }
      }
    } catch (err: any) {
      setResult('错误：' + err.message);
    }
    setLoading(false);
  };

  const run = async () => {
    if (action === 'proofread') { runProofread(); return; }
    const text = selectedText || input || '';
    const context = selectedText ? input : undefined;
    if (!text.trim()) return;
    await streamRun(action, text, context);
  };

  const runProofread = async (force = false) => {
    let text = '';
    let chapterId = '';
    if (proofScope === 'chapter') {
      const ch = chapters.find(c => c.id === selectedChapterId);
      if (!ch) { setProofError(prev => ({ ...prev, chapter: '请先选择章节' })); return; }
      text = ch.content;
      chapterId = ch.id;
      if (!text.trim()) { setProofError(prev => ({ ...prev, chapter: '该章节内容为空' })); return; }
    } else {
      text = selectedText || '';
    }
    if (!text.trim()) { setProofError(prev => ({ ...prev, [proofScope]: '请先选中文本，或切换到"整章校对"' })); return; }

    if (proofScope === 'chapter' && chapterId && !force) {
      const savedHash = localStorage.getItem(getProofreadKey(chapterId));
      if (savedHash === simpleHash(text)) { setShowReproofConfirm(true); return; }
    }

    doProofread(text, chapterId);
  };

  const CHUNK_SIZE = 1500;

  const splitChunks = (text: string): string[] => {
    if (text.length <= CHUNK_SIZE) return [text];
    const chunks: string[] = [];
    const paras = text.split(/\n+/);
    let cur = '';
    for (const p of paras) {
      if (cur.length + p.length > CHUNK_SIZE && cur) { chunks.push(cur.trim()); cur = ''; }
      if (p.length > CHUNK_SIZE) {
        // split long paragraph
        for (let i = 0; i < p.length; i += CHUNK_SIZE) chunks.push(p.slice(i, i + CHUNK_SIZE));
      } else { cur += (cur ? '\n' : '') + p; }
    }
    if (cur.trim()) chunks.push(cur.trim());
    return chunks;
  };

  const fetchProofChunk = async (text: string): Promise<ProofreadItem[]> => {
    const baseURL = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api';
    const token = localStorage.getItem('token');
    const resp = await fetch(`${baseURL}/ai/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action: 'proofread', text }),
    });
    if (resp.status === 429) {
      const data = await resp.json();
      throw new Error(data.error || '今日次数已用完');
    }
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '', raw = '';
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
        if (parsed.text) raw += parsed.text;
      }
    }
    const start = raw.indexOf('['), end = raw.lastIndexOf(']');
    if (start === -1) return [];
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { return []; }
  };

  const doProofread = async (text: string, chapterId = '') => {
    const scope = proofScope;
    setShowReproofConfirm(false);
    setProofItems(prev => ({ ...prev, [scope]: [] }));
    setProofError(prev => ({ ...prev, [scope]: '' }));
    setLoading(true);

    try {
      const chunks = splitChunks(text);
      startSmoothProgress(chunks.length);
      const allItems: ProofreadItem[] = [];
      for (let i = 0; i < chunks.length; i++) {
        advanceProgress(i, chunks.length);
        const items = await fetchProofChunk(chunks[i]);
        allItems.push(...items);
        setProofItems(prev => ({ ...prev, [scope]: [...allItems] }));
        advanceProgress(i + 1, chunks.length);
      }
      finishProgress();

      if (scope === 'chapter' && chapterId) {
        localStorage.setItem(getProofreadKey(chapterId), simpleHash(text));
      }
      if (allItems.length === 0) setProofError(prev => ({ ...prev, [scope]: '未发现问题，文本已通顺 ✓' }));
    } catch (err: any) {
      setProofError(prev => ({ ...prev, [scope]: '校对失败：' + err.message }));
      cancelAnimationFrame(animFrameRef.current);
      setDisplayPct(0);
    }
    setLoading(false);
  };

  const acceptFix = (idx: number) => {
    const item = proofItems[proofScope][idx];
    if (!onApplyFix) return;
    onApplyFix(item.original, item.suggestion);
    setProofItems(prev => ({ ...prev, [proofScope]: prev[proofScope].map((it, i) => i === idx ? { ...it, accepted: true } : it) }));
  };

  const ignoreFix = (idx: number) => {
    setProofItems(prev => ({ ...prev, [proofScope]: prev[proofScope].map((it, i) => i === idx ? { ...it, ignored: true } : it) }));
  };

  const acceptAll = () => {
    proofItems[proofScope].forEach(item => {
      if (!item.accepted && !item.ignored && onApplyFix) onApplyFix(item.original, item.suggestion);
    });
    setProofItems(prev => ({ ...prev, [proofScope]: prev[proofScope].map(it => ({ ...it, accepted: true })) }));
  };

  const isProofread = action === 'proofread';
  const currentProofItems = proofItems[proofScope];
  const activeItems = currentProofItems.filter(it => !it.accepted && !it.ignored);
  const doneItems = currentProofItems.filter(it => it.accepted || it.ignored);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Action selector */}
      <div className="px-3 py-3 border-b border-slate-200">
        {!hideHeader && <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">AI 助手</h3>}
        <div className="grid grid-cols-6 gap-0.5">
          {ACTIONS.map(a => (
            <button key={a.key} onClick={() => setAction(a.key)} title={a.desc}
              className={`p-1.5 rounded-lg text-xs flex flex-col items-center gap-0.5 transition-colors ${action === a.key ? 'bg-violet-100 text-violet-700 font-medium' : 'hover:bg-slate-100 text-slate-500'}`}>
              <span>{a.icon}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Proofread UI */}
      {isProofread ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Scope selector */}
          <div className="px-3 py-3 border-b border-slate-200 flex flex-col gap-2">
            <div className="flex gap-1 bg-slate-100 rounded-xl p-0.5">
              <button className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${proofScope === 'selection' ? 'bg-white shadow-sm text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'}`}
                onClick={() => setProofScope('selection')}>选中文本</button>
              <button className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${proofScope === 'chapter' ? 'bg-white shadow-sm text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'}`}
                onClick={() => setProofScope('chapter')}>整章校对</button>
            </div>
            {proofScope === 'selection' && selectedText && (
              <div className="px-2.5 py-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-slate-600 truncate">
                <span className="text-amber-600 font-medium">已选：</span>
                {selectedText.length > 60 ? selectedText.slice(0, 60) + '…' : selectedText}
              </div>
            )}
            {proofScope === 'chapter' && (
              <select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                value={selectedChapterId} onChange={e => setSelectedChapterId(e.target.value)}>
                <option value="">选择章节…</option>
                {chapters.map((c, i) => <option key={c.id} value={c.id}>第{i + 1}章 {c.title}</option>)}
              </select>
            )}
            <button onClick={() => runProofread()}
              disabled={loading || (proofScope === 'selection' && !selectedText) || (proofScope === 'chapter' && !selectedChapterId)}
              className="w-full bg-violet-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors">
              {loading ? '校对中…' : '开始校对'}
            </button>
          </div>

          {/* Progress bar */}
          {loading && displayPct > 0 && (
            <div className="px-3 pt-3 flex flex-col gap-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>{progressLabelRef.current}</span>
                <span>{Math.round(displayPct)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                <div className="h-1 bg-violet-500 rounded-full" style={{ width: `${displayPct}%`, transition: 'none' }} />
              </div>
            </div>
          )}
          {loading && displayPct === 0 && (
            <div className="px-3 pt-3">
              <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                <div className="h-1 rounded-full bg-violet-500" style={{ width: '30%', animation: 'indeterminate 1.5s ease-in-out infinite' }} />
              </div>
            </div>
          )}
          {showReproofConfirm && (
            <div className="mx-3 mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col gap-2">
              <p className="text-xs text-amber-800">该章节自上次校对以来内容未变，是否重新校对？</p>
              <div className="flex gap-2">
                <button className="flex-1 text-xs py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
                  onClick={() => setShowReproofConfirm(false)}>取消</button>
                <button className="flex-1 text-xs py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                  onClick={() => { const t = fullContent || ''; doProofread(t); }}>重新校对</button>
              </div>
            </div>
          )}
          {proofError[proofScope] && !loading && (
            <div className="mx-3 mt-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">{proofError[proofScope]}</div>
          )}
          {currentProofItems.length > 0 && (
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-400">共 {currentProofItems.length} 处，剩余 {activeItems.length} 处</span>
                {activeItems.length > 0 && (
                  <button onClick={acceptAll} className="text-xs text-violet-600 hover:text-violet-700 font-medium">全部接受</button>
                )}
              </div>
              {currentProofItems.map((item, idx) => (
                <div key={idx} className={`rounded-xl border border-slate-200 p-3 flex flex-col gap-1.5 text-xs transition-opacity ${item.accepted ? 'opacity-40' : item.ignored ? 'opacity-30' : ''}`}>
                  <div className="flex gap-1.5 items-start">
                    <span className="text-red-400 font-semibold shrink-0">原</span>
                    <span className="text-slate-600 line-through">{item.original}</span>
                  </div>
                  <div className="flex gap-1.5 items-start">
                    <span className="text-emerald-500 font-semibold shrink-0">改</span>
                    <span className="text-slate-900 font-medium">{item.suggestion}</span>
                  </div>
                  <div className="text-slate-400">{item.reason}</div>
                  {!item.accepted && !item.ignored && (
                    <div className="flex gap-2 mt-0.5">
                      <button onClick={() => acceptFix(idx)} disabled={!onApplyFix}
                        className="flex-1 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors">接受</button>
                      <button onClick={() => ignoreFix(idx)}
                        className="flex-1 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">忽略</button>
                    </div>
                  )}
                  {item.accepted && <span className="text-emerald-500">✓ 已接受</span>}
                  {item.ignored && <span className="text-slate-400">— 已忽略</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Normal action input */}
          <div className="p-3 border-b">
            {selectedText && (
              <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-gray-600 flex items-start gap-1">
                <span className="flex-1 whitespace-pre-wrap break-words"><span className="text-yellow-600 font-medium">已选文本：</span>{selectedText.length > 300 ? selectedText.slice(0, 300) + '...' : selectedText}</span>
                {onClearSelection && <button onClick={onClearSelection} className="text-yellow-400 hover:text-yellow-600 shrink-0 ml-1">×</button>}
              </div>
            )}
            <textarea
              className="w-full border rounded p-2 text-sm h-24 resize-none"
              placeholder={`输入${ACTIONS.find(a => a.key === action)?.desc}的内容...`}
              value={input}
              onChange={e => setInput(e.target.value)}
            />
            <button
              onClick={run}
              disabled={loading}
              className="w-full mt-2 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
            >
              {loading ? '生成中...' : `开始${ACTIONS.find(a => a.key === action)?.label}`}
            </button>
          </div>

          {result && (
            <div className="flex-1 p-3 overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-xs font-medium text-gray-500">生成结果</h4>
                <div className="flex gap-2">
                  {onInsert && (
                    <button onClick={() => onInsert(result)} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">
                      插入编辑器
                    </button>
                  )}
                  <button onClick={() => navigator.clipboard.writeText(result)} className="text-xs border px-2 py-1 rounded hover:bg-gray-50">
                    复制
                  </button>
                </div>
              </div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 p-3 rounded">
                {result}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
