import React, { useState, useEffect } from 'react';
import { Project, User } from '../types';
import AuthPage from './AuthPage';
import ProjectList from './ProjectList';
import ChapterEditor from './ChapterEditor';
import Characters from './Characters';
import WorldBuilding from './WorldBuilding';
import Outline from './Outline';
import { authApi } from '../api';

type Tab = 'chapters' | 'characters' | 'world' | 'outline';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>('chapters');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      authApi.me().then(setUser).catch(() => localStorage.removeItem('token')).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setProject(null);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">加载中...</div>;
  if (!user) return <AuthPage onLogin={(u, t) => setUser(u)} />;
  if (!project) return <ProjectList onSelect={setProject} user={user} onLogout={logout} />;

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'chapters', label: '章节', icon: '📖' },
    { key: 'characters', label: '人物', icon: '👤' },
    { key: 'world', label: '世界观', icon: '🌍' },
    { key: 'outline', label: '规划', icon: '📋' },
  ];

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="flex items-center px-4 py-2 border-b bg-white shadow-sm">
        <button onClick={() => setProject(null)} className="text-gray-400 hover:text-gray-600 mr-3 text-lg">←</button>
        <div className="flex-1">
          <h1 className="font-bold text-gray-800">{project.title}</h1>
          {project.genre && <span className="text-xs text-indigo-500">{project.genre}</span>}
        </div>
        <nav className="flex gap-1 mr-4">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${tab === t.key ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
              <span>{t.icon}</span><span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>{user.nickname}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${user.plan === 'free' ? 'bg-gray-100' : 'bg-yellow-100 text-yellow-700'}`}>{user.plan === 'free' ? '免费版' : '会员'}</span>
          <button onClick={logout} className="text-xs text-gray-400 hover:text-gray-600">退出</button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        {tab === 'chapters' && <ChapterEditor projectId={project.id} />}
        {tab === 'characters' && <Characters projectId={project.id} />}
        {tab === 'world' && <WorldBuilding projectId={project.id} />}
        {tab === 'outline' && <Outline projectId={project.id} />}
      </main>
    </div>
  );
}
