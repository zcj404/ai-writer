import React, { useState, useEffect } from 'react';
import { Project, User, Chapter, AiNovel } from '../types';
import AuthPage from './AuthPage';
import ProjectList from './ProjectList';
import ChapterEditor from './ChapterEditor';
import Characters from './Characters';
import WorldBuilding from './WorldBuilding';
import Outline from './Outline';
import Inspiration from './Inspiration';
import AiNovelWorkspace from './AiNovelWorkspace';
import { authApi, chaptersApi } from '../api';

type Tab = 'chapters' | 'characters' | 'world' | 'outline' | 'inspiration';

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'chapters', label: '章节', icon: '📖' },
  { key: 'characters', label: '人物', icon: '👤' },
  { key: 'world', label: '世界观', icon: '🌍' },
  { key: 'outline', label: '规划', icon: '📋' },
  { key: 'inspiration', label: '灵感', icon: '💡' },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [aiNovelView, setAiNovelView] = useState<'workspace' | null>(
    () => (localStorage.getItem('aiNovelView') as 'workspace' | null) || null
  );
  const [selectedAiNovel, setSelectedAiNovel] = useState<AiNovel | null>(null);

  const [aiNovelLoading, setAiNovelLoading] = useState(
    () => !!localStorage.getItem('aiNovelId') && localStorage.getItem('aiNovelView') === 'workspace'
  );

  // Restore selectedAiNovel from localStorage on mount
  useEffect(() => {
    const savedId = localStorage.getItem('aiNovelId');
    if (savedId && aiNovelView === 'workspace') {
      setAiNovelLoading(true);
      import('../api').then(({ aiNovelsApi }) =>
        aiNovelsApi.get(savedId).then(setSelectedAiNovel).catch(() => {
          localStorage.removeItem('aiNovelId');
          localStorage.removeItem('aiNovelView');
          setAiNovelView(null);
        }).finally(() => setAiNovelLoading(false))
      );
    }
  }, []);

  const selectProject = (p: Project | null) => {
    setProject(p);
    if (p) localStorage.setItem('projectId', p.id);
    else localStorage.removeItem('projectId');
  };
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('tab') as Tab) || 'chapters');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const switchTab = (t: Tab) => {
    if (t === 'chapters' && tab !== 'chapters') setRefreshKey(k => k + 1);
    setTab(t);
    localStorage.setItem('tab', t);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      authApi.me().then(u => {
        setUser(u);
        const savedId = localStorage.getItem('projectId');
        if (savedId) {
          import('../api').then(({ projectsApi }) =>
            projectsApi.get(savedId).then(selectProject).catch(() => localStorage.removeItem('projectId'))
          );
        }
      }).catch(() => localStorage.removeItem('token')).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // 切换项目时重新拉取章节列表（供所有 Tab 共享）
  useEffect(() => {
    if (!project) { setChapters([]); return; }
    chaptersApi.list(project.id).then(list => {
      setChapters(list.sort((a, b) => a.order_num - b.order_num));
    });
  }, [project?.id]);

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    selectProject(null);
  };

  if (loading || aiNovelLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <div className="w-4 h-4 border-2 border-slate-300 border-t-violet-500 rounded-full animate-spin" />
        加载中…
      </div>
    </div>
  );
  if (!user) return <AuthPage onLogin={(u, t) => setUser(u)} />;
  if (aiNovelView === 'workspace' && selectedAiNovel) return <AiNovelWorkspace novel={selectedAiNovel} onBack={() => { setAiNovelView(null); localStorage.removeItem('aiNovelView'); localStorage.removeItem('aiNovelId'); setSelectedAiNovel(null); }} />;
  if (!project) return <ProjectList onSelect={selectProject} onSelectAiNovel={n => { setSelectedAiNovel(n); setAiNovelView('workspace'); localStorage.setItem('aiNovelView', 'workspace'); localStorage.setItem('aiNovelId', n.id); }} user={user} onLogout={logout} />;

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="flex items-center px-4 h-12 border-b border-slate-200 bg-white shrink-0">
        {/* Back + title */}
        <button onClick={() => selectProject(null)}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 transition-colors mr-4 text-sm">
          <span>←</span>
        </button>
        <div className="flex items-center gap-2 mr-6 min-w-0">
          <span className="font-semibold text-slate-900 truncate text-sm">{project.title}</span>
          {project.genre && (
            <span className="text-xs bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full font-medium shrink-0">{project.genre}</span>
          )}
        </div>

        {/* Tab nav */}
        <nav className="flex items-center gap-0.5 flex-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${tab === t.key ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              <span className="text-xs">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="flex items-center gap-2.5 ml-4 shrink-0">
          <span className="text-xs text-slate-500">{user.nickname}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.plan === 'free' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>
            {user.plan === 'free' ? '免费版' : '会员'}
          </span>
          <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600 transition-colors border border-slate-200 px-2.5 py-1 rounded-lg">退出</button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <div className={tab === 'chapters' ? 'h-full' : 'hidden'}><ChapterEditor key={refreshKey} projectId={project.id} chapters={chapters} setChapters={setChapters} /></div>
        <div className={tab === 'characters' ? 'h-full' : 'hidden'}><Characters projectId={project.id} projectGenre={project.genre} chapters={chapters} /></div>
        <div className={tab === 'world' ? 'h-full' : 'hidden'}><WorldBuilding projectId={project.id} genre={project.genre} /></div>
        <div className={tab === 'outline' ? 'h-full' : 'hidden'}><Outline projectId={project.id} chapters={chapters} /></div>
        <div className={tab === 'inspiration' ? 'h-full' : 'hidden'}><Inspiration projectId={project.id} chapters={chapters} /></div>
      </main>
    </div>
  );
}
