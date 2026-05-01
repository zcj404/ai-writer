import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { milestonesApi, volumesApi, projectsApi } from '../api';
import { Milestone, Volume, Chapter, Project } from '../types';

interface Props { projectId: string; chapters: Chapter[]; }

const TAGS = ['高潮', '转折', '伏笔', '铺垫', '结局'];
const TAG_COLORS: Record<string, string> = {
  '高潮': 'bg-red-100 text-red-600',
  '转折': 'bg-orange-100 text-orange-600',
  '伏笔': 'bg-blue-100 text-blue-600',
  '铺垫': 'bg-slate-100 text-slate-500',
  '结局': 'bg-green-100 text-green-600',
};
const TAG_DOT: Record<string, string> = {
  '高潮': 'bg-red-400',
  '转折': 'bg-orange-400',
  '伏笔': 'bg-blue-400',
  '铺垫': 'bg-slate-400',
  '结局': 'bg-green-400',
};

function sortedMilestones(items: Milestone[], volumes: Volume[]) {
  const volOrder: Record<string, number> = {};
  volumes.forEach((v, i) => { volOrder[v.id] = i; });
  return [...items].sort((a, b) => {
    const va = a.volume_id ? (volOrder[a.volume_id] ?? 999) : 999;
    const vb = b.volume_id ? (volOrder[b.volume_id] ?? 999) : 999;
    if (va !== vb) return va - vb;
    // 按目标章节数字排序
    const ca = parseInt(a.target_chapter || '9999');
    const cb = parseInt(b.target_chapter || '9999');
    return ca - cb;
  });
}

type PlanMode = 'milestones' | 'synopsis' | 'outline';

const PLAN_MODES: { key: PlanMode; icon: string; label: string; desc: string }[] = [
  { key: 'milestones', icon: '📌', label: '情节钉', desc: '记录故事关键节点和转折' },
  { key: 'synopsis',   icon: '📝', label: '故事梗概', desc: '记录全局故事方向和核心矛盾' },
  { key: 'outline',    icon: '🗺️', label: 'AI 参考大纲', desc: '基于梗概和情节钉生成参考大纲' },
];

export default function Outline({ projectId, chapters }: Props) {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [synopsis, setSynopsis] = useState('');
  const [synopsisSaved, setSynopsisSaved] = useState(true);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [mode, setMode] = useState<PlanMode>('milestones');
  const synopsisTimer = useRef<any>(null);

  useEffect(() => {
    volumesApi.list(projectId).then(setVolumes);
    milestonesApi.list(projectId).then(setMilestones);
    projectsApi.get(projectId).then(p => { setProject(p); setSynopsis(p.synopsis || ''); });
  }, [projectId]);

  const saveSynopsis = (val: string) => {
    clearTimeout(synopsisTimer.current);
    setSynopsisSaved(false);
    synopsisTimer.current = setTimeout(() => {
      projectsApi.update(projectId, { synopsis: val }).then(() => setSynopsisSaved(true));
    }, 1500);
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto px-8 py-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-1">创作规划</h2>
        <p className="text-sm text-slate-400 mb-6">规划故事走向，记录关键情节节点</p>
        <div className="flex gap-6 items-start">
          {/* 左：主区域 */}
          <div className="flex-1 min-w-0">
            {/* 模式卡片 */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {PLAN_MODES.map(m => (
                <button key={m.key} onClick={() => setMode(m.key)}
                  className={`flex flex-col items-start gap-1.5 px-4 py-4 rounded-2xl border text-left transition-all ${
                    mode === m.key
                      ? 'bg-violet-600 text-white border-violet-600 shadow-md'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:shadow-sm'
                  }`}>
                  <span className="text-xl">{m.icon}</span>
                  <span className="text-sm font-semibold">{m.label}</span>
                  <span className={`text-xs leading-relaxed ${mode === m.key ? 'text-violet-200' : 'text-slate-400'}`}>{m.desc}</span>
                </button>
              ))}
            </div>
            {/* 内容区 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              {mode === 'milestones' && <MilestonesTab projectId={projectId} volumes={volumes} onMilestonesChange={setMilestones} />}
              {mode === 'synopsis' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-700">故事梗概</h3>
                    <span className={`text-xs ${synopsisSaved ? 'text-emerald-500' : 'text-amber-500'}`}>{synopsisSaved ? '已保存' : '保存中…'}</span>
                  </div>
                  <textarea
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-300 resize-none h-64 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="主角是谁，核心矛盾是什么，故事走向大致如何…"
                    value={synopsis}
                    onChange={e => { setSynopsis(e.target.value); saveSynopsis(e.target.value); }}
                  />
                </div>
              )}
              {mode === 'outline' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-slate-700">AI 参考大纲</h3>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">基于故事梗概和情节钉生成，仅供参考</p>
                  <AIOutlineTab projectId={projectId} synopsis={synopsis} milestones={milestones} project={project} />
                </div>
              )}
            </div>
          </div>
          {/* 右：写作进度 */}
          <div className="w-72 flex-shrink-0 space-y-4">
            <ProgressCard chapters={chapters} volumes={volumes} />
            <TipsCard />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressCard({ chapters, volumes }: { chapters: Chapter[]; volumes: Volume[] }) {
  const total = chapters.reduce((s, c) => s + (c.word_count || 0), 0);
  const todayKey = `today_words_${new Date().toISOString().slice(0, 10)}`;
  const todayWords = parseInt(localStorage.getItem(todayKey) || '0', 10);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">写作进度</h3>
      <div className="flex gap-3">
        <div className="flex-1 bg-violet-50 rounded-xl px-3 py-2.5 text-center">
          <div className="text-lg font-bold text-violet-600">{total.toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-0.5">总字数</div>
        </div>
        <div className="flex-1 bg-emerald-50 rounded-xl px-3 py-2.5 text-center">
          <div className="text-lg font-bold text-emerald-600">{todayWords.toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-0.5">今日码字</div>
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2.5 text-center">
          <div className="text-lg font-bold text-slate-700">{chapters.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">章节数</div>
        </div>
        <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2.5 text-center">
          <div className="text-lg font-bold text-slate-700">{volumes.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">卷数</div>
        </div>
      </div>
      {volumes.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {volumes.map(v => {
            const vWords = chapters.filter(c => c.volume_id === v.id).reduce((s, c) => s + (c.word_count || 0), 0);
            const pct = total > 0 ? Math.round(vWords / total * 100) : 0;
            return (
              <div key={v.id}>
                <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                  <span className="truncate max-w-[120px]">{v.name}</span>
                  <span>{vWords.toLocaleString()} 字</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TipsCard() {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-600 mb-3">规划模块说明</h3>
      <div className="space-y-2.5 text-xs text-slate-500 leading-relaxed">
        <div>
          <span className="font-medium text-slate-600">📌 情节钉</span>
          <span className="ml-1">标记故事中的关键节点与转折，帮助你在长篇创作中不迷失主线。</span>
        </div>
        <div>
          <span className="font-medium text-slate-600">📝 故事梗概</span>
          <span className="ml-1">记录全局走向与核心矛盾，是整部作品的灵魂锚点。</span>
        </div>
        <div>
          <span className="font-medium text-slate-600">🗺️ AI 参考大纲</span>
          <span className="ml-1">基于你的梗概与情节钉生成，仅供参考，最终的故事由你来书写。</span>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400 leading-relaxed font-serif italic">
        千里之行，始于足下。工具只是辅助，真正的故事来自你的想象与热爱，莫让AI替代了你的创造力。愿诸位笔耕不辍，早日证道成神。
      </div>
    </div>
  );
}

function MilestonesTab({ projectId, volumes, onMilestonesChange }: { projectId: string; volumes: Volume[]; onMilestonesChange: (m: Milestone[]) => void }) {
  const [items, setItems] = useState<Milestone[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '', tag: '', volume_id: '', target_chapter: '' });

  useEffect(() => {
    milestonesApi.list(projectId).then(setItems);
  }, [projectId]);

  const openNew = () => { setForm({ title: '', description: '', tag: '', volume_id: '', target_chapter: '' }); setEditing('new'); };
  const openEdit = (m: Milestone) => {
    setForm({ title: m.title, description: m.description, tag: m.tag || '', volume_id: m.volume_id || '', target_chapter: m.target_chapter || '' });
    setEditing(m.id);
  };
  const save = async () => {
    if (!form.title.trim()) return;
    const payload = { title: form.title, description: form.description, tag: form.tag || null, volume_id: form.volume_id || null, target_chapter: form.target_chapter || null, order_num: items.length };
    let next: Milestone[];
    if (editing === 'new') {
      const m = await milestonesApi.create(projectId, payload);
      next = [...items, m];
    } else {
      const m = await milestonesApi.update(projectId, editing!, payload);
      next = items.map(x => x.id === m.id ? m : x);
    }
    setItems(next); onMilestonesChange(next);
    setEditing(null);
  };
  const remove = async (id: string) => {
    await milestonesApi.remove(projectId, id);
    const next = items.filter(x => x.id !== id);
    setItems(next); onMilestonesChange(next);
  };

  const sorted = sortedMilestones(items, volumes);

  return (
    <div className="space-y-6">
      <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 text-sm text-slate-600 leading-relaxed">
        <span className="font-medium text-violet-700">什么是情节钉？</span>
        {' '}情节钉是故事中的关键节点，比如主角的重大突破、命运转折、伏笔埋设等。不需要写细节，只需钉住这些重要时刻，帮助你在创作时不偏离主线。
      </div>

      {/* 时间轴 */}
      {sorted.length > 0 && <TimelineView items={sorted} volumes={volumes} />}

      {/* 列表 */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-medium text-slate-700">情节钉列表</span>
          <button onClick={openNew} className="text-sm bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors">+ 添加</button>
        </div>
        {items.length === 0 && editing !== 'new' && (
          <div className="text-center py-10 text-slate-400 text-sm">还没有情节钉，点击右上角添加</div>
        )}
        <div className="space-y-2">
          {sorted.map((m) => (
            editing === m.id ? (
              <MilestoneForm key={m.id} form={form} setForm={setForm} volumes={volumes} onSave={save} onCancel={() => setEditing(null)} />
            ) : (
              <div key={m.id} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-slate-900">{m.title}</span>
                    {m.tag && <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${TAG_COLORS[m.tag] || 'bg-slate-100 text-slate-500'}`}>{m.tag}</span>}
                    {m.target_chapter && <span className="text-xs text-slate-400">约{m.target_chapter}</span>}
                    {m.volume_id && <span className="text-xs text-slate-400">{volumes.find(v=>v.id===m.volume_id)?.name}</span>}
                  </div>
                  {m.description && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{m.description}</p>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => openEdit(m)} className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1">编辑</button>
                  <button onClick={() => remove(m.id)} className="text-xs text-slate-400 hover:text-red-500 px-2 py-1">删除</button>
                </div>
              </div>
            )
          ))}
          {editing === 'new' && (
            <MilestoneForm form={form} setForm={setForm} volumes={volumes} onSave={save} onCancel={() => setEditing(null)} />
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineDot({ m, i, volumes, pinned, onPin, onUnpin }: {
  m: Milestone; i: number; volumes: Volume[];
  pinned: boolean; onPin: () => void; onUnpin: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const updatePos = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.top });
    }
  };

  const showPopup = hovered || pinned;

  const popup = showPopup && typeof document !== 'undefined' ? ReactDOM.createPortal(
    <div className="fixed bg-white border border-slate-200 rounded-xl shadow-xl px-3 py-2.5 w-56 text-left pointer-events-none"
      style={{ left: pos.x, top: pos.y - 8, transform: 'translate(-50%, -100%)', zIndex: 9999 }}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-semibold text-xs text-slate-800">{m.title}</span>
        {m.tag && <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${TAG_COLORS[m.tag] || 'bg-slate-100 text-slate-500'}`}>{m.tag}</span>}
      </div>
      {m.description && <p className="text-xs text-slate-500 leading-relaxed mb-1.5">{m.description}</p>}
      <div className="flex gap-2 text-xs text-slate-400">
        {m.target_chapter && <span>约{m.target_chapter}</span>}
        {m.volume_id && <span>{volumes.find(v => v.id === m.volume_id)?.name}</span>}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="flex flex-col items-center flex-1 min-w-[90px]">
      <button
        ref={btnRef}
        onClick={() => { updatePos(); pinned ? onUnpin() : onPin(); }}
        onMouseEnter={() => { updatePos(); setHovered(true); }}
        onMouseLeave={() => setHovered(false)}
        className={`relative z-10 w-6 h-6 rounded-full border-2 border-white shadow flex items-center justify-center text-white text-xs font-bold cursor-pointer transition-all hover:scale-110 ${m.tag ? (TAG_DOT[m.tag] || 'bg-violet-500') : 'bg-violet-500'} ${pinned ? 'ring-2 ring-violet-400 ring-offset-1' : ''}`}>
        {i + 1}
      </button>
      {popup}
      <div className="mt-2 px-1 text-center w-full">
        <div className="text-xs font-medium text-slate-700 leading-tight break-words">{m.title}</div>
        {m.tag && <span className={`inline-block text-xs px-1 py-0.5 rounded mt-0.5 font-medium ${TAG_COLORS[m.tag] || 'bg-slate-100 text-slate-500'}`}>{m.tag}</span>}
      </div>
    </div>
  );
}

function TimelineView({ items, volumes }: { items: Milestone[]; volumes: Volume[] }) {
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPinned(new Set());
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef}>
      <span className="text-sm font-medium text-slate-700 block mb-4">故事时间轴</span>
      <div className="relative pb-2 overflow-x-auto">
        <div className="relative flex items-start" style={{ minWidth: `${items.length * 100}px` }}>
          <div className="absolute left-0 right-0" style={{ top: '11px', height: '2px', background: '#e2e8f0' }} />
          {items.map((m, i) => (
            <TimelineDot key={m.id} m={m} i={i} volumes={volumes}
              pinned={pinned.has(m.id)}
              onPin={() => setPinned(prev => new Set(Array.from(prev).concat(m.id)))}
              onUnpin={() => setPinned(prev => { const s = new Set(prev); s.delete(m.id); return s; })} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChapterSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const PRESETS = ['第50章以前', '第50-100章', '第100-150章', '第150-200章', '第200-300章', '第300-400章', '第400-500章', '第500章以后'];
  const [custom, setCustom] = useState(false);
  const isPreset = PRESETS.includes(value) || value === '';

  return (
    <div className="flex-1">
      {!custom ? (
        <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          value={isPreset ? value : '__custom__'}
          onChange={e => {
            if (e.target.value === '__custom__') { setCustom(true); }
            else onChange(e.target.value);
          }}>
          <option value="">目标章节（可选）</option>
          {PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
          <option value="__custom__">自定义…</option>
        </select>
      ) : (
        <div className="flex gap-1">
          <input autoFocus className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            placeholder="如：第88章" value={value} onChange={e => onChange(e.target.value)} />
          <button onClick={() => { setCustom(false); }} className="text-xs text-slate-400 hover:text-slate-600 px-2">↩</button>
        </div>
      )}
    </div>
  );
}

function MilestoneForm({ form, setForm, volumes, onSave, onCancel }: {
  form: { title: string; description: string; tag: string; volume_id: string; target_chapter: string };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  volumes: Volume[];
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border border-violet-300 rounded-xl px-4 py-3 bg-violet-50 space-y-2">
      <input autoFocus className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        placeholder="情节钉标题（如：主角突破金丹期）" value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} />
      <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-violet-500"
        placeholder="简要描述（可选）" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} />
      <div className="flex gap-1.5 flex-wrap">
        {TAGS.map(t => (
          <button key={t} onClick={() => setForm(p => ({...p, tag: p.tag === t ? '' : t}))}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${form.tag === t ? (TAG_COLORS[t] + ' border-transparent font-medium') : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {volumes.length > 0 && (
          <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            value={form.volume_id} onChange={e => setForm(p => ({...p, volume_id: e.target.value, target_chapter: ''}))}>
            <option value="">不关联卷</option>
            {volumes.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
        {form.volume_id && (
          <ChapterSelect value={form.target_chapter} onChange={v => setForm(p => ({...p, target_chapter: v}))} />
        )}
      </div>
      {volumes.length > 0 && <p className="text-xs text-slate-400">关联卷（可选）— 关联卷后可进一步设置目标章节范围</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-sm text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-100">取消</button>
        <button onClick={onSave} className="text-sm bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700">保存</button>
      </div>
    </div>
  );
}

function AIOutlineTab({ projectId, synopsis, milestones, project }: { projectId: string; synopsis: string; milestones: Milestone[]; project: Project | null }) {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  const run = async () => {
    const hasSynopsis = synopsis.trim().length > 0;
    const hasMilestones = milestones.length > 0;
    let text = '';
    let fallback = false;

    if (hasSynopsis || hasMilestones) {
      const parts = [];
      if (hasSynopsis) parts.push(`故事梗概：${synopsis}`);
      if (hasMilestones) parts.push(`关键情节钉：\n${milestones.map((m, i) => `${i+1}. ${m.title}${m.tag ? `（${m.tag}）` : ''}${m.target_chapter ? ` 约${m.target_chapter}` : ''}`).join('\n')}`);
      text = parts.join('\n\n');
    } else if (project) {
      text = `书名：${project.title}${project.genre ? `\n类型：${project.genre}` : ''}${project.description ? `\n简介：${project.description}` : ''}`;
      fallback = true;
    } else {
      setResult('请先填写故事梗概或添加情节钉');
      return;
    }

    setUsedFallback(fallback);
    setLoading(true); setResult('');
    try {
      const baseURL = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api';
      const token = localStorage.getItem('token');
      const resp = await fetch(`${baseURL}/ai/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'outline', text }),
      });
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop()!;
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          const parsed = JSON.parse(data);
          if (parsed.text) setResult(p => p + parsed.text);
          if (parsed.error) setResult('错误：' + parsed.error);
        }
      }
    } catch (err: any) { setResult('错误：' + err.message); }
    setLoading(false);
  };

  return (
    <div>
      <button onClick={run} disabled={loading}
        className="w-full bg-violet-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors">
        {loading ? 'AI 生成中…' : '生成参考大纲'}
      </button>
      {result && (
        <div className="mt-3">
          {usedFallback && (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mb-2">
              未找到故事梗概和情节钉，已根据书名和类型随机生成，仅供参考
            </div>
          )}
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-slate-500">参考大纲</span>
            <button onClick={() => navigator.clipboard.writeText(result)}
              className="text-xs border border-slate-200 text-slate-500 px-2 py-0.5 rounded-lg hover:bg-slate-50">复制</button>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">{result}</div>
        </div>
      )}
    </div>
  );
}
