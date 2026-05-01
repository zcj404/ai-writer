import React, { useState, useEffect } from 'react';
import { AiNovel } from '../types';
import { aiNovelsApi } from '../api';
import ConfirmDialog from './ConfirmDialog';

const GENRES = ['玄幻', '修仙', '武侠', '都市', '末世', '科幻', '历史', '奇幻'];

interface Props { onSelect: (novel: AiNovel) => void; onBack: () => void; }

export default function AiNovelList({ onSelect, onBack }: Props) {
  const [novels, setNovels] = useState<AiNovel[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', genre: '玄幻', premise: '', protagonist: '' });
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => { aiNovelsApi.list().then(setNovels); }, []);

  const create = async () => {
    if (!form.title || !form.premise || !form.protagonist) return;
    setLoading(true);
    try {
      const { id } = await aiNovelsApi.create({ ...form, total_volumes: 5, chapters_per_volume: 140, words_per_chapter: 3000 });
      const novel = await aiNovelsApi.get(id);
      setNovels(prev => [novel, ...prev]);
      onSelect(novel);
    } finally { setLoading(false); }
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(id);
  };

  const doRemove = async () => {
    if (!confirmDelete) return;
    await aiNovelsApi.remove(confirmDelete);
    setNovels(prev => prev.filter(n => n.id !== confirmDelete));
    setConfirmDelete(null);
  };

  const statusLabel: Record<string, string> = {
    outline: '生成中...', volumes_ready: '待审核大纲', error: '出错',
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {confirmDelete && (
        <ConfirmDialog message="确认删除此AI文？所有数据将一并删除。" onConfirm={doRemove} onCancel={() => setConfirmDelete(null)} />
      )}
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-slate-200">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-700 text-sm">← 返回</button>
        <span className="font-semibold text-slate-800">AI创作</span>
        <button onClick={() => setCreating(true)} className="ml-auto text-xs bg-violet-600 text-white px-4 py-1.5 rounded-xl hover:bg-violet-700">+ 新建AI文</button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {novels.length === 0 && !creating && (
          <div className="text-center text-slate-400 text-sm mt-20">还没有AI文，点击"新建AI文"开始</div>
        )}
        <div className="grid grid-cols-1 gap-3 max-w-2xl mx-auto">
          {novels.map(n => (
            <div key={n.id} onClick={async () => { const full = await aiNovelsApi.get(n.id); onSelect(full); }}
              className="bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-violet-300 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-slate-800 text-sm">{n.title}</div>
                  <div className="text-xs text-slate-500 mt-1">{n.genre} · {n.total_volumes}卷 · {n.chapters_per_volume}章/卷 · {n.words_per_chapter}字/章</div>
                  <div className="text-xs text-slate-400 mt-1 line-clamp-1">{n.premise}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {statusLabel[n.status] && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{statusLabel[n.status]}</span>
                  )}
                  <button onClick={e => remove(n.id, e)} className="text-xs text-slate-300 hover:text-red-400">删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {creating && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
            <div className="font-semibold text-slate-800">新建AI文</div>
            <input className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="小说标题" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <select className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))}>
              {GENRES.map(g => <option key={g}>{g}</option>)}
            </select>
            <textarea className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              rows={3} placeholder="核心设定（一句话，如：废柴少年获得上古传承，逆袭成神）"
              value={form.premise} onChange={e => setForm(f => ({ ...f, premise: e.target.value }))} />
            <input className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="主角名字" value={form.protagonist} onChange={e => setForm(f => ({ ...f, protagonist: e.target.value }))} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCreating(false)} className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5">取消</button>
              <button onClick={create} disabled={loading || !form.title || !form.premise || !form.protagonist}
                className="text-xs bg-violet-600 text-white px-4 py-1.5 rounded-xl hover:bg-violet-700 disabled:opacity-40 flex items-center gap-1.5">
                {loading && <span className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
                开始生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
