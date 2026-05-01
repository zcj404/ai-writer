import React, { useState, useEffect, useRef, useCallback } from 'react';
import { chaptersApi, volumesApi, milestonesApi } from '../api';
import { Chapter, Volume, Milestone } from '../types';
import AIPanel from './AIPanel';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  projectId: string;
  chapters: Chapter[];
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
  onRegisterRefresh?: (fn: () => void) => void;
}

// ── 今日码字 ────────────────────────────────────────────────
const TODAY_KEY = () => `today_words_${new Date().toISOString().slice(0, 10)}`;
function getTodayWords(): number { return parseInt(localStorage.getItem(TODAY_KEY()) || '0', 10); }
function addTodayWords(n: number) {
  if (n <= 0) return;
  const k = TODAY_KEY();
  localStorage.setItem(k, String(getTodayWords() + n));
}

export default function ChapterEditor({ projectId, chapters, setChapters }: Props) {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [current, setCurrent] = useState<Chapter | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState(true);
  const [selectedText, setSelectedText] = useState('');
  const [chapterCollapsed, setChapterCollapsed] = useState(false);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [milestonesCollapsed, setMilestonesCollapsed] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  // 今日码字
  const [todayWords, setTodayWords] = useState(getTodayWords);
  const prevWordCount = useRef(0);

  // 卷的收起状态
  const [collapsedVolumes, setCollapsedVolumes] = useState<Set<string>>(new Set());

  const toggleVolumeCollapse = (volId: string) => {
    setCollapsedVolumes(prev => {
      const next = new Set(prev);
      if (next.has(volId)) next.delete(volId); else next.add(volId);
      return next;
    });
  };

  // 编辑卷名
  const [editingVolumeId, setEditingVolumeId] = useState<string | null>(null);
  const [editingVolumeName, setEditingVolumeName] = useState('');

  // 确认删除
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'chapter' | 'volume'; id: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<any>(null);

  // ── 加载卷 ───────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([volumesApi.list(projectId), milestonesApi.list(projectId)]).then(([vols, mils]) => {
      setMilestones(mils);
      if (vols.length === 0) {
        // 自动创建第一卷
        volumesApi.create(projectId, { name: '第一卷', order_num: 0 }).then(v => {
          setVolumes([v]);
          // 把已有章节归入第一卷
          chapters.forEach(ch => {
            if (!ch.volume_id) chaptersApi.update(projectId, ch.id, { volume_id: v.id });
          });
          setChapters(prev => prev.map(c => ({ ...c, volume_id: c.volume_id || v.id })));
        });
      } else {
        setVolumes(vols);
        setCollapsedVolumes(new Set(vols.map(v => v.id)));
      }
    });
  }, [projectId]);

  // 切换回章节页时刷新情节钉
  useEffect(() => {
    const handler = () => {
      if (!document.hidden) milestonesApi.list(projectId).then(setMilestones);
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [projectId]);

  // ── 保存 ────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!current) return;
    const newCount = content.replace(/\s/g, '').length;
    const old = prevWordCount.current;
    if (newCount > old) addTodayWords(newCount - old);
    prevWordCount.current = newCount;
    setTodayWords(getTodayWords());
    await chaptersApi.update(projectId, current.id, { title, content });
    setChapters(prev => prev.map(c => c.id === current.id ? { ...c, title, content, word_count: newCount } : c));
    setSaved(true);
  }, [current, title, content, projectId]);

  useEffect(() => {
    if (!current) return;
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 2000);
    return () => clearTimeout(saveTimer.current);
  }, [content, title]); // eslint-disable-line

  const selectChapter = (ch: Chapter) => {
    setCurrent(ch);
    setContent(ch.content);
    setTitle(ch.title);
    setSaved(true);
    prevWordCount.current = ch.word_count;
  };

  // ── 章节操作 ────────────────────────────────────────────────
  const createChapter = async (volumeId: string) => {
    // 全局章节数 + 1 作为默认标题（第N章）
    const defaultTitle = `第${chapters.length + 1}章`;
    const ch = await chaptersApi.create(projectId, { title: defaultTitle, content: '', order_num: chapters.length, volume_id: volumeId });
    setChapters(prev => [...prev, ch]);
    selectChapter(ch);
    // 新建章节后展开该卷（若已收起）
    setCollapsedVolumes(prev => { const next = new Set(prev); next.delete(volumeId); return next; });
  };

  const removeChapter = async (id: string) => {
    setConfirmDelete(null);
    await chaptersApi.remove(projectId, id);
    setChapters(prev => prev.filter(c => c.id !== id));
    if (current?.id === id) { setCurrent(null); setContent(''); setTitle(''); }
  };

  // ── 卷操作 ──────────────────────────────────────────────────
  const createVolume = async () => {
    const defaultName = `第${volumes.length + 1}卷`;
    const v = await volumesApi.create(projectId, { name: defaultName, order_num: volumes.length });
    setVolumes(prev => [...prev, v]);
  };

  const saveVolumeName = async (id: string) => {
    if (!editingVolumeName.trim()) return;
    await volumesApi.update(projectId, id, editingVolumeName);
    setVolumes(prev => prev.map(v => v.id === id ? { ...v, name: editingVolumeName } : v));
    setEditingVolumeId(null);
  };

  const removeVolume = async (id: string) => {
    setConfirmDelete(null);
    await volumesApi.remove(projectId, id);
    setVolumes(prev => prev.filter(v => v.id !== id));
    setChapters(prev => prev.map(c => c.volume_id === id ? { ...c, volume_id: null } : c));
  };

  // ── 编辑器辅助 ───────────────────────────────────────────────
  const handleSelect = () => {
    const sel = window.getSelection()?.toString().trim();
    if (sel) setSelectedText(sel);
  };

  const insertText = (text: string) => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    ta.focus();
    const start = ta.selectionStart, end = ta.selectionEnd;
    ta.setSelectionRange(start, end);
    document.execCommand('insertText', false, '\n\n' + text + '\n\n');
  };

  const applyFix = (original: string, suggestion: string) => {
    setContent(prev => {
      const idx = prev.indexOf(original);
      if (idx === -1) return prev;
      return prev.slice(0, idx) + suggestion + prev.slice(idx + original.length);
    });
  };

  // ── 渲染章节列表（按卷分组）────────────────────────────────
  // chapters 状态本身已按 order_num 升序排好，直接 filter 后 reverse 即可得到倒序
  const chaptersByVolume = (volId: string) =>
    chapters.filter(c => c.volume_id === volId).reverse();
  const unassigned = chapters.filter(c => !c.volume_id).reverse();

  return (
    <div className="flex h-full">
      {confirmDelete && (
        <ConfirmDialog
          message={confirmDelete.type === 'chapter' ? '确认删除此章节？删除后无法恢复。' : '确认删除此卷？卷内章节不会被删除，但会失去卷归属。'}
          onConfirm={() => confirmDelete.type === 'chapter' ? removeChapter(confirmDelete.id) : removeVolume(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* ── 章节列表 ── */}
      <div className={`${chapterCollapsed ? 'w-8' : 'w-56'} border-r border-slate-200 bg-slate-50 flex flex-col transition-all duration-200 overflow-hidden relative`}>
        {chapterCollapsed ? (
          <button onClick={() => setChapterCollapsed(false)} title="展开章节列表"
            className="absolute top-1/2 -translate-y-1/2 left-0 right-0 mx-auto w-6 h-10 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-violet-100 hover:text-violet-600 text-slate-500 transition-colors text-base font-bold z-10">›</button>
        ) : (
          <>
            {/* 头部：今日码字 + 新建卷 */}
            <div className="px-3 py-2.5 border-b border-slate-200 flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">章节</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={createVolume} className="text-xs text-slate-400 hover:text-violet-600 transition-colors" title="新建卷">＋卷</button>
                  <button onClick={() => setChapterCollapsed(true)} title="收起"
                    className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-violet-100 hover:text-violet-600 text-slate-500 text-base font-bold transition-colors">‹</button>
                </div>
              </div>
              {/* 今日码字 */}
              <div className="flex items-center gap-1 bg-violet-50 rounded-lg px-2 py-1">
                <span className="text-xs text-violet-400">今日码字</span>
                <span className="text-xs font-bold text-violet-600 ml-auto">{todayWords.toLocaleString()} 字</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* 按卷显示 */}
              {volumes.map(vol => (
                <div key={vol.id}>
                  {/* 卷标题行 */}
                  <div className="group flex items-center px-3 py-2 bg-slate-100 border-b border-slate-200 cursor-pointer"
                    onClick={() => toggleVolumeCollapse(vol.id)}>
                    {/* 收起/展开倒三角按钮 */}
                    <span
                      className="mr-1.5 text-slate-400 shrink-0 w-4 flex items-center justify-center text-xs"
                      style={{ transform: collapsedVolumes.has(vol.id) ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}
                    >▼</span>
                    {editingVolumeId === vol.id ? (
                      <input className="flex-1 text-xs font-semibold text-slate-700 bg-transparent border-b border-violet-400 outline-none min-w-0"
                        value={editingVolumeName}
                        onChange={e => setEditingVolumeName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveVolumeName(vol.id); if (e.key === 'Escape') setEditingVolumeId(null); }}
                        onBlur={() => saveVolumeName(vol.id)}
                        autoFocus />
                    ) : (
                      <span className="flex-1 text-xs font-semibold text-slate-600 truncate cursor-pointer"
                        onDoubleClick={() => { setEditingVolumeId(vol.id); setEditingVolumeName(vol.name); }}>
                        {vol.name}
                      </span>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
                      <button onClick={() => createChapter(vol.id)} className="text-slate-400 hover:text-violet-600 text-xs" title="新建章节">＋</button>
                      <button onClick={() => setConfirmDelete({ type: 'volume', id: vol.id })} className="text-slate-300 hover:text-red-400 text-xs" title="删除卷">✕</button>
                    </div>
                  </div>

                  {/* 该卷下的章节（支持收起） */}
                  {!collapsedVolumes.has(vol.id) && (
                    <>
                      {chaptersByVolume(vol.id).map(ch => {
                        // 章节序号：在全局升序排列中的位置（1-based）
                        const globalIdx = chapters.findIndex(c => c.id === ch.id) + 1;
                        return (
                          <div key={ch.id} onClick={() => selectChapter(ch)}
                            className={`px-3 py-2.5 cursor-pointer group relative border-b border-slate-100 transition-colors hover:bg-white ${current?.id === ch.id ? 'bg-white border-l-2 border-l-violet-500' : ''}`}>
                            <div className="text-xs font-medium text-slate-800 truncate pr-5">第{globalIdx}章 {ch.title}</div>
                            <div className="text-xs text-slate-400 mt-0.5">{ch.word_count} 字</div>
                            <button onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'chapter', id: ch.id }); }}
                              className="absolute right-2 top-2.5 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs">✕</button>
                          </div>
                        );
                      })}
                      {chaptersByVolume(vol.id).length === 0 && (
                        <div className="text-xs text-slate-400 text-center py-3">暂无章节</div>
                      )}
                    </>
                  )}
                </div>
              ))}

              {/* 未归卷的章节（兼容旧数据） */}
              {unassigned.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-400">未归卷</div>
                  {unassigned.map(ch => {
                    const globalIdx = chapters.findIndex(c => c.id === ch.id) + 1;
                    return (
                      <div key={ch.id} onClick={() => selectChapter(ch)}
                        className={`px-3 py-2.5 cursor-pointer group relative border-b border-slate-100 transition-colors hover:bg-white ${current?.id === ch.id ? 'bg-white border-l-2 border-l-violet-500' : ''}`}>
                        <div className="text-xs font-medium text-slate-800 truncate pr-5">第{globalIdx}章 {ch.title}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{ch.word_count} 字</div>
                        <button onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'chapter', id: ch.id }); }}
                          className="absolute right-2 top-2.5 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}

              {volumes.length === 0 && chapters.length === 0 && (
                <div className="text-xs text-slate-400 text-center py-10">点击"＋卷"创建卷</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── 编辑器 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {current ? (
          <>
            <div className="px-6 py-3 border-b border-slate-200 flex items-center gap-4">
              <input className="flex-1 text-lg font-semibold text-slate-900 border-none outline-none bg-transparent placeholder-slate-300"
                value={title} onChange={e => setTitle(e.target.value)} placeholder="章节标题" />
              <div className="flex items-center gap-3 text-xs text-slate-400 shrink-0">
                <span>{content.replace(/\s/g, '').length} 字</span>
                <span className={`font-medium ${saved ? 'text-emerald-500' : 'text-amber-500'}`}>{saved ? '已保存' : '未保存'}</span>
                <button onClick={save} className="border border-slate-200 text-slate-500 px-2.5 py-1 rounded-lg hover:bg-slate-50 transition-colors">保存</button>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              className="flex-1 px-8 py-6 text-slate-800 leading-9 resize-none outline-none text-base bg-white"
              placeholder="开始写作…"
              value={content}
              onChange={e => setContent(e.target.value)}
              onMouseUp={handleSelect}
              onKeyUp={handleSelect}
              onPaste={e => {
                e.preventDefault();
                const text = e.clipboardData.getData('text').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{2,}/g, '\n');
                const el = e.currentTarget;
                const start = el.selectionStart, end = el.selectionEnd;
                const next = content.slice(0, start) + text + content.slice(end);
                setContent(next);
                requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + text.length; });
              }}
              style={{ fontSize: '16px', fontFamily: '"Noto Serif SC", "Source Han Serif", serif' }}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="text-4xl mb-3">📖</div>
              <div className="text-sm">选择章节开始编辑</div>
            </div>
          </div>
        )}
      </div>

      {/* ── AI 面板 ── */}
      {aiCollapsed ? (
        <div className="w-10 border-l border-slate-200 bg-white flex flex-col items-center py-3 gap-3 relative">
          <button onClick={() => setAiCollapsed(false)} title="展开AI助手"
            className="absolute top-1/2 -translate-y-1/2 w-6 h-10 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-violet-100 hover:text-violet-600 text-slate-500 text-base font-bold transition-colors z-10">‹</button>
          {[
            { key: 'continue', icon: '✍️' }, { key: 'expand', icon: '📝' }, { key: 'rewrite', icon: '🔄' },
            { key: 'polish', icon: '✨' }, { key: 'summarize', icon: '📋' }, { key: 'proofread', icon: '🔍' },
          ].map(a => (
            <button key={a.key} onClick={() => setAiCollapsed(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-violet-50 text-base transition-colors">{a.icon}</button>
          ))}
        </div>
      ) : (
        <div className="w-72 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">AI 助手</span>
            <button onClick={() => setAiCollapsed(true)} title="收起"
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-violet-100 hover:text-violet-600 text-slate-500 text-base font-bold transition-colors">›</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* 本卷情节钉 */}
            {current?.volume_id && milestones.filter(m => m.volume_id === current.volume_id).length > 0 && (
              <MilestoneSidebar milestones={milestones.filter(m => m.volume_id === current.volume_id)} />
            )}
            <AIPanel selectedText={selectedText} onInsert={current ? insertText : undefined} onClearSelection={() => setSelectedText('')} currentChapter={current} fullContent={content} onApplyFix={current ? applyFix : undefined} chapters={chapters} hideHeader />
          </div>
        </div>
      )}
    </div>
  );
}

function MilestoneSidebar({ milestones }: { milestones: Milestone[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="border-b border-slate-100">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 cursor-pointer"
        onClick={() => setCollapsed(p => !p)}>
        <span className="text-xs font-semibold text-slate-500">本卷情节钉</span>
        <span className="text-xs text-slate-400">{collapsed ? '▼' : '▲'}</span>
      </div>
      {!collapsed && milestones.map((m, i) => (
        <div key={m.id} className="border-b border-slate-100">
          <div className="px-3 py-2 flex items-start gap-2 cursor-pointer hover:bg-slate-50"
            onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
            <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-500 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-700">{m.title}</div>
              {m.tag && <span className="text-xs text-violet-400">{m.tag}</span>}
            </div>
            <span className="text-xs text-slate-300">{expanded === m.id ? '▲' : '▼'}</span>
          </div>
          {expanded === m.id && (
            <div className="px-3 pb-2 ml-6 space-y-1">
              {m.description && <p className="text-xs text-slate-500 leading-relaxed">{m.description}</p>}
              {m.target_chapter && <div className="text-xs text-slate-400">目标章节：{m.target_chapter}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
