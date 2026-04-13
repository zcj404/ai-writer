import React, { useState, useEffect } from 'react';
import { worldApi } from '../api';
import { WorldItem } from '../types';

interface Props { projectId: string; }

const CATEGORIES = ['地理', '势力', '功法', '道具', '历史', '规则', '其他'];

export default function WorldBuilding({ projectId }: Props) {
  const [list, setList] = useState<WorldItem[]>([]);
  const [editing, setEditing] = useState<Partial<WorldItem> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [filter, setFilter] = useState('全部');

  useEffect(() => { worldApi.list(projectId).then(setList); }, [projectId]);

  const save = async () => {
    if (!editing?.title?.trim()) return;
    if (isNew) {
      const item = await worldApi.create(projectId, editing);
      setList(prev => [...prev, item]);
    } else {
      const item = await worldApi.update(projectId, editing.id!, editing);
      setList(prev => prev.map(x => x.id === item.id ? item : x));
    }
    setEditing(null);
  };

  const remove = async (id: string) => {
    if (!window.confirm('确认删除？')) return;
    await worldApi.remove(projectId, id);
    setList(prev => prev.filter(x => x.id !== id));
  };

  const filtered = filter === '全部' ? list : list.filter(x => x.category === filter);

  return (
    <div className="flex h-full">
      <div className="w-56 border-r bg-gray-50 flex flex-col">
        <div className="p-3 border-b flex justify-between items-center">
          <span className="font-medium text-gray-700">世界观设定</span>
          <button onClick={() => { setEditing({ category: '其他' }); setIsNew(true); }} className="text-indigo-600 text-sm">+新增</button>
        </div>
        <div className="p-2 border-b flex flex-wrap gap-1">
          {['全部', ...CATEGORIES].map(c => (
            <button key={c} onClick={() => setFilter(c)} className={`text-xs px-2 py-0.5 rounded-full ${filter === c ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{c}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map(item => (
            <div key={item.id} onClick={() => { setEditing(item); setIsNew(false); }} className="p-3 cursor-pointer hover:bg-indigo-50 border-b group relative">
              <div className="text-xs text-indigo-500 mb-0.5">{item.category}</div>
              <div className="font-medium text-sm text-gray-800">{item.title}</div>
              <button onClick={e => { e.stopPropagation(); remove(item.id); }} className="absolute right-2 top-2 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs">✕</button>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-xs text-gray-400 text-center py-8">暂无内容</div>}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {editing ? (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{isNew ? '新建条目' : '编辑条目'}</h3>
              <div className="flex gap-2">
                <button onClick={save} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700">保存</button>
                <button onClick={() => setEditing(null)} className="text-sm border px-3 py-1.5 rounded">取消</button>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">标题</label>
                  <input className="w-full border rounded-lg p-2 text-sm" value={editing.title || ''} onChange={e => setEditing(p => ({ ...p, title: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">分类</label>
                  <select className="w-full border rounded-lg p-2 text-sm" value={editing.category || '其他'} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">详细内容</label>
                <textarea className="w-full border rounded-lg p-2 text-sm h-64 resize-none" value={editing.content || ''} onChange={e => setEditing(p => ({ ...p, content: e.target.value }))} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center"><div className="text-4xl mb-3">🌍</div><div>选择条目查看详情</div></div>
          </div>
        )}
      </div>
    </div>
  );
}
