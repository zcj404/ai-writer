import React, { useState } from 'react';
import { authApi } from '../api';
import { User } from '../types';

interface Props {
  onLogin: (user: User, token: string) => void;
}

export default function AuthPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = mode === 'login'
        ? await authApi.login(email, password)
        : await authApi.register(email, password, nickname);
      localStorage.setItem('token', res.token);
      onLogin(res.user, res.token);
    } catch (err: any) {
      setError(err.response?.data?.error || '操作失败，请重试');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 40%, #f3f0ff 70%, #faf8ff 100%)' }}>
      {/* 左侧宣传区 */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12 items-center"
        style={{ background: 'transparent' }}>
        {/* 背景装饰 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-16 left-8 w-72 h-72 rounded-full opacity-30" style={{ background: 'radial-gradient(circle, #c7d2fe, transparent)' }} />
          <div className="absolute bottom-24 right-4 w-56 h-56 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #ddd6fe, transparent)' }} />
          {['修仙', '玄幻', '都市', '穿越', '系统', '逆天', '封神', '武侠'].map((tag, i) => (
            <span key={tag} className="absolute font-bold select-none" style={{
              color: 'rgba(99,102,241,0.08)',
              fontSize: `${14 + (i % 3) * 7}px`,
              top: `${8 + i * 11}%`,
              left: `${4 + (i % 4) * 23}%`,
              transform: `rotate(${-12 + i * 4}deg)`
            }}>{tag}</span>
          ))}
        </div>

        {/* Logo */}
        <div className="relative z-10 w-full max-w-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>✍</div>
            <span className="text-indigo-700 text-xl font-bold tracking-wide">墨笔 AI</span>
          </div>
        </div>

        {/* 核心宣传语 */}
        <div className="relative z-10 flex-1 flex flex-col justify-center py-10 w-full max-w-sm">
          <h2 className="text-4xl font-black leading-tight mb-3" style={{ color: '#312e81' }}>
            一念成文<br />
            <span style={{ color: '#6366f1' }}>万字不难</span>
          </h2>
          <p className="text-slate-500 text-base mb-10 leading-relaxed">
            AI 全程陪伴创作，从灵感到完稿<br />让每一个故事都值得被讲述
          </p>

          <div className="space-y-4">
            {[
              { icon: '✍', title: 'AI 章节写作', desc: '智能续写与润色，突破卡文瓶颈' },
              { icon: '🗺️', title: '世界构建', desc: '管理地图、势力、体系，世界观一目了然' },
              { icon: '👥', title: '角色管理', desc: '记录人物设定与关系，细节不再遗漏' },
              { icon: '📖', title: '大纲与卷册', desc: '分卷分章规划，结构清晰有条理' },
            ].map(item => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>{item.icon}</div>
                <div>
                  <div className="text-indigo-900 font-semibold text-sm">{item.title}</div>
                  <div className="text-slate-400 text-xs mt-0.5">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部 slogan */}
        <div className="relative z-10 w-full max-w-sm">
          <p className="text-slate-400 text-xs">专为网文作家打造 · 让创作更专注</p>
        </div>
      </div>

      {/* 分隔线 */}
      <div className="hidden lg:block w-px self-stretch my-12" style={{ background: 'linear-gradient(to bottom, transparent, rgba(99,102,241,0.2) 20%, rgba(99,102,241,0.2) 80%, transparent)' }} />

      {/* 右侧登录区 */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* 移动端 Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-600 text-white text-xl mb-3">✍</div>
            <h1 className="text-2xl font-bold text-slate-900">墨笔 AI</h1>
            <p className="text-slate-500 text-sm mt-1">专为网文作家打造的 AI 写作助手</p>
          </div>

          <div className="hidden lg:block mb-8">
            <h3 className="text-2xl font-bold text-slate-900">{mode === 'login' ? '欢迎回来' : '开始创作之旅'}</h3>
            <p className="text-slate-500 text-sm mt-1">{mode === 'login' ? '登录你的墨笔账号，继续你的故事' : '注册账号，解锁 AI 写作全功能'}</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
              {(['login', 'register'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${mode === m ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                  {m === 'login' ? '登录' : '注册'}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">笔名</label>
                  <input type="text" value={nickname} onChange={e => setNickname(e.target.value)}
                    placeholder="你的笔名"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">邮箱</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="your@email.com"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">密码</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="至少 6 位"
                  minLength={6}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition" />
              </div>
              {error && (
                <div className="text-red-600 text-xs bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</div>
              )}
              <button type="submit" disabled={loading}
                className="w-full bg-violet-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors mt-1">
                {loading ? '处理中…' : mode === 'login' ? '登录' : '创建账号'}
              </button>
            </form>

            {mode === 'login' && (
              <p className="text-center text-xs text-slate-400 mt-5">
                还没有账号？<button onClick={() => setMode('register')} className="text-violet-600 hover:text-violet-700 font-medium">立即注册</button>
              </p>
            )}
          </div>

          <p className="text-center text-xs text-slate-400 mt-5">免费版每日 20 次 AI 调用</p>
        </div>
      </div>
    </div>
  );
}
