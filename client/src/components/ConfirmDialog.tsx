import React from 'react';

interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  danger?: boolean;
}

export default function ConfirmDialog({ message, onConfirm, onCancel, confirmText = '确认', danger = true }: Props) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-72 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <p className="text-sm text-gray-700 leading-relaxed">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-1.5 text-sm rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
            取消
          </button>
          <button onClick={onConfirm}
            className={`px-4 py-1.5 text-sm rounded-lg text-white transition-colors ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
