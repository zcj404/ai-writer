import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AiNovel, AiNovelVolume, AiNovelChapter } from '../types';
import { aiNovelsApi } from '../api';

interface ChatMsg { role: 'user' | 'assistant'; content: string; proposal?: any; }
interface Props { novel: AiNovel; onBack: () => void; }
type View = 'volumes' | 'chapters';
type ChatPanel = 'world' | 'volume' | 'chapter' | null;

// Confirm dialog helper
function useConfirm() {
  const [state, setState] = useState<{ msg: string; resolve: (v: boolean) => void } | null>(null);
  const [choiceState, setChoiceState] = useState<{ msg: string; options: {label: string; value: string}[]; resolve: (v: string | null) => void } | null>(null);
  const confirm = (msg: string) => new Promise<boolean>(resolve => setState({ msg, resolve }));
  const choose = (msg: string, options: {label: string; value: string}[]) => new Promise<string | null>(resolve => setChoiceState({ msg, options, resolve }));
  const Dialog = state ? (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
        <div className="text-sm text-slate-700 leading-relaxed mb-5 whitespace-pre-wrap">{state.msg}</div>
        <div className="flex gap-2 justify-end">
          <button onClick={() => { state.resolve(false); setState(null); }} className="text-xs text-slate-500 border border-slate-200 px-4 py-1.5 rounded-lg hover:bg-slate-50">取消</button>
          <button onClick={() => { state.resolve(true); setState(null); }} className="text-xs bg-violet-600 text-white px-4 py-1.5 rounded-lg hover:bg-violet-700">确认</button>
        </div>
      </div>
    </div>
  ) : choiceState ? (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
        <div className="text-sm text-slate-700 leading-relaxed mb-5 whitespace-pre-wrap">{choiceState.msg}</div>
        <div className="flex gap-2 justify-end flex-wrap">
          <button onClick={() => { choiceState.resolve(null); setChoiceState(null); }} className="text-xs text-slate-500 border border-slate-200 px-4 py-1.5 rounded-lg hover:bg-slate-50">取消</button>
          {choiceState.options.map(o => (
            <button key={o.value} onClick={() => { choiceState.resolve(o.value); setChoiceState(null); }} className="text-xs bg-violet-600 text-white px-4 py-1.5 rounded-lg hover:bg-violet-700">{o.label}</button>
          ))}
        </div>
      </div>
    </div>
  ) : null;
  return { confirm, choose, Dialog };
}

export default function AiNovelWorkspace({ novel: initialNovel, onBack }: Props) {
  const stateKey = `aiNovelState_${initialNovel.id}`;
  const savedState = JSON.parse(localStorage.getItem(stateKey) || '{}');

  const [novel, setNovel] = useState(initialNovel);
  const [volumes, setVolumes] = useState<AiNovelVolume[]>([]);
  const [view, setView] = useState<View>('volumes');
  const [selectedVol, setSelectedVol] = useState<AiNovelVolume | null>(null);
  const [chapters, setChapters] = useState<AiNovelChapter[]>([]);
  const [selectedChap, setSelectedChap] = useState<AiNovelChapter | null>(null);
  const [generating, setGenerating] = useState(false);
  const [paused, setPaused] = useState(false);
  const [chatPanel, setChatPanel] = useState<ChatPanel>(null);
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { confirm, choose, Dialog } = useConfirm();

  // Editable chapter fields in center panel
  const [editTitle, setEditTitle] = useState('');
  const [editOutline, setEditOutline] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editingMemory, setEditingMemory] = useState<Record<string, string> | null>(null);
  const [editingNovel, setEditingNovel] = useState<{ title: string; genre: string; premise: string; protagonist: string; realm_system: string; official_system: string } | null>(null);
  const [showCopy, setShowCopy] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [tipPos, setTipPos] = useState<{x: number; y: number} | null>(null);
  const [chatWidth, setChatWidth] = useState(320);
  const chatDragRef = useRef(false);
  const [collapsedMsgs, setCollapsedMsgs] = useState<Set<number>>(new Set());

  // Sync edit fields when selectedChap changes
  const formatContent = (raw: string) => raw.split('\n')
    .map(l => l.trim())
    .filter(l => l !== '')
    .map(l => '\u3000\u3000' + l)
    .join('\n');

  useEffect(() => {
    if (selectedChap) {
      setEditTitle(selectedChap.title);
      setEditOutline(selectedChap.outline);
      setEditContent(selectedChap.content ? formatContent(selectedChap.content) : '');
      setEditStatus((selectedChap as any).protagonist_status || '');
    }
  }, [selectedChap?.id]);

  // Sync content when generation completes
  useEffect(() => {
    if (selectedChap?.status === 'done' && selectedChap.content) {
      setEditContent(formatContent(selectedChap.content));
    }
  }, [selectedChap?.status, selectedChap?.content]);

  const refreshNovel = useCallback(() =>
    aiNovelsApi.get(novel.id).then(setNovel), [novel.id]);

  const refreshVolumes = useCallback(() =>
    aiNovelsApi.listVolumes(novel.id).then(setVolumes), [novel.id]);

  // Save state to localStorage when view/vol/chap changes
  useEffect(() => {
    localStorage.setItem(stateKey, JSON.stringify({
      view,
      volId: selectedVol?.id,
      chapId: selectedChap?.id,
    }));
  }, [view, selectedVol?.id, selectedChap?.id]);

  // Restore vol/chap on mount
  useEffect(() => {
    if (!savedState.volId || volumes.length === 0) return;
    const vol = volumes.find(v => v.id === savedState.volId);
    if (!vol || view === 'chapters') return;
    if (savedState.view === 'chapters') {
      (async () => {
        await openVolume(vol);
        if (savedState.chapId) {
          const chaps = await aiNovelsApi.listChapters(novel.id, vol.id);
          const chap = chaps.find(c => c.id === savedState.chapId);
          if (chap) viewChapter(chap);
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumes]);

  useEffect(() => {
    refreshVolumes();
    const interval = setInterval(() => {
      if (novel.status === 'outline') refreshNovel();
      else clearInterval(interval);
    }, 3000);
    return () => clearInterval(interval);
  }, [novel.status, refreshNovel, refreshVolumes]);

  useEffect(() => {
    if (novel.status === 'volumes_ready' && volumes.length === 0) refreshVolumes();
  }, [novel.status, volumes.length, refreshVolumes]);

  const pollChapters = (vid: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      const chaps = await aiNovelsApi.listChapters(novel.id, vid);
      setChapters(chaps);
      // Sync selectedChap content if it's generating
      setSelectedChap(prev => {
        if (!prev) return prev;
        const updated = chaps.find(c => c.id === prev.id);
        if (!updated) return prev;
        if (updated.status === 'done' && prev.status !== 'done') {
          setEditContent(updated.content || '');
        }
        return { ...prev, ...updated };
      });
      const vols = await aiNovelsApi.listVolumes(novel.id);
      setVolumes(vols);
      const vol = vols.find(v => v.id === vid);
      if (vol) setSelectedVol(vol);
      if (vol?.status === 'done' || vol?.status === 'error' || vol?.is_paused) {
        clearInterval(pollIntervalRef.current!);
        pollIntervalRef.current = null;
        setGenerating(false);
        if (vol?.is_paused) setPaused(true);
      }
    }, 3000);
  };

  const openVolume = async (vol: AiNovelVolume) => {
    setChatPanel(null);
    const vols = await aiNovelsApi.listVolumes(novel.id);
    const freshVol = vols.find(v => v.id === vol.id) || vol;
    setSelectedVol(freshVol);
    setVolumes(vols);
    setView('chapters');
    const chaps = await aiNovelsApi.listChapters(novel.id, freshVol.id);
    setChapters(chaps);
    if (freshVol.is_paused) { setPaused(true); setGenerating(false); }
    else if (freshVol.status === 'generating' || chaps.some(c => c.status === 'generating')) {
      setPaused(false); setGenerating(true); pollChapters(freshVol.id);
    } else { setPaused(false); setGenerating(false); }
  };

  const retryVolume = async (vol: AiNovelVolume) => {
    await aiNovelsApi.retryVolume(novel.id, vol.id);
    setVolumes(prev => prev.map(v => v.id === vol.id ? { ...v, status: 'generating', error_msg: '' } : v));
    const poll = setInterval(async () => {
      const vols = await aiNovelsApi.listVolumes(novel.id);
      setVolumes(vols);
      const updated = vols.find(v => v.id === vol.id);
      if (updated && updated.status !== 'generating') clearInterval(poll);
    }, 3000);
  };

  const approveVolume = async (vol: AiNovelVolume) => {
    await aiNovelsApi.approveVolume(novel.id, vol.id);
    setVolumes(prev => prev.map(v => v.id === vol.id ? { ...v, status: 'generating' } : v));
    const poll = setInterval(async () => {
      const vols = await aiNovelsApi.listVolumes(novel.id);
      setVolumes(vols);
      const updated = vols.find(v => v.id === vol.id);
      if (updated && updated.status !== 'generating') clearInterval(poll);
    }, 3000);
  };

  const saveVolume = async (vol: AiNovelVolume, title: string, outline: string) => {
    await aiNovelsApi.updateVolume(novel.id, vol.id, { title, outline });
    setVolumes(prev => prev.map(v => v.id === vol.id ? { ...v, title, outline } : v));
  };

  const startGenerateVolume = async (vol: AiNovelVolume) => {
    setGenerating(true);
    await aiNovelsApi.generateVolume(novel.id, vol.id);
    pollChapters(vol.id);
  };

  const openOutlineChat = () => {
    setChatPanel('world');
  };

  const saveMemory = async () => {
    if (!editingMemory) return;
    await aiNovelsApi.updateMemory(novel.id, editingMemory);
    setNovel(prev => ({ ...prev, memory: { ...prev.memory, ...editingMemory } }));
    setEditingMemory(null);
  };

  const saveNovel = async () => {
    if (!editingNovel) return;
    const ok = await confirm('修改小说基本信息可能影响已生成的大纲和章节内容，确认保存？');
    if (!ok) return;
    const updated = await aiNovelsApi.update(novel.id, editingNovel);
    setNovel(prev => ({ ...prev, ...updated }));
    setEditingNovel(null);
  };

  const addChapter = async () => {
    if (!selectedVol) return;
    const chap = await aiNovelsApi.addChapter(novel.id, selectedVol.id, {});
    setChapters(prev => [...prev, chap]);
  };

  const deleteChapter = async (cid: string) => {
    if (!selectedVol) return;
    await aiNovelsApi.removeChapter(novel.id, selectedVol.id, cid);
    setChapters(prev => prev.filter(c => c.id !== cid));
    if (selectedChap?.id === cid) setSelectedChap(null);
  };

  const triggerGenerate = (c: AiNovelChapter) => {
    setChapters(prev => prev.map(x => x.id === c.id ? { ...x, status: 'generating' } : x));
    aiNovelsApi.generateChapter(novel.id, c.volume_id, c.id);
    pollChapters(c.volume_id);
  };

  const saveChapterEdits = async () => {
    if (!selectedChap || !selectedVol) return;
    const ok = await confirm('确认保存修改？\n\n修改标题或细纲后，如果已生成正文，正文内容可能与新细纲不一致，建议重新生成。');
    if (!ok) return;
    const updated = await aiNovelsApi.updateChapter(novel.id, selectedVol.id, selectedChap.id, {
      title: editTitle,
      outline: editOutline,
      ...(selectedChap.status === 'done' ? { content: editContent, protagonist_status: editStatus } : {}),
    });
    setChapters(prev => prev.map(c => c.id === updated.id ? { ...c, title: updated.title, outline: updated.outline, word_count: updated.word_count } : c));
    setSelectedChap(prev => prev ? { ...prev, title: updated.title, outline: updated.outline, content: updated.content || prev.content, protagonist_status: updated.protagonist_status ?? (prev as any).protagonist_status } as any : prev);
  };

  const viewChapter = async (chap: AiNovelChapter) => {
    if (chap.status === 'done') {
      const full = await aiNovelsApi.getChapter(novel.id, chap.volume_id, chap.id);
      setSelectedChap(full);
    } else {
      setSelectedChap(chap);
    }
    if (chatPanel === 'chapter') {
      const h = await aiNovelsApi.getChapterChatHistory(novel.id, chap.volume_id, chap.id).catch(() => []);
      setChatHistory((h as any[]).map(m => ({
        role: m.role,
        content: m.content,
        proposal: (m.outlineProposal || m.revisedProposal) ? { outlineProposal: m.outlineProposal, revisedProposal: m.revisedProposal } : undefined,
      })));
    }
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    const newHistory: ChatMsg[] = [...chatHistory, { role: 'user', content: msg }];
    setChatHistory(newHistory);
    setChatLoading(true);
    try {
      if (chatPanel === 'chapter' && selectedChap) {
        const token = localStorage.getItem('token');
        const baseURL = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api';
        const response = await fetch(`${baseURL}/ainovels/${novel.id}/volumes/${selectedChap.volume_id}/chapters/${selectedChap.id}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: msg, history: chatHistory.map(m => ({ role: m.role, content: m.content })) }),
        });
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        setChatHistory([...newHistory, { role: 'assistant', content: '' }]);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.display !== undefined) {
                setChatHistory([...newHistory, { role: 'assistant', content: data.display }]);
              } else if (data.done) {
                const proposal = (data.outlineProposal || data.revisedProposal)
                  ? { outlineProposal: data.outlineProposal, revisedProposal: data.revisedProposal }
                  : null;
                let displayText = data.displayReply;
                if (data.revisedProposal) {
                  displayText = (displayText ? displayText + '\n\n' : '') + data.revisedProposal;
                }
                if (data.outlineProposal) {
                  const outlineText = data.outlineProposal.outline ? `新细纲：\n${data.outlineProposal.outline}` : '';
                  displayText = (displayText ? displayText + '\n\n' : '') + (outlineText ? outlineText + '\n\n' : '') + `[点击下方按钮应用此细纲]`;
                }
                setChatHistory([...newHistory, { role: 'assistant', content: displayText, proposal }]);
              }
            } catch(_) {}
          }
        }
        return;
      } else {
        // Streaming outline chat
        const token = localStorage.getItem('token');
        const baseURL = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api';
        const response = await fetch(`${baseURL}/ainovels/${novel.id}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: msg, mode: 'world' }),
        });
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buf2 = '';
        setChatHistory([...newHistory, { role: 'assistant', content: '' }]);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf2 += decoder.decode(value, { stream: true });
          const lines = buf2.split('\n');
          buf2 = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.display !== undefined) {
                setChatHistory([...newHistory, { role: 'assistant', content: data.display }]);
              } else if (data.done) {
                setChatHistory([...newHistory, { role: 'assistant', content: data.displayReply, proposal: data.proposal || null }]);
                refreshNovel(); refreshVolumes();
              }
            } catch(_) {}
          }
        }
        return;
      }
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => { if (chatEndRef.current) chatEndRef.current.scrollIntoView(); }, [chatHistory, chatPanel]);

  const pauseGeneration = async () => {
    if (!selectedVol) return;
    await aiNovelsApi.pauseVolume(novel.id, selectedVol.id);
    setPaused(true);
  };

  const resumeGeneration = async () => {
    if (!selectedVol) return;
    setPaused(false); setGenerating(true);
    await aiNovelsApi.resumeVolume(novel.id, selectedVol.id);
    pollChapters(selectedVol.id);
  };

  const statusColor: Record<string, string> = {
    pending: 'text-slate-400', generating: 'text-amber-500', done: 'text-emerald-500', error: 'text-red-400',
  };
  const statusLabel: Record<string, string> = {
    pending: '待生成', generating: '生成中...', done: '已完成', error: '出错', approved: '已审核', volumes_ready: '待审核',
  };

  const doneCount = chapters.filter(c => c.status === 'done').length;
  const totalWords = chapters.reduce((s, c) => s + (c.word_count || 0), 0);
  const hasEdits = selectedChap && (
    editTitle !== selectedChap.title ||
    editOutline !== selectedChap.outline ||
    (selectedChap.status === 'done' && editContent !== (selectedChap.content || '')) ||
    (selectedChap.status === 'done' && editStatus !== (selectedChap.protagonist_status || ''))
  );

  const [editingVol, setEditingVol] = useState<{ id: string; title: string; outline: string } | null>(null);

  const handleVolumeSave = async () => {
    if (!editingVol) return;
    const vol = volumes.find(v => v.id === editingVol.id);
    if (!vol) return;
    const isApproved = vol.status === 'approved' || vol.status === 'done' || vol.status === 'generating';
    const msg = isApproved
      ? `确认修改第${vol.volume_num}卷大纲？\n\n注意：本卷章节细纲已根据旧版大纲生成，修改卷大纲后，已生成的章节细纲与新大纲可能不一致。如需保持一致，建议重新生成本卷章节细纲。`
      : '确认保存修改？';
    const ok = await confirm(msg);
    if (!ok) return;
    await saveVolume(vol, editingVol.title, editingVol.outline);
    setEditingVol(null);
  };

  const ChatPanelUI = (
    <div className="border-l border-slate-200 bg-white flex flex-col shrink-0 overflow-hidden relative" style={{ width: chatWidth }}>
      {/* Drag handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 cursor-col-resize hover:bg-slate-400 z-10"
        onMouseDown={e => {
          e.preventDefault();
          chatDragRef.current = true;
          const startX = e.clientX;
          const startW = chatWidth;
          const onMove = (ev: MouseEvent) => {
            if (!chatDragRef.current) return;
            const newW = Math.max(240, Math.min(900, startW - (ev.clientX - startX)));
            setChatWidth(newW);
          };
          const onUp = () => { chatDragRef.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      />
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-700">
          {chatPanel === 'chapter' && selectedChap ? `与AI讨论：第${selectedChap.chapter_num}章`
            : '与AI讨论大纲'}
        </span>
        <div className="flex items-center gap-2">
          {chatPanel === 'chapter' && selectedChap && chatHistory.length > 0 && (
            <button onClick={async () => {
              const ok = await confirm('确认清空本章聊天记录？');
              if (!ok) return;
              await aiNovelsApi.clearChapterChatHistory(novel.id, selectedChap.volume_id, selectedChap.id);
              setChatHistory([]);
            }} className="text-xs text-slate-400 hover:text-red-500">清空</button>
          )}
          <button onClick={() => setChatPanel(null)} className="text-slate-400 hover:text-slate-600 text-sm">×</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {chatHistory.length === 0 && (
          <div className="text-xs text-slate-400 text-center mt-4">
            {chatPanel === 'chapter' ? <>可以讨论细纲或正文，AI会自动识别并更新<br/><span className="text-slate-300">（最多保留最近10条记录）</span></> : '可以讨论世界观和各卷大纲，AI会自动更新设定'}
          </div>
        )}
        {chatHistory.map((m, i) => {
          const isLong = m.role === 'assistant' && m.content.length > 300;
          const isCollapsed = collapsedMsgs.has(i);
          const toggleCollapse = () => setCollapsedMsgs(prev => {
            const next = new Set(prev);
            next.has(i) ? next.delete(i) : next.add(i);
            return next;
          });
          return (
          <div key={i} className={`flex flex-col gap-1 max-w-[90%] group ${m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
            <div className="relative">
              <div className={`text-xs leading-relaxed px-3 py-2 rounded-xl whitespace-pre-wrap ${m.role === 'user' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-700'} ${isLong && isCollapsed ? 'line-clamp-4' : ''}`}>
                {m.content}
              </div>
              {isLong && (
                <button onClick={toggleCollapse} className="text-[10px] text-slate-400 hover:text-slate-600 mt-0.5 block">
                  {isCollapsed ? '展开' : '收起'}
                </button>
              )}
              <button
                onClick={async () => {
                  const skipConfirm = localStorage.getItem(`chatDeleteNoConfirm_${novel.id}`) === '1';
                  if (!skipConfirm) {
                    const choice = await choose('确认删除这条消息？', [
                      { label: '确认删除', value: 'yes' },
                      { label: '确认且不再询问', value: 'always' },
                    ]);
                    if (!choice) return;
                    if (choice === 'always') localStorage.setItem(`chatDeleteNoConfirm_${novel.id}`, '1');
                  }
                  const newHistory = chatHistory.filter((_, j) => j !== i);
                  setChatHistory(newHistory);
                  const plainHistory = newHistory.map(x => ({ role: x.role, content: x.content }));
                  if (chatPanel === 'chapter' && selectedChap) {
                    aiNovelsApi.updateChapterChatHistory(novel.id, selectedChap.volume_id, selectedChap.id, plainHistory);
                  } else {
                    aiNovelsApi.updateChatHistory(novel.id, plainHistory);
                  }
                }}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-slate-400 hover:bg-red-500 text-white rounded-full text-[10px] leading-none items-center justify-center hidden group-hover:flex">×</button>
            </div>
            {m.proposal && (
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (chatPanel === 'chapter' && selectedChap) {
                      await aiNovelsApi.applyChapterProposal(novel.id, selectedChap.volume_id, selectedChap.id, m.proposal);
                      const updated = await aiNovelsApi.getChapter(novel.id, selectedChap.volume_id, selectedChap.id);
                      setSelectedChap(updated);
                      setEditContent(updated.content || '');
                      setEditTitle(updated.title);
                      setEditOutline(updated.outline);
                      setChapters(prev => prev.map(c => c.id === updated.id ? { ...c, title: updated.title, outline: updated.outline, word_count: updated.word_count } : c));
                    } else {
                      await aiNovelsApi.applyProposal(novel.id, m.proposal);
                      refreshNovel(); refreshVolumes();
                    }
                  }}
                  className="text-xs bg-emerald-500 text-white px-3 py-1 rounded-lg hover:bg-emerald-600">
                  应用此修改
                </button>
              </div>
            )}
          </div>
        );
        })}
        {chatLoading && <div className="bg-slate-100 text-slate-400 text-xs px-3 py-2 rounded-xl self-start"><span className="animate-pulse">思考中...</span></div>}
        <div ref={chatEndRef} />
      </div>
      <div className="p-3 border-t border-slate-100 flex gap-2">
        <textarea className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
          rows={2} placeholder="输入消息..." value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }} />
        <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
          className="text-xs bg-violet-600 text-white px-3 rounded-lg hover:bg-violet-700 disabled:opacity-40">发送</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {Dialog}
      {tipPos && (
        <div className="fixed z-[100] pointer-events-none" style={{ left: Math.min(tipPos.x - 120, window.innerWidth - 250), top: tipPos.y - 8, transform: 'translateY(-100%)' }}>
          <div className="w-60 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 leading-relaxed shadow-xl">
            根据当前正文内容重新生成本章细纲，供后续章节生成时作为上下文参考。如果你修改了正文，建议点击更新，保持后续生成的连贯性。
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <button onClick={view === 'chapters' ? () => { setView('volumes'); setSelectedChap(null); setChatPanel(null); } : onBack}
          className="text-slate-400 hover:text-slate-700 text-sm">←</button>
        <span className="font-semibold text-slate-800 text-sm">{novel.title}</span>
        <span className="text-xs bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full">{novel.genre}</span>
        {view === 'volumes' && !editingNovel && (
          <button onClick={() => setEditingNovel({ title: novel.title, genre: novel.genre, premise: novel.premise, protagonist: novel.protagonist, realm_system: (novel as any).realm_system || '', official_system: (novel as any).official_system || '' })}
            className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 px-2 py-0.5 rounded-lg">编辑信息</button>
        )}
        {view === 'volumes' && (
          <button onClick={async () => {
            setChatInput('');
            setChatPanel('world');
            const h = await aiNovelsApi.getChatHistory(novel.id).catch(() => []);
            setChatHistory((h as ChatMsg[]).map(m => ({ ...m, content: m.content.replace(/<<<(OUTLINE|REVISED|PROPOSAL)>>>[\s\S]*?<<<END>>>/g, '').replace(/<<<(OUTLINE|REVISED|PROPOSAL|END)>>>/g, '').trim() })));
          }}
            className="text-xs text-violet-600 hover:text-violet-800 border border-violet-200 px-2 py-0.5 rounded-lg ml-auto">与AI讨论大纲</button>
        )}
        {view === 'chapters' && selectedVol && (
          <span className="text-xs text-slate-500">第{selectedVol.volume_num}卷《{selectedVol.title}》</span>
        )}
        {view === 'chapters' && chapters.length > 0 && (
          <span className="text-xs text-slate-400 ml-auto">{doneCount}/{chapters.length}章 · {(totalWords/10000).toFixed(1)}万字</span>
        )}
      </div>

      {/* Edit novel info form */}
      {editingNovel && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-4 shrink-0">
          <div className="text-xs text-amber-700 mb-3 font-medium">不建议修改小说基本信息，这可能导致已生成内容与设定不一致。</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">书名</label>
              <input className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                value={editingNovel.title} onChange={e => setEditingNovel(n => n ? { ...n, title: e.target.value } : n)} />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">小说类型</label>
              <input className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                value={editingNovel.genre} onChange={e => setEditingNovel(n => n ? { ...n, genre: e.target.value } : n)} />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">主角名字</label>
              <input className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                value={editingNovel.protagonist} onChange={e => setEditingNovel(n => n ? { ...n, protagonist: e.target.value } : n)} />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">核心设定</label>
              <textarea className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y min-h-[80px]"
                value={editingNovel.premise} onChange={e => setEditingNovel(n => n ? { ...n, premise: e.target.value } : n)} />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">境界体系 <span className="text-slate-400">（按需注入）</span></label>
              <textarea className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y min-h-[60px]"
                placeholder="如：炼气→筑基→金丹→元婴→化神..."
                value={editingNovel.realm_system} onChange={e => setEditingNovel(n => n ? { ...n, realm_system: e.target.value } : n)} />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">官职体系 <span className="text-slate-400">（按需注入）</span></label>
              <textarea className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y min-h-[60px]"
                placeholder="如：县令→知府→巡抚→总督..."
                value={editingNovel.official_system} onChange={e => setEditingNovel(n => n ? { ...n, official_system: e.target.value } : n)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditingNovel(null)} className="text-xs text-slate-400 px-3 py-1.5 border border-slate-200 rounded-lg hover:text-slate-600">取消</button>
            <button onClick={saveNovel} className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700">保存修改</button>
          </div>
        </div>
      )}

      {/* Volumes view */}
      {view === 'volumes' && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">
            {novel.status === 'outline' && (
              <div className="flex items-center gap-2 text-sm text-slate-400 justify-center mt-20">
                <span className="w-4 h-4 border-2 border-slate-300 border-t-violet-500 rounded-full animate-spin" />
                正在生成世界观和卷大纲...
              </div>
            )}
            {novel.memory?.world && (
              <div className="max-w-2xl mx-auto mb-4 bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-slate-500">世界观设定</div>
                  <div className="flex gap-2">
                    {editingMemory ? (
                      <>
                        <button onClick={() => setEditingMemory(null)} className="text-xs text-slate-400 px-2 py-0.5">取消</button>
                        <button onClick={saveMemory} className="text-xs bg-violet-600 text-white px-2 py-0.5 rounded-lg">保存</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditingMemory({ world: novel.memory.world, power_system: novel.memory.power_system || '' })}
                          className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-2 py-0.5 rounded-lg">编辑</button>
                      </>
                    )}
                  </div>
                </div>
                {editingMemory ? (
                  <div className="flex flex-col gap-2">
                    <textarea className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 w-full" rows={4}
                      value={editingMemory.world} onChange={e => setEditingMemory(m => m ? { ...m, world: e.target.value } : m)} />
                    <textarea className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 w-full" rows={2}
                      placeholder="力量体系..." value={editingMemory.power_system} onChange={e => setEditingMemory(m => m ? { ...m, power_system: e.target.value } : m)} />
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-slate-600 leading-relaxed">{novel.memory.world}</div>
                    {novel.memory.power_system && <div className="mt-2 text-xs text-slate-500"><span className="font-medium">力量体系：</span>{novel.memory.power_system}</div>}
                  </>
                )}
              </div>
            )}
            <div className="max-w-2xl mx-auto flex flex-col gap-3">
              {volumes.map(vol => (
                <div key={vol.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                  {editingVol?.id === vol.id ? (
                    <div className="flex flex-col gap-2">
                      <input className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        value={editingVol.title} onChange={e => setEditingVol(v => v ? { ...v, title: e.target.value } : v)} />
                      <textarea className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                        rows={4} value={editingVol.outline} onChange={e => setEditingVol(v => v ? { ...v, outline: e.target.value } : v)} />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingVol(null)} className="text-xs text-slate-400 px-3 py-1">取消</button>
                        <button onClick={handleVolumeSave} className="text-xs bg-violet-600 text-white px-3 py-1 rounded-lg">保存</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-slate-800">第{vol.volume_num}卷《{vol.title}》</span>
                        <span className={`text-xs ${statusColor[vol.status] || 'text-slate-400'}`}>{statusLabel[vol.status] || vol.status}</span>
                      </div>
                      {vol.status === 'error' && vol.error_msg && (
                        <div className="text-xs text-red-500 mb-2 bg-red-50 px-2 py-1 rounded-lg">{vol.error_msg}</div>
                      )}
                      <div className="text-xs text-slate-500 leading-relaxed mb-3">{vol.outline}</div>
                      <div className="flex gap-2 flex-wrap">
                        {vol.status === 'error' && (
                          <button onClick={() => retryVolume(vol)} className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600">重试</button>
                        )}
                        {vol.status === 'pending' && (
                          <>
                            <button onClick={() => setEditingVol({ id: vol.id, title: vol.title, outline: vol.outline })}
                              className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1 rounded-lg">编辑</button>
                            <button onClick={() => approveVolume(vol)}
                              className="text-xs bg-violet-600 text-white px-3 py-1 rounded-lg hover:bg-violet-700">审核通过 →</button>
                          </>
                        )}
                        {(vol.status === 'approved' || vol.status === 'generating' || vol.status === 'done') && (
                          <>
                            <button onClick={() => setEditingVol({ id: vol.id, title: vol.title, outline: vol.outline })}
                              className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1 rounded-lg">编辑大纲</button>
                            <button onClick={() => openVolume(vol)}
                              className="text-xs text-violet-600 hover:text-violet-800 border border-violet-200 px-3 py-1 rounded-lg">查看章节 →</button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-slate-100 flex justify-center">
              <button
                onClick={async () => {
                  const choice = await choose('如何添加新卷？', [
                    { label: 'AI续写大纲', value: 'ai' },
                    { label: '手动填写', value: 'manual' },
                  ]);
                  if (!choice) return;
                  const vol = await aiNovelsApi.addVolume(novel.id);
                  setVolumes(prev => [...prev, vol]);
                  if (choice === 'ai') {
                    const poll = setInterval(async () => {
                      const vols = await aiNovelsApi.listVolumes(novel.id);
                      setVolumes(vols);
                      const updated = vols.find(v => v.id === vol.id);
                      if (updated?.outline) clearInterval(poll);
                    }, 3000);
                  } else {
                    setEditingVol({ id: vol.id, title: vol.title, outline: vol.outline });
                  }
                }}
                className="text-xs text-slate-400 hover:text-violet-600 px-4 py-1.5 border border-dashed border-slate-200 rounded-lg hover:border-violet-300">
                + 添加卷
              </button>
            </div>
          </div>
          {chatPanel && ChatPanelUI}
        </div>
      )}

      {/* Chapters view */}
      {view === 'chapters' && selectedVol && (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0">
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
              {selectedVol.status === 'approved' && !generating && !paused && (
                <button onClick={() => startGenerateVolume(selectedVol)}
                  className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 w-full">批量生成正文</button>
              )}
              {(selectedVol.status === 'generating' || generating) && !paused && (
                <div className="flex items-center gap-2 w-full">
                  <div className="flex items-center gap-2 text-xs text-amber-500 flex-1">
                    <span className="w-3 h-3 border-2 border-amber-300 border-t-amber-500 rounded-full animate-spin" />
                    生成中 {doneCount}/{chapters.length}
                  </div>
                  <button onClick={pauseGeneration} className="text-xs text-slate-500 border border-slate-200 px-2 py-1 rounded-lg">暂停</button>
                </div>
              )}
              {paused && (
                <div className="flex items-center gap-2 w-full">
                  <span className="text-xs text-slate-400 flex-1">已暂停 {doneCount}/{chapters.length}</span>
                  <button onClick={resumeGeneration} className="text-xs bg-violet-600 text-white px-2 py-1 rounded-lg">继续</button>
                </div>
              )}
              {selectedVol.status === 'done' && !generating && !paused && (
                <span className="text-xs text-emerald-500 w-full text-center py-1">本卷已完成</span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {chapters.some(c => c.error_msg?.includes('余额')) && (
                <div className="mx-2 mt-2 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                  {chapters.find(c => c.error_msg?.includes('余额'))?.error_msg}
                </div>
              )}
              {chapters.map(c => (
                <div key={c.id} onClick={() => viewChapter(c)}
                  className={`px-3 py-2.5 border-b border-slate-50 cursor-pointer ${selectedChap?.id === c.id ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs text-slate-700 truncate flex-1 font-medium">第{c.chapter_num}章 {c.title}</span>
                    <span className="shrink-0">
                      {c.status === 'generating'
                        ? <span className="w-3 h-3 border-2 border-amber-300 border-t-amber-500 rounded-full animate-spin inline-block" />
                        : <span className={`text-xs ${statusColor[c.status]}`}>{c.status === 'done' ? '✓' : c.status === 'error' ? '!' : '○'}</span>}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{c.outline}</div>
                  {/* Action buttons */}
                  <div className="flex gap-2 mt-1" onClick={e => e.stopPropagation()}>
                    {(c.status === 'pending' || c.status === 'error') && (
                      <button onClick={() => triggerGenerate(c)}
                        className="text-xs text-emerald-500 hover:text-emerald-700">
                        {c.status === 'error' ? '重试' : '生成'}
                      </button>
                    )}
                    {c.status === 'done' && (
                      <button onClick={async () => {
                        if (await confirm('重新生成将覆盖当前正文内容，确定继续？')) triggerGenerate(c);
                      }} className="text-xs text-violet-400 hover:text-violet-600">重新生成</button>
                    )}
                    <button onClick={() => deleteChapter(c.id)} className="text-xs text-red-400 hover:text-red-600">删除</button>
                  </div>
                </div>
              ))}
              <div className="p-2 flex justify-center">
                <button onClick={async () => {
                  if (!selectedVol) return;
                  // Step 1: position
                  const posOptions = [
                    { label: '插入末尾', value: 'end' },
                    ...chapters.map(c => ({ label: `第${c.chapter_num}章后`, value: String(c.chapter_num) })),
                  ];
                  const pos = await choose('插入到哪个位置？', posOptions.slice(0, 4));
                  if (!pos) return;
                  const insert_after = pos === 'end' ? undefined : parseInt(pos);

                  // Step 2: method
                  const choice = await choose('如何添加新章节？', [
                    { label: 'AI续写细纲', value: 'ai' },
                    { label: '手动填写', value: 'manual' },
                  ]);
                  if (!choice) return;

                  const chap = await aiNovelsApi.addChapter(novel.id, selectedVol.id, { ai: choice === 'ai', insert_after });
                  const chaps = await aiNovelsApi.listChapters(novel.id, selectedVol.id);
                  setChapters(chaps);
                  if (choice === 'ai') {
                    const poll = setInterval(async () => {
                      const updated = await aiNovelsApi.listChapters(novel.id, selectedVol.id);
                      setChapters(updated);
                      if (updated.find(c => c.id === chap.id)?.outline) clearInterval(poll);
                    }, 3000);
                  } else {
                    viewChapter(chap);
                  }
                }}
                  className="text-xs text-slate-400 hover:text-violet-600 px-4 py-1.5 border border-dashed border-slate-200 rounded-lg hover:border-violet-300">
                  + 添加章节
                </button>
              </div>
            </div>
          </div>

          {/* Center panel */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {selectedChap ? (
              <div className="flex-1 flex flex-col p-3 gap-2 overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-3 shrink-0">
                  <input
                    className="text-base font-semibold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-violet-400 focus:outline-none flex-1 py-0.5"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    placeholder="章节标题"
                  />
                  <div className="flex gap-2 shrink-0">
                    <button onClick={async () => {
                      setChatInput('');
                      setChatPanel('chapter');
                      if (selectedChap) {
                        const h = await aiNovelsApi.getChapterChatHistory(novel.id, selectedChap.volume_id, selectedChap.id).catch(() => []);
                        setChatHistory((h as any[]).map(m => ({
                          role: m.role,
                          content: m.content,
                          proposal: (m.outlineProposal || m.revisedProposal) ? { outlineProposal: m.outlineProposal, revisedProposal: m.revisedProposal } : undefined,
                        })));
                      }
                    }} className="text-xs text-violet-600 hover:text-violet-800 border border-violet-200 px-2 py-1 rounded-lg">与AI讨论</button>
                    {hasEdits && (
                      <button onClick={saveChapterEdits}
                        className="text-xs bg-violet-600 text-white px-3 py-1 rounded-lg hover:bg-violet-700">保存</button>
                    )}
                  </div>
                </div>

                {/* Outline section */}
                <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-100 shrink-0">
                  <div className="text-xs text-slate-400 mb-1 font-medium">章节细纲</div>
                  <textarea
                    className="w-full text-xs text-slate-600 leading-relaxed bg-transparent resize-none focus:outline-none"
                    rows={3}
                    value={editOutline}
                    onChange={e => setEditOutline(e.target.value)}
                    placeholder="输入章节细纲..."
                  />
                </div>

                {/* Protagonist status section */}
                {selectedChap.status === 'done' && (
                  <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-100 shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-slate-400 font-medium">主角状态 <span className="text-slate-300">（本章结束时）</span></div>
                      <button onClick={async () => {
                        if (!selectedChap || !selectedVol) return;
                        try {
                          const res = await aiNovelsApi.extractProtagonistStatus(novel.id, selectedVol.id, selectedChap.id);
                          setEditStatus(res.protagonist_status);
                          setSelectedChap(prev => prev ? { ...prev, protagonist_status: res.protagonist_status } as any : prev);
                        } catch(e: any) {
                          alert('提取失败：' + (e?.response?.data?.error || e?.message));
                        }
                      }} className="text-xs text-violet-400 hover:text-violet-600 border border-violet-200 px-2 py-0.5 rounded-lg">重新提取</button>
                    </div>
                    <textarea
                      className="w-full text-xs text-slate-600 leading-relaxed bg-transparent resize-none focus:outline-none min-h-[60px]"
                      rows={3}
                      value={editStatus}
                      onChange={e => setEditStatus(e.target.value)}
                      placeholder="如：境界：炼气三层，顿悟点：120，功法：..."
                    />
                  </div>
                )}

                {/* Content section */}
                {selectedChap.status === 'done' ? (
                  <div className="flex-1 flex flex-col overflow-hidden bg-white border border-slate-100 rounded-xl group/content">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 shrink-0">
                      <span className="text-xs font-medium text-slate-400">正文 · {editContent.replace(/\s/g, '').length} 字</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={async () => {
                            if (!selectedChap || !selectedVol || summaryLoading) return;
                            console.log('regenerate', novel.id, selectedVol.id, selectedChap.id);
                            setSummaryLoading(true);
                            try {
                              const res = await aiNovelsApi.regenerateSummary(novel.id, selectedVol.id, selectedChap.id);
                              if (res?.outline) {
                                setEditOutline(res.outline);
                                setSelectedChap(prev => prev ? { ...prev, outline: res.outline } : prev);
                                setChapters(prev => prev.map(c => c.id === selectedChap.id ? { ...c, outline: res.outline } : c));
                              }
                            } catch(e: any) {
                              alert('更新失败：' + (e?.response?.data?.error || e?.message || '未知错误'));
                            } finally {
                              setSummaryLoading(false);
                            }
                          }}
                          className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          {summaryLoading && <span className="w-2.5 h-2.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />}
                          更新细纲
                        </button>
                        <span
                          onMouseEnter={e => { const r = (e.target as HTMLElement).getBoundingClientRect(); setTipPos({ x: r.left + r.width / 2, y: r.top }); }}
                          onMouseLeave={() => setTipPos(null)}
                          className="cursor-pointer inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-300 hover:bg-violet-500 text-white text-[9px] font-bold transition-colors">?</span>
                      </div>
                    </div>
                    <div className="relative flex-1 overflow-hidden"
                      onMouseMove={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setShowCopy(e.clientY > r.bottom - 80); }}
                      onMouseLeave={() => setShowCopy(false)}>
                      <button
                        onClick={() => navigator.clipboard.writeText(editContent)}
                        className={`absolute bottom-3 right-3 z-10 text-xs text-slate-400 hover:text-violet-600 bg-white/90 border border-slate-200 px-2 py-0.5 rounded-lg transition-opacity shadow-sm ${showCopy ? 'opacity-100' : 'opacity-0'}`}>
                        一键复制
                      </button>
                      <textarea
                        className="w-full h-full text-sm text-slate-700 leading-7 bg-transparent px-4 py-3 resize-none focus:outline-none overflow-y-auto"
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Tab') {
                            e.preventDefault();
                            const el = e.currentTarget;
                            const start = el.selectionStart;
                            const end = el.selectionEnd;
                            const newVal = editContent.slice(0, start) + '\u3000\u3000' + editContent.slice(end);
                            setEditContent(newVal);
                            requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            const el = e.currentTarget;
                            const start = el.selectionStart;
                            const end = el.selectionEnd;
                            const newVal = editContent.slice(0, start) + '\n\u3000\u3000' + editContent.slice(end);
                            setEditContent(newVal);
                            requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 3; });
                          }
                        }}
                        placeholder="正文内容..."
                      />
                    </div>
                  </div>
                ) : selectedChap.status === 'generating' ? (
                  <div className="flex items-center gap-2 justify-center text-xs text-amber-500 py-8">
                    <span className="w-3 h-3 border-2 border-amber-300 border-t-amber-500 rounded-full animate-spin" />
                    正在生成正文...
                  </div>
                ) : selectedChap.status === 'error' ? (
                  <div className="text-xs text-red-500 text-center py-8">{selectedChap.error_msg}</div>
                ) : (
                  <div className="text-xs text-slate-400 text-center py-8">细纲已就绪，点击左侧"生成"开始生成正文</div>
                )}
              </div>
            ) : (
              <div className="text-center text-slate-400 text-sm mt-20">点击左侧章节查看内容</div>
            )}
          </div>

          {chatPanel && ChatPanelUI}
        </div>
      )}
    </div>
  );
}
