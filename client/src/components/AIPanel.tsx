import React, { useState } from 'react';
import { aiApi } from '../api';
import { AIAction } from '../types';

interface Props {
  selectedText?: string;
  onInsert?: (text: string) => void;
}

const ACTIONS: { key: AIAction; label: string; desc: string; icon: string }[] = [
  { key: 'continue', label: '续写', desc: '从当前内容继续创作', icon: '✍️' },
  { key: 'expand', label: '扩写', desc: '扩展内容，增加细节', icon: '📝' },
  { key: 'rewrite', label: '改写', desc: '改写选中内容', icon: '🔄' },
  { key: 'polish', label: '润色', desc: '优化语言表达', icon: '✨' },
  { key: 'summarize', label: '摘要', desc: '生成内容摘要', icon: '📋' },
  { key: 'proofread', label: '校对', desc: '检查错别字和语病', icon: '🔍' },
  { key: 'outline', label: '大纲', desc: '根据描述生成章节大纲', icon: '📑' },
  { key: 'brainstorm', label: '灵感', desc: '获取创意和情节建议', icon: '💡' },
  { key: 'character', label: '人设', desc: '根据描述生成人物设定', icon: '👤' },
  { key: 'title', label: '书名', desc: '生成书名和简介', icon: '📚' },
];

export default function AIPanel({ selectedText, onInsert }: Props) {
  const [action, setAction] = useState<AIAction>('continue');
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async () => {
    const text = input || selectedText || '';
    if (!text.trim()) return;
    setLoading(true);
    setResult('');
    try {
      const res = await aiApi.assist(action, text);
      setResult(res);
    } catch (err: any) {
      setResult('错误：' + (err.response?.data?.error || err.message));
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-gray-700 mb-2">AI 助手</h3>
        <div className="grid grid-cols-5 gap-1">
          {ACTIONS.map(a => (
            <button
              key={a.key}
              onClick={() => setAction(a.key)}
              title={a.desc}
              className={`p-1.5 rounded text-xs flex flex-col items-center gap-0.5 transition-colors ${action === a.key ? 'bg-indigo-100 text-indigo-700 font-medium' : 'hover:bg-gray-100 text-gray-600'}`}
            >
              <span>{a.icon}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 border-b">
        {selectedText && (
          <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-gray-600">
            <span className="text-yellow-600 font-medium">已选文本：</span>
            {selectedText.length > 100 ? selectedText.slice(0, 100) + '...' : selectedText}
          </div>
        )}
        <textarea
          className="w-full border rounded p-2 text-sm h-24 resize-none"
          placeholder={`输入${ACTIONS.find(a => a.key === action)?.desc}的内容...`}
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button
          onClick={run}
          disabled={loading}
          className="w-full mt-2 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
        >
          {loading ? '生成中...' : `开始${ACTIONS.find(a => a.key === action)?.label}`}
        </button>
      </div>

      {result && (
        <div className="flex-1 p-3 overflow-y-auto">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-xs font-medium text-gray-500">生成结果</h4>
            <div className="flex gap-2">
              {onInsert && (
                <button onClick={() => onInsert(result)} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">
                  插入编辑器
                </button>
              )}
              <button onClick={() => navigator.clipboard.writeText(result)} className="text-xs border px-2 py-1 rounded hover:bg-gray-50">
                复制
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 p-3 rounded">
            {result}
          </div>
        </div>
      )}
    </div>
  );
}
