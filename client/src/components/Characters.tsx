import React, { useState, useEffect } from 'react';
import { charactersApi } from '../api';
import { Character } from '../types';
import { aiApi } from '../api';

interface Props { projectId: string; }

const EMPTY: Partial<Character> = { name: '', role: '', description: '', personality: '', background: '', appearance: '' };

export default function Characters({ projectId }: Props) {
  const [list, setList] = useState<Character[]>([]);
  const [editing, setEditing] = useState<Partial<Character> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { charactersApi.list(projectId).then(setList); }, [projectId]);

  const save = async () => {
    if (!editing?.name?.trim()) return;
    if (isNew) {
      const c = await charactersApi.create(projectId, editing);
      setList(prev => [...prev, c]);
    } else {
      const c = await charactersApi.update(projectId, editing.id!, editing);
      setList(prev => prev.map(x => x.id === c.id ? c : x));
    }
    setEditing(null);
  };

  const remove = async (id: string) => {
    if (!window.confirm('确认删除？')) return;
    await charactersApi.remove(projectId, id);
    setList(prev => prev.filter(c => c.id !== id));
  };

  const generate = async () => {
    const desc = editing?.description || editing?.name;
    if (!desc) return;
    setGenerating(true);
    try {
      const result = await aiApi.assist('character', desc);
      setEditing(prev => ({ ...prev, background: result }));
    } finally { setGenerating(false); }
  };

  const fields: { key: keyof Character; label: string; multi?: boolean }[] = [
    { key: 'name', label: '姓名' }, { key: 'role', label: '角色定位' },
    { key: 'appearance', label: '外貌' }, { key: 'personality', label: '性格' },
    { key: 'description', label: '简介' }, { key: 'background', label: '背景故事', multi: true },
  ];

  return (
    <div className="flex h-full">
      <div className="w-56 border-r bg-gray-50 flex flex-col">
        <div className="p-3 border-b flex justify-between items-center">
          <span className="font-medium text-gray-700">人物设定</span>
          <button onClick={() => { setEditing(EMPTY); setIsNew(true); }} className="text-indigo-600 text-sm hover:text-indigo-800">+新增</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.map(c => (
            <div key={c.id} onClick={() => { setEditing(c); setIsNew(false); }} className="p-3 cursor-pointer hover:bg-indigo-50 border-b group relative">
              <div className="font-medium text-sm text-gray-800">{c.name}</div>
              {c.role && <div className="text-xs text-gray-400">{c.role}</div>}
              <button onClick={e => { e.stopPropagation(); remove(c.id); }} className="absolute right-2 top-2 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs">✕</button>
            </div>
          ))}
          {list.length === 0 && <div className="text-xs text-gray-400 text-center py-8">暂无人物</div>}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {editing ? (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{isNew ? '新建人物' : '编辑人物'}</h3>
              <div className="flex gap-2">
                <button onClick={generate} disabled={generating} className="text-sm border px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-50">
                  {generating ? 'AI生成中...' : 'AI生成设定'}
                </button>
                <button onClick={save} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700">保存</button>
                <button onClick={() => setEditing(null)} className="text-sm border px-3 py-1.5 rounded hover:bg-gray-50">取消</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {fields.map(f => (
                <div key={f.key} className={f.multi ? 'col-span-2' : ''}>
                  <label className="block text-sm font-medium text-gray-600 mb-1">{f.label}</label>
                  {f.multi
                    ? <textarea className="w-full border rounded-lg p-2 text-sm h-32 resize-none" value={(editing as any)[f.key] || ''} onChange={e => setEditing(prev => ({ ...prev, [f.key]: e.target.value }))} />
                    : <input className="w-full border rounded-lg p-2 text-sm" value={(editing as any)[f.key] || ''} onChange={e => setEditing(prev => ({ ...prev, [f.key]: e.target.value }))} />
                  }
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center"><div className="text-4xl mb-3">👤</div><div>选择人物查看详情</div></div>
          </div>
        )}
      </div>
    </div>
  );
}
