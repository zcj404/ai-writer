import React, { useState } from 'react';
import { aiApi } from '../api';

interface Props { projectId: string; }

export default function Outline({ projectId }: Props) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'outline' | 'brainstorm' | 'title'>('outline');

  const MODES = [
    { key: 'outline' as const, label: '大纲生成', placeholder: '输入故事背景、主角设定、核心冲突...' },
    { key: 'brainstorm' as const, label: '情节灵感', placeholder: '描述当前情节，获取后续发展建议...' },
    { key: 'title' as const, label: '书名简介', placeholder: '描述你的故事类型和核心卖点...' },
  ];

  const run = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setResult('');
    try {
      const res = await aiApi.assist(mode, input);
      setResult(res);
    } catch (err: any) {
      setResult('错误：' + err.message);
    }
    setLoading(false);
  };

  const current = MODES.find(m => m.key === mode)!;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-4">创作规划</h2>
      <div className="flex gap-2 mb-4">
        {MODES.map(m => (
          <button key={m.key} onClick={() => setMode(m.key)} className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === m.key ? 'bg-indigo-600 text-white' : 'border hover:bg-gray-50 text-gray-600'}`}>
            {m.label}
          </button>
        ))}
      </div>
      <textarea
        className="w-full border rounded-xl p-4 text-sm h-40 resize-none mb-3"
        placeholder={current.placeholder}
        value={input}
        onChange={e => setInput(e.target.value)}
      />
      <button onClick={run} disabled={loading} className="w-full bg-indigo-600 text-white py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 font-medium">
        {loading ? 'AI生成中...' : `生成${current.label}`}
      </button>
      {result && (
        <div className="mt-4">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-medium text-gray-700">生成结果</h4>
            <button onClick={() => navigator.clipboard.writeText(result)} className="text-xs border px-2 py-1 rounded hover:bg-gray-50">复制</button>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{result}</div>
        </div>
      )}
    </div>
  );
}
