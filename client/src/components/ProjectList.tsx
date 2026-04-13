import React, { useState, useEffect } from 'react';
import { projectsApi } from '../api';
import { Project, User } from '../types';

interface Props {
  onSelect: (project: Project) => void;
  user: User;
  onLogout: () => void;
}

export default function ProjectList({ onSelect, user, onLogout }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', genre: '' });

  useEffect(() => { projectsApi.list().then(setProjects); }, []);

  const create = async () => {
    if (!form.title.trim()) return;
    const p = await projectsApi.create(form);
    setProjects(prev => [p, ...prev]);
    setForm({ title: '', description: '', genre: '' });
    setCreating(false);
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('确认删除此项目？')) return;
    await projectsApi.remove(id);
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const genres = ['玄幻', '仙侠', '都市', '历史', '科幻', '悬疑', '言情', '其他'];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✍️</span>
          <span className="text-xl font-bold text-gray-800">墨笔 AI</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user.nickname}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.plan === 'free' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>
            {user.plan === 'free' ? '免费版' : '会员'}
          </span>
          <button onClick={onLogout} className="text-sm text-gray-400 hover:text-gray-600 border px-3 py-1 rounded-lg">退出</button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-700">我的作品</h2>
          <button onClick={() => setCreating(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm">
            + 新建项目
          </button>
        </div>

        {creating && (
          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">新建项目</h2>
            <input className="w-full border rounded-lg p-2 mb-3 text-sm" placeholder="书名 *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <textarea className="w-full border rounded-lg p-2 mb-3 h-20 text-sm resize-none" placeholder="简介（选填）" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <select className="w-full border rounded-lg p-2 mb-4 text-sm" value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))}>
              <option value="">选择类型</option>
              {genres.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={create} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm">创建</button>
              <button onClick={() => setCreating(false)} className="border px-4 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
            </div>
          </div>
        )}

        {projects.length === 0 && !creating ? (
          <div className="text-center text-gray-400 py-24">
            <div className="text-5xl mb-4">📚</div>
            <div>还没有作品，点击"新建项目"开始创作</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map(p => (
              <div key={p.id} onClick={() => onSelect(p)} className="bg-white rounded-xl shadow p-5 cursor-pointer hover:shadow-md transition-shadow border border-transparent hover:border-indigo-100">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-800 truncate">{p.title}</h3>
                    {p.genre && <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">{p.genre}</span>}
                    {p.description && <p className="text-sm text-gray-500 mt-2 line-clamp-2">{p.description}</p>}
                  </div>
                  <button onClick={e => remove(p.id, e)} className="text-gray-200 hover:text-red-400 ml-3 shrink-0">✕</button>
                </div>
                <p className="text-xs text-gray-400 mt-3">更新于 {new Date(p.updated_at).toLocaleDateString('zh-CN')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
