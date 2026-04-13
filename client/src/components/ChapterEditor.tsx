import React, { useState, useEffect, useRef, useCallback } from 'react';
import { chaptersApi } from '../api';
import { Chapter } from '../types';
import AIPanel from './AIPanel';

interface Props {
  projectId: string;
}

export default function ChapterEditor({ projectId }: Props) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [current, setCurrent] = useState<Chapter | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState(true);
  const [selectedText, setSelectedText] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<any>(null);

  useEffect(() => {
    chaptersApi.list(projectId).then(setChapters);
  }, [projectId]);

  const selectChapter = (ch: Chapter) => {
    setCurrent(ch);
    setContent(ch.content);
    setTitle(ch.title);
    setSaved(true);
  };

  const save = useCallback(async () => {
    if (!current) return;
    await chaptersApi.update(projectId, current.id, { title, content });
    setChapters(prev => prev.map(c => c.id === current.id ? { ...c, title, content, word_count: content.replace(/\s/g, '').length } : c));
    setSaved(true);
  }, [current, title, content, projectId]);

  useEffect(() => {
    if (!current) return;
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 2000);
    return () => clearTimeout(saveTimer.current);
  }, [content, title]); // eslint-disable-line

  const createChapter = async () => {
    if (!newTitle.trim()) return;
    const ch = await chaptersApi.create(projectId, { title: newTitle, content: '', order_num: chapters.length });
    setChapters(prev => [...prev, ch]);
    selectChapter(ch);
    setCreating(false);
    setNewTitle('');
  };

  const removeChapter = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('确认删除此章节？')) return;
    await chaptersApi.remove(projectId, id);
    setChapters(prev => prev.filter(c => c.id !== id));
    if (current?.id === id) { setCurrent(null); setContent(''); setTitle(''); }
  };

  const handleSelect = () => {
    const sel = window.getSelection()?.toString().trim();
    if (sel) setSelectedText(sel);
  };

  const insertText = (text: string) => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newContent = content.slice(0, start) + '\n\n' + text + '\n\n' + content.slice(end);
    setContent(newContent);
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + text.length + 4; ta.focus(); }, 0);
  };

  return (
    <div className="flex h-full">
      {/* Chapter list */}
      <div className="w-48 border-r bg-gray-50 flex flex-col">
        <div className="p-2 border-b flex justify-between items-center">
          <span className="text-xs font-medium text-gray-500">章节列表</span>
          <button onClick={() => setCreating(true)} className="text-indigo-600 text-xs hover:text-indigo-800">+新增</button>
        </div>
        {creating && (
          <div className="p-2 border-b">
            <input className="w-full border rounded p-1 text-xs mb-1" placeholder="章节标题" value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && createChapter()} autoFocus />
            <div className="flex gap-1">
              <button onClick={createChapter} className="flex-1 bg-indigo-600 text-white text-xs py-1 rounded">确定</button>
              <button onClick={() => setCreating(false)} className="flex-1 border text-xs py-1 rounded">取消</button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {chapters.map((ch, i) => (
            <div key={ch.id} onClick={() => selectChapter(ch)} className={`p-2 cursor-pointer hover:bg-indigo-50 group relative ${current?.id === ch.id ? 'bg-indigo-100' : ''}`}>
              <div className="text-xs font-medium text-gray-700 truncate pr-5">第{i + 1}章 {ch.title}</div>
              <div className="text-xs text-gray-400">{ch.word_count}字</div>
              <button onClick={e => removeChapter(ch.id, e)} className="absolute right-1 top-1 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs">✕</button>
            </div>
          ))}
          {chapters.length === 0 && <div className="text-xs text-gray-400 text-center py-8">点击"+新增"创建章节</div>}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col">
        {current ? (
          <>
            <div className="p-3 border-b flex items-center gap-3">
              <input className="flex-1 text-lg font-medium border-none outline-none" value={title} onChange={e => setTitle(e.target.value)} />
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{content.replace(/\s/g, '').length} 字</span>
                <span className={saved ? 'text-green-400' : 'text-orange-400'}>{saved ? '已保存' : '未保存'}</span>
                <button onClick={save} className="border px-2 py-1 rounded hover:bg-gray-50">保存</button>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              className="flex-1 p-4 text-gray-700 leading-8 resize-none outline-none text-base"
              placeholder="开始写作..."
              value={content}
              onChange={e => setContent(e.target.value)}
              onMouseUp={handleSelect}
              onKeyUp={handleSelect}
              style={{ fontSize: '16px', fontFamily: 'serif' }}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-3">📖</div>
              <div>选择章节开始编辑</div>
            </div>
          </div>
        )}
      </div>

      {/* AI Panel */}
      <div className="w-72 border-l overflow-y-auto">
        <AIPanel selectedText={selectedText} onInsert={current ? insertText : undefined} />
      </div>
    </div>
  );
}
