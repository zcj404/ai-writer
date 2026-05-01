import React, { useState, useEffect } from 'react';
import { projectsApi, aiNovelsApi } from '../api';
import { Project, User, AiNovel } from '../types';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  onSelect: (project: Project) => void;
  onSelectAiNovel: (novel: AiNovel) => void;
  user: User;
  onLogout: () => void;
}

const GENRES = ['玄幻', '仙侠', '都市', '历史', '科幻', '悬疑', '言情', '其他'];
const AI_GENRES = ['玄幻', '修仙', '武侠', '都市', '末世', '科幻', '历史', '奇幻'];

const statusLabel: Record<string, string> = {
  outline: '生成中...', volumes_ready: '待审核大纲', error: '出错',
};

export default function ProjectList({ onSelect, onSelectAiNovel, user, onLogout }: Props) {
  const [tab, setTab] = useState<'manual' | 'ai'>('manual');

  // 自主创作
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', genre: '' });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // AI 创作
  const [novels, setNovels] = useState<AiNovel[]>([]);
  const [aiCreating, setAiCreating] = useState(false);
  const [aiForm, setAiForm] = useState({ title: '', genre: '玄幻', premise: '', protagonist: '' });
  const [aiLoading, setAiLoading] = useState(false);
  const [confirmDeleteAi, setConfirmDeleteAi] = useState<string | null>(null);

  useEffect(() => { projectsApi.list().then(setProjects); }, []);
  useEffect(() => { aiNovelsApi.list().then(setNovels); }, []);

  const create = async () => {
    if (!form.title.trim()) return;
    const p = await projectsApi.create(form);
    setProjects(prev => [p, ...prev]);
    setForm({ title: '', description: '', genre: '' });
    setCreating(false);
  };

  const doRemove = async (id: string) => {
    setConfirmDelete(null);
    await projectsApi.remove(id);
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const createAi = async () => {
    if (!aiForm.title || !aiForm.premise || !aiForm.protagonist) return;
    setAiLoading(true);
    try {
      const { id } = await aiNovelsApi.create({ ...aiForm, total_volumes: 5, chapters_per_volume: 140, words_per_chapter: 3000 });
      const novel = await aiNovelsApi.get(id);
      setNovels(prev => [novel, ...prev]);
      onSelectAiNovel(novel);
    } finally { setAiLoading(false); }
  };

  const doRemoveAi = async (id: string) => {
    setConfirmDeleteAi(null);
    await aiNovelsApi.remove(id);
    setNovels(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #f3f0ff 50%, #faf8ff 100%)' }}>
      {confirmDelete && (
        <ConfirmDialog message="确认删除此项目？所有章节和数据将一并删除，无法恢复。"
          onConfirm={() => doRemove(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      )}
      {confirmDeleteAi && (
        <ConfirmDialog message="确认删除此AI文？所有数据将一并删除。"
          onConfirm={() => doRemoveAi(confirmDeleteAi)} onCancel={() => setConfirmDeleteAi(null)} />
      )}

      <header className="bg-white/70 backdrop-blur border-b border-slate-200/60 px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-sm">✍</div>
          <span className="text-base font-semibold text-slate-900 tracking-tight">墨笔 AI</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">{user.nickname}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.plan === 'free' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>
            {user.plan === 'free' ? '免费版' : '会员'}
          </span>
          <button onClick={onLogout} className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors">退出</button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-8 py-10">
        {/* Tab 切换 */}
        <div className="flex gap-1 bg-white/60 backdrop-blur rounded-2xl p-1.5 mb-8 w-fit border border-slate-200/60">
          <button onClick={() => setTab('manual')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === 'manual' ? 'bg-white shadow-sm text-indigo-700 border border-indigo-100' : 'text-slate-500 hover:text-slate-700'}`}>
            ✍ 自主创作
            <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{projects.length}</span>
          </button>
          <button onClick={() => setTab('ai')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === 'ai' ? 'bg-white shadow-sm text-violet-700 border border-violet-100' : 'text-slate-500 hover:text-slate-700'}`}>
            🤖 AI 创作
            <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{novels.length}</span>
          </button>
        </div>

        {/* 自主创作 Tab */}
        {tab === 'manual' && (
          <>
            <div className="flex justify-between items-center mb-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">我的作品</h2>
                <p className="text-xs text-slate-400 mt-0.5">你来写，AI 辅助续写与灵感</p>
              </div>
              <button onClick={() => setCreating(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1.5">
                <span>+</span> 新建作品
              </button>
            </div>

            {creating && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">新建作品</h3>
                <div className="space-y-3">
                  <input className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="书名 *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && create()} autoFocus />
                  <textarea className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent h-20 resize-none"
                    placeholder="简介（选填）" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                  <select className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))}>
                    <option value="">选择类型</option>
                    {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={create} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">创建</button>
                  <button onClick={() => setCreating(false)} className="border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm hover:bg-slate-50 transition-colors">取消</button>
                </div>
              </div>
            )}

            {projects.length === 0 && !creating ? (
              <div className="text-center text-slate-400 py-32">
                <div className="text-5xl mb-4">📚</div>
                <div className="text-sm">还没有作品，点击"新建作品"开始创作</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {projects.map(p => (
                  <div key={p.id} onClick={() => onSelect(p)}
                    className="bg-white rounded-2xl border border-slate-200 p-5 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all group">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 truncate">{p.title}</h3>
                        {p.genre && <span className="inline-block text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full mt-1.5 font-medium">{p.genre}</span>}
                        {p.description && <p className="text-sm text-slate-500 mt-2 line-clamp-2 leading-relaxed">{p.description}</p>}
                      </div>
                      <button onClick={e => { e.stopPropagation(); setConfirmDelete(p.id); }}
                        className="text-slate-200 hover:text-red-400 ml-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-sm">✕</button>
                    </div>
                    <p className="text-xs text-slate-400 mt-4">更新于 {new Date(p.updated_at).toLocaleDateString('zh-CN')}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* AI 创作 Tab */}
        {tab === 'ai' && (
          <>
            <div className="flex justify-between items-center mb-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">AI 创作</h2>
                <p className="text-xs text-slate-400 mt-0.5">输入设定，AI 生成世界观、大纲与章节</p>
              </div>
              <button onClick={() => setAiCreating(true)}
                className="bg-violet-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors flex items-center gap-1.5">
                <span>+</span> 新建 AI 文
              </button>
            </div>

            {novels.length === 0 && !aiCreating ? (
              <div className="text-center text-slate-400 py-32">
                <div className="text-5xl mb-4">🤖</div>
                <div className="text-sm">还没有 AI 文，点击"新建 AI 文"开始</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {novels.map(n => (
                  <div key={n.id} onClick={async () => { const full = await aiNovelsApi.get(n.id); onSelectAiNovel(full); }}
                    className="bg-white rounded-2xl border border-slate-200 p-5 cursor-pointer hover:border-violet-300 hover:shadow-sm transition-all group">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 truncate">{n.title}</h3>
                        <span className="inline-block text-xs bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full mt-1.5 font-medium">{n.genre}</span>
                        {statusLabel[n.status] && (
                          <span className="inline-block text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full mt-1.5 ml-1 font-medium">{statusLabel[n.status]}</span>
                        )}
                        <p className="text-sm text-slate-500 mt-2 line-clamp-2 leading-relaxed">{n.premise}</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteAi(n.id); }}
                        className="text-slate-200 hover:text-red-400 ml-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-sm">✕</button>
                    </div>
                    <p className="text-xs text-slate-400 mt-4">{n.total_volumes}卷 · {n.chapters_per_volume}章/卷 · {n.words_per_chapter}字/章</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* AI 新建弹窗 */}
      {aiCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-96 flex flex-col gap-4">
            <div className="font-semibold text-slate-800">新建 AI 文</div>
            <input className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="小说标题" value={aiForm.title} onChange={e => setAiForm(f => ({ ...f, title: e.target.value }))} />
            <select className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              value={aiForm.genre} onChange={e => setAiForm(f => ({ ...f, genre: e.target.value }))}>
              {AI_GENRES.map(g => <option key={g}>{g}</option>)}
            </select>
            <textarea className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              rows={3} placeholder="核心设定（如：废柴少年获得上古传承，逆袭成神）"
              value={aiForm.premise} onChange={e => setAiForm(f => ({ ...f, premise: e.target.value }))} />
            <input className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="主角名字" value={aiForm.protagonist} onChange={e => setAiForm(f => ({ ...f, protagonist: e.target.value }))} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAiCreating(false)} className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5">取消</button>
              <button onClick={createAi} disabled={aiLoading || !aiForm.title || !aiForm.premise || !aiForm.protagonist}
                className="text-xs bg-violet-600 text-white px-4 py-1.5 rounded-xl hover:bg-violet-700 disabled:opacity-40 flex items-center gap-1.5">
                {aiLoading && <span className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
                开始生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
