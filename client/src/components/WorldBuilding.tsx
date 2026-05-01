import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { worldApi, aiApi, mapExportsApi } from '../api';
import { WorldItem, MapExport } from '../types';
import ConfirmDialog from './ConfirmDialog';

interface Props { projectId: string; genre?: string; }

const CATEGORIES = ['地理', '势力', '功法', '道具', '历史', '规则', '其他'];
const TEMPLATES: Record<string, string> = {
  地理: '【位置】\n\n【地貌特征】\n\n【重要地标】\n\n【势力归属】\n\n【特殊资源/危险】\n',
  势力: '【全称/简称】\n\n【核心理念/目标】\n\n【领导层】\n\n【势力范围】\n\n【与其他势力关系】\n\n【内部派系】\n',
  功法: '【类型】（攻击/防御/辅助/综合）\n\n【境界划分】\n\n【修炼方式】\n\n【特点/代价】\n\n【来源/传承】\n',
  道具: '【品级/等级】\n\n【外观描述】\n\n【能力/效果】\n\n【来源/制造方式】\n\n【持有者】\n',
  历史: '【时间节点】\n\n【事件经过】\n\n【参与方】\n\n【影响与后果】\n',
  规则: '【规则内容】\n\n【适用范围】\n\n【违反后果】\n\n【例外情况】\n',
  其他: '',
};

const FACTION_COLORS = [
  '#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6',
  '#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16',
];

const SHAPE_TEMPLATES: { name: string; points: { x: number; y: number }[] }[] = [
  { name: '大陆', points: [{x:-90,y:-40},{x:-60,y:-80},{x:-10,y:-90},{x:50,y:-70},{x:90,y:-30},{x:80,y:30},{x:40,y:70},{x:-20,y:80},{x:-70,y:50},{x:-90,y:10}] },
  { name: '岛屿', points: [{x:0,y:-70},{x:50,y:-40},{x:70,y:10},{x:40,y:60},{x:0,y:75},{x:-40,y:60},{x:-70,y:10},{x:-50,y:-40}] },
  { name: '国家', points: [{x:-70,y:-60},{x:20,y:-70},{x:80,y:-30},{x:70,y:50},{x:10,y:70},{x:-60,y:60},{x:-80,y:10}] },
  { name: '城邦', points: [{x:-40,y:-60},{x:40,y:-60},{x:60,y:0},{x:40,y:60},{x:-40,y:60},{x:-60,y:0}] },
  { name: '山脉', points: [{x:-90,y:30},{x:-60,y:-20},{x:-30,y:50},{x:0,y:-40},{x:30,y:20},{x:60,y:-50},{x:90,y:30}] },
  { name: '河流域', points: [{x:-80,y:-70},{x:0,y:-80},{x:80,y:-50},{x:90,y:0},{x:60,y:60},{x:-10,y:80},{x:-80,y:40}] },
];

function parseItem(item: any): WorldItem {
  return {
    ...item,
    relations: typeof item.relations === 'string' ? JSON.parse(item.relations || '[]') : (item.relations || []),
    position: typeof item.position === 'string' ? JSON.parse(item.position) : item.position,
    polygon: typeof item.polygon === 'string' ? JSON.parse(item.polygon) : item.polygon,
  };
}

function scaleShape(points: { x: number; y: number }[], cx: number, cy: number, scale = 1.5): { x: number; y: number }[] {
  return points.map(p => ({ x: cx + p.x * scale, y: cy + p.y * scale }));
}

// ---- DetailPanel ----
interface DetailPanelProps {
  item: WorldItem;
  isNew: boolean;
  allItems: WorldItem[];
  aiLoading: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onAI: () => void;
  onChange: (patch: Partial<WorldItem>) => void;
}
function DetailPanel({ item, isNew, allItems, aiLoading, onSave, onCancel, onDelete, onAI, onChange }: DetailPanelProps) {
  const [relOpen, setRelOpen] = useState(false);
  const [quickNew, setQuickNew] = useState<{ title: string; category: string } | null>(null);
  const relRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (relRef.current && !relRef.current.contains(e.target as Node)) setRelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const relIds = item.relations || [];
  const relItems = allItems.filter(x => relIds.includes(x.id) && x.id !== item.id);
  const otherItems = allItems.filter(x => x.id !== item.id);

  const toggleRel = (id: string) => {
    const cur = item.relations || [];
    onChange({ relations: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  };

  return (
    <div className="w-80 border-l border-slate-200 bg-white flex flex-col overflow-hidden shrink-0">
      <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center shrink-0">
        <span className="text-sm font-semibold text-slate-700">{isNew ? '新建条目' : '编辑条目'}</span>
        <div className="flex gap-1.5">
          <button onClick={onAI} disabled={aiLoading || !item.title?.trim()}
            className="text-xs border border-violet-300 text-violet-600 px-2.5 py-1 rounded-lg hover:bg-violet-50 disabled:opacity-40 flex items-center gap-1">
            {aiLoading ? <span className="w-2.5 h-2.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin inline-block" /> : '✦'}
            AI
          </button>
          <button onClick={onSave} className="text-xs bg-violet-600 text-white px-2.5 py-1 rounded-lg hover:bg-violet-700">保存</button>
          {!isNew && <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 px-1">删除</button>}
          <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{item.category === '地理' ? '地名' : '名称'}</label>
          <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            value={item.title || ''} onChange={e => onChange({ title: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">分类</label>
          <select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            value={item.category || '其他'} onChange={e => onChange({ category: e.target.value, content: isNew ? (TEMPLATES[e.target.value] || '') : item.content })}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {(item.category === '势力' || item.category === '地理') && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">区域颜色</label>
            <div className="flex gap-1.5 flex-wrap">
              {FACTION_COLORS.map(c => (
                <button key={c} onClick={() => onChange({ color: c })}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${item.color === c ? 'border-slate-700 scale-110' : 'border-transparent'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">详细内容</label>
          <textarea className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm h-48 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
            value={item.content || ''} onChange={e => onChange({ content: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">相关条目</label>
          <p className="text-xs text-slate-400 mb-1.5">关联相关设定，如地点"天玄山"可关联势力"玄天宗"。</p>
          <div className="relative" ref={relRef}>
            <div className="min-h-[34px] border border-slate-200 rounded-xl px-2.5 py-1.5 flex flex-wrap gap-1 cursor-text" onClick={() => setRelOpen(true)}>
              {relItems.map(r => (
                <span key={r.id} className="inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                  {r.title}
                  <button onClick={e => { e.stopPropagation(); toggleRel(r.id); }} className="hover:text-red-500">×</button>
                </span>
              ))}
              {relItems.length === 0 && <span className="text-xs text-slate-400">点击添加...</span>}
            </div>
            {relOpen && (
              <div className="absolute z-10 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {otherItems.map(x => (
                  <div key={x.id} onClick={() => toggleRel(x.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-50 text-sm ${relIds.includes(x.id) ? 'text-violet-600' : 'text-slate-700'}`}>
                    <span className={`w-3 h-3 rounded border flex items-center justify-center text-xs ${relIds.includes(x.id) ? 'bg-violet-600 border-violet-600 text-white' : 'border-slate-300'}`}>
                      {relIds.includes(x.id) ? '✓' : ''}
                    </span>
                    <span className="text-xs text-violet-400 w-8 shrink-0">{x.category}</span>
                    {x.title}
                  </div>
                ))}
                {quickNew ? (
                  <div className="px-3 py-2 border-t border-slate-100 flex gap-2 items-center">
                    <select value={quickNew.category} onChange={e => setQuickNew(p => ({ ...p!, category: e.target.value }))}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input autoFocus placeholder="名称" value={quickNew.title}
                      onChange={e => setQuickNew(p => ({ ...p!, title: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Escape') setQuickNew(null); }}
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none" />
                    <button onClick={() => { if (quickNew.title.trim()) { onChange({ _quickNew: quickNew } as any); setQuickNew(null); setRelOpen(false); } }}
                      disabled={!quickNew.title.trim()}
                      className="text-xs bg-violet-600 text-white px-2 py-1 rounded-lg disabled:opacity-40">确定</button>
                    <button onClick={() => setQuickNew(null)} className="text-xs text-slate-400">✕</button>
                  </div>
                ) : (
                  <div onClick={() => setQuickNew({ title: '', category: '其他' })}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-violet-50 text-violet-600 text-xs border-t border-slate-100">
                    + 新建并关联
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- NonMapList ----
const NON_MAP_CATS = ['功法', '道具', '历史', '规则', '其他'];
function NonMapList({ items, onEdit }: { items: WorldItem[]; onEdit: (item: WorldItem) => void }) {
  const [open, setOpen] = useState(true);
  const nonMap = items.filter(i => NON_MAP_CATS.includes(i.category));
  if (nonMap.length === 0) return null;
  return (
    <div className="absolute bottom-4 left-4 bg-white border border-slate-200 rounded-xl shadow-sm w-52 z-10">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-xl">
        <span>其他设定 ({nonMap.length})</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 max-h-48 overflow-y-auto">
          {nonMap.map(item => (
            <div key={item.id} onClick={() => onEdit(item)}
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-50 text-xs">
              <span className="text-slate-400 w-8 shrink-0">{item.category}</span>
              <span className="text-slate-700 truncate">{item.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function pointInPolygon(pt: {x:number;y:number}, poly: {x:number;y:number}[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polyArea(poly: {x:number;y:number}[]) {
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

// ---- MapCanvas ----
type DrawMode = 'select' | 'draw' | 'shape' | 'ai';

interface MapCanvasProps {
  items: WorldItem[];
  selected: WorldItem | null;
  drawMode: DrawMode;
  onSelect: (item: WorldItem | null) => void;
  onUpdatePosition: (id: string, pos: { x: number; y: number }, snapshot?: boolean) => void;
  onUpdatePolygon: (id: string, polygon: { x: number; y: number }[], persist?: boolean) => void;
  onFinishDraw: (polygon: { x: number; y: number }[]) => void;
  onSnapshotBefore: (id: string) => void;
  projectId: string;
}

export interface MapCanvasHandle {
  getViewCenter: () => { x: number; y: number };
  getZoom: () => number;
  getSvgDataUrl: () => Promise<string> | null;
}

const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  { items, selected, drawMode, onSelect, onUpdatePosition, onUpdatePolygon, onFinishDraw, onSnapshotBefore, projectId },
  ref
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`map_pan_${projectId}`) || 'null') || { x: 0, y: 0 }; } catch { return { x: 0, y: 0 }; }
  });
  const [zoom, setZoom] = useState(() => {
    try { return parseFloat(localStorage.getItem(`map_zoom_${projectId}`) || '1') || 1; } catch { return 1; }
  });
  const [dragging, setDragging] = useState<{
    id: string; ox: number; oy: number;
    type: 'node' | 'polygon' | 'vertex' | 'resize' | 'rotate';
    vertexIdx?: number;
    startPoly?: { x: number; y: number }[];
    centerX?: number; centerY?: number; startDist?: number; startAngle?: number;
  } | null>(null);
  const [panning, setPanning] = useState<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const svgToWorld = useCallback((cx: number, cy: number) => ({
    x: (cx - pan.x) / zoom, y: (cy - pan.y) / zoom,
  }), [pan, zoom]);

  useImperativeHandle(ref, () => ({
    getViewCenter: () => {
      const el = svgRef.current;
      if (!el) return { x: 0, y: 0 };
      const { width, height } = el.getBoundingClientRect();
      return { x: (width / 2 - pan.x) / zoom, y: (height / 2 - pan.y) / zoom };
    },
    getZoom: () => zoom,
    getSvgDataUrl: () => {
      const el = svgRef.current;
      if (!el) return null;
      const { width, height } = el.getBoundingClientRect();
      const clone = el.cloneNode(true) as SVGSVGElement;
      // Remove grid rect and defs pattern
      clone.querySelectorAll('rect[fill="url(#grid)"]').forEach(n => n.remove());
      clone.querySelectorAll('defs').forEach(n => n.remove());
      // Add white background
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', '-10000'); bg.setAttribute('y', '-10000');
      bg.setAttribute('width', '20000'); bg.setAttribute('height', '20000');
      bg.setAttribute('fill', 'white');
      clone.insertBefore(bg, clone.firstChild);
      const serialized = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      return new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d')!.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
        img.src = url;
      });
    },
  }));

  const getClientPos = (e: React.MouseEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
  };

  const updatePan = (p: { x: number; y: number }) => {
    setPan(p); localStorage.setItem(`map_pan_${projectId}`, JSON.stringify(p));
  };
  const updateZoom = (z: number, np: { x: number; y: number }) => {
    setZoom(z); setPan(np);
    localStorage.setItem(`map_zoom_${projectId}`, String(z));
    localStorage.setItem(`map_pan_${projectId}`, JSON.stringify(np));
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const nz = Math.min(Math.max(zoom * factor, 0.2), 5);
    if (selected) {
      const el = svgRef.current!;
      const { width, height } = el.getBoundingClientRect();
      const wx = selected.polygon?.length
        ? selected.polygon.reduce((s, p) => s + p.x, 0) / selected.polygon.length
        : (selected.position?.x ?? 0);
      const wy = selected.polygon?.length
        ? selected.polygon.reduce((s, p) => s + p.y, 0) / selected.polygon.length
        : (selected.position?.y ?? 0);
      updateZoom(nz, { x: width / 2 - wx * nz, y: height / 2 - wy * nz });
    } else {
      const { cx, cy } = getClientPos(e);
      updateZoom(nz, { x: cx - (cx - pan.x) * (nz / zoom), y: cy - (cy - pan.y) * (nz / zoom) });
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (drawMode === 'draw') {
      const { cx, cy } = getClientPos(e);
      setDrawPoints(prev => [...prev, svgToWorld(cx, cy)]);
      return;
    }
    // Check if clicking on a handle (vertex/resize/rotate)
    if ((e.target as SVGElement).closest('[data-handle]')) return;
    if (drawMode === 'select') {
      const { cx, cy } = getClientPos(e);
      const wp = svgToWorld(cx, cy);
      // Find smallest polygon containing the click point
      const hit = items
        .filter(i => i.polygon?.length && pointInPolygon(wp, i.polygon!))
        .sort((a, b) => polyArea(a.polygon!) - polyArea(b.polygon!))[0];
      if (hit) {
        onSnapshotBefore(hit.id);
        setDragging({ id: hit.id, ox: wp.x, oy: wp.y, type: 'polygon', startPoly: hit.polygon! });
        onSelect(hit);
        return;
      }
      // Check geo node items
      const nodeHit = items.find(i => i.position && !i.polygon?.length && (() => {
        const dx = wp.x - i.position!.x, dy = wp.y - i.position!.y;
        return Math.sqrt(dx*dx + dy*dy) < 12 / zoom;
      })());
      if (nodeHit) {
        onSnapshotBefore(nodeHit.id);
        setDragging({ id: nodeHit.id, ox: wp.x - nodeHit.position!.x, oy: wp.y - nodeHit.position!.y, type: 'node' });
        onSelect(nodeHit);
        return;
      }
      onSelect(null);
    }
    setPanning({ sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const { cx, cy } = getClientPos(e);
    const wp = svgToWorld(cx, cy);
    if (drawMode === 'draw') { setMousePos(wp); return; }
    if (dragging) {
      if (dragging.type === 'node') {
        onUpdatePosition(dragging.id, { x: wp.x - dragging.ox, y: wp.y - dragging.oy });
      } else if (dragging.type === 'polygon' && dragging.startPoly) {
        const dx = wp.x - dragging.ox, dy = wp.y - dragging.oy;
        onUpdatePolygon(dragging.id, dragging.startPoly.map(p => ({ x: p.x + dx, y: p.y + dy })), false);
      } else if (dragging.type === 'resize' && dragging.startPoly && dragging.centerX !== undefined && dragging.startDist) {
        const dx = wp.x - dragging.centerX!, dy = wp.y - dragging.centerY!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const scale = dist / dragging.startDist;
        onUpdatePolygon(dragging.id, dragging.startPoly.map(p => ({
          x: dragging.centerX! + (p.x - dragging.centerX!) * scale,
          y: dragging.centerY! + (p.y - dragging.centerY!) * scale,
        })), false);
      } else if (dragging.type === 'rotate' && dragging.startPoly && dragging.centerX !== undefined && dragging.startAngle !== undefined) {
        const angle = Math.atan2(wp.y - dragging.centerY!, wp.x - dragging.centerX!) - dragging.startAngle;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        onUpdatePolygon(dragging.id, dragging.startPoly.map(p => ({
          x: dragging.centerX! + (p.x - dragging.centerX!) * cos - (p.y - dragging.centerY!) * sin,
          y: dragging.centerY! + (p.x - dragging.centerX!) * sin + (p.y - dragging.centerY!) * cos,
        })), false);
      } else if (dragging.type === 'vertex' && dragging.startPoly && dragging.vertexIdx !== undefined) {
        const newPoly = [...dragging.startPoly];
        newPoly[dragging.vertexIdx] = wp;
        onUpdatePolygon(dragging.id, newPoly, false);
      }
    } else if (panning) {
      updatePan({ x: panning.px + e.clientX - panning.sx, y: panning.py + e.clientY - panning.sy });
    }
  };

  const onMouseUp = () => {
    if (dragging) {
      if (dragging.type === 'polygon' || dragging.type === 'vertex' || dragging.type === 'resize' || dragging.type === 'rotate') {
        const item = items.find(x => x.id === dragging.id);
        if (item?.polygon) onUpdatePolygon(dragging.id, item.polygon, true);
      } else if (dragging.type === 'node') {
        const item = items.find(x => x.id === dragging.id);
        if (item?.position) onUpdatePosition(dragging.id, item.position);
      }
    }
    setDragging(null); setPanning(null);
  };

  const onDblClick = (e: React.MouseEvent) => {
    if (drawMode !== 'draw' || drawPoints.length < 3) return;
    onFinishDraw(drawPoints);
    setDrawPoints([]); setMousePos(null);
  };

  const onNodeMouseDown = (e: React.MouseEvent, item: WorldItem) => {
    if (drawMode !== 'select') return;
    e.stopPropagation();
    onSnapshotBefore(item.id);
    const { cx, cy } = getClientPos(e);
    const wp = svgToWorld(cx, cy);
    if (item.polygon?.length) {
      setDragging({ id: item.id, ox: wp.x, oy: wp.y, type: 'polygon', startPoly: item.polygon });
    } else {
      const pos = item.position || { x: 0, y: 0 };
      setDragging({ id: item.id, ox: wp.x - pos.x, oy: wp.y - pos.y, type: 'node' });
    }
    onSelect(item);
  };

  const onVertexMouseDown = (e: React.MouseEvent, item: WorldItem, idx: number) => {
    e.stopPropagation();
    onSnapshotBefore(item.id);
    const { cx, cy } = getClientPos(e);
    const wp = svgToWorld(cx, cy);
    setDragging({ id: item.id, ox: wp.x, oy: wp.y, type: 'vertex', vertexIdx: idx, startPoly: [...item.polygon!] });
  };

  const geoItems = items.filter(i => i.category === '地理' && i.position && !i.polygon?.length);
  const polyItems = items.filter(i => i.polygon?.length).sort((a, b) => {
    const area = (poly: {x:number;y:number}[]) => {
      const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
      return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    };
    return area(a.polygon!) - area(b.polygon!);
  });
  const previewPoly = drawMode === 'draw' && drawPoints.length > 0 ? [...drawPoints, ...(mousePos ? [mousePos] : [])] : null;

  return (
    <div className="w-full h-full flex flex-col">
    <svg ref={svgRef} className="flex-1 w-full select-none"
      style={{ cursor: drawMode === 'draw' ? 'crosshair' : panning ? 'grabbing' : 'grab' }}
      onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={onMouseUp} onDoubleClick={onDblClick}>
      <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
        <defs>
          <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#e2e8f0" strokeWidth={1 / zoom} />
          </pattern>
        </defs>
        <rect x={-10000} y={-10000} width={20000} height={20000} fill="url(#grid)" />

        {polyItems.map(f => {
          const pts = f.polygon!.map(p => `${p.x},${p.y}`).join(' ');
          const col = f.color || (f.category === '地理' ? '#64748b' : '#6366f1');
          const isSel = selected?.id === f.id;
          return (
            <g key={f.id} style={{ cursor: drawMode === 'select' ? 'grab' : 'default' }}>
              <polygon points={pts} fill={col} fillOpacity={0.15}
                stroke={col} strokeWidth={isSel ? 2 / zoom : 1.5 / zoom}
                strokeDasharray={isSel ? undefined : `${6 / zoom},${3 / zoom}`} />
              <text x={f.polygon!.reduce((s, p) => s + p.x, 0) / f.polygon!.length}
                y={f.polygon!.reduce((s, p) => s + p.y, 0) / f.polygon!.length}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={14 / zoom} fill={col} fontWeight="600" style={{ pointerEvents: 'none' }}>
                {f.title}
              </text>
              {isSel && f.polygon!.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={6 / zoom}
                  fill="white" stroke={col} strokeWidth={2 / zoom}
                  data-handle="1"
                  style={{ cursor: 'crosshair' }}
                  onMouseDown={e => onVertexMouseDown(e, f, i)} />
              ))}
              {isSel && (() => {
                const xs = f.polygon!.map(p => p.x), ys = f.polygon!.map(p => p.y);
                const minX = Math.min(...xs), maxX = Math.max(...xs);
                const minY = Math.min(...ys), maxY = Math.max(...ys);
                const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
                const corners = [
                  { x: minX, y: minY, cursor: 'nw-resize' },
                  { x: maxX, y: minY, cursor: 'ne-resize' },
                  { x: maxX, y: maxY, cursor: 'se-resize' },
                  { x: minX, y: maxY, cursor: 'sw-resize' },
                ];
                return (<>
                  <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY}
                    fill="none" stroke={col} strokeWidth={1 / zoom} strokeDasharray={`${4/zoom},${2/zoom}`} style={{ pointerEvents: 'none' }} />
                  {corners.map((c, i) => (
                    <rect key={`r${i}`} x={c.x - 5/zoom} y={c.y - 5/zoom} width={10/zoom} height={10/zoom}
                      fill="white" stroke={col} strokeWidth={2/zoom} data-handle="1" style={{ cursor: c.cursor }}
                      onMouseDown={e => {
                        e.stopPropagation();
                        onSnapshotBefore(f.id);
                        const { cx: ecx, cy: ecy } = getClientPos(e);
                        const wp = svgToWorld(ecx, ecy);
                        const dx = wp.x - cx, dy = wp.y - cy;
                        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                        setDragging({ id: f.id, ox: wp.x, oy: wp.y, type: 'resize', startPoly: [...f.polygon!], centerX: cx, centerY: cy, startDist: dist });
                      }} />
                  ))}
                  {/* Rotation handle */}
                  <text x={cx} y={minY - 14/zoom}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={16/zoom} fill={col}
                    data-handle="1"
                    style={{ cursor: 'grab', userSelect: 'none' }}
                    onMouseDown={e => {
                      e.stopPropagation();
                      onSnapshotBefore(f.id);
                      const { cx: ecx, cy: ecy } = getClientPos(e);
                      const wp = svgToWorld(ecx, ecy);
                      const angle = Math.atan2(wp.y - cy, wp.x - cx);
                      setDragging({ id: f.id, ox: wp.x, oy: wp.y, type: 'rotate', startPoly: [...f.polygon!], centerX: cx, centerY: cy, startAngle: angle });
                    }}>↻</text>
                </>);
              })()}
            </g>
          );
        })}

        {previewPoly && (
          <polyline points={previewPoly.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke="#6366f1" strokeWidth={2 / zoom} strokeDasharray={`${6 / zoom},${3 / zoom}`} />
        )}
        {drawPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4 / zoom} fill="#6366f1" />
        ))}

        {geoItems.map(item => {
          const pos = item.position!;
          const isSel = selected?.id === item.id;
          return (
            <g key={item.id} transform={`translate(${pos.x},${pos.y})`}
              style={{ cursor: drawMode === 'select' ? 'grab' : 'default' }}>
              <circle r={isSel ? 10 / zoom : 8 / zoom}
                fill={isSel ? '#7c3aed' : '#fff'}
                stroke={isSel ? '#7c3aed' : '#94a3b8'} strokeWidth={2 / zoom} />
              <text y={-14 / zoom} textAnchor="middle" fontSize={12 / zoom}
                fill={isSel ? '#7c3aed' : '#334155'} fontWeight={isSel ? '600' : '400'}
                style={{ pointerEvents: 'none' }}>
                {item.title}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
    <div className="h-3 w-1/2 mx-auto shrink-0 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}
      onScroll={e => updatePan({ x: -(e.currentTarget.scrollLeft - 4000), y: pan.y })}
      ref={el => { if (el && !panning) el.scrollLeft = -pan.x + 4000; }}>
      <div style={{ width: 8000, height: 1 }} />
    </div>
    </div>
  );
});

// ---- ShapePanel ----
function ShapePanel({ onSelect }: { onSelect: (pts: { x: number; y: number }[]) => void }) {
  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-3 flex gap-2">
      {SHAPE_TEMPLATES.map(tpl => (
        <button key={tpl.name} onClick={() => onSelect(scaleShape(tpl.points, 0, 0, 1.5))}
          className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-violet-50 border border-transparent hover:border-violet-300 transition-all">
          <svg viewBox="-110 -110 220 220" className="w-12 h-12">
            <polygon points={tpl.points.map(p => `${p.x},${p.y}`).join(' ')}
              fill="#6366f1" fillOpacity="0.15" stroke="#6366f1" strokeWidth="2" />
          </svg>
          <span className="text-xs text-slate-600">{tpl.name}</span>
        </button>
      ))}
    </div>
  );
}

// ---- Main ----
export default function WorldBuilding({ projectId, genre }: Props) {
  const [list, setList] = useState<WorldItem[]>([]);
  const [editing, setEditing] = useState<Partial<WorldItem> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>('select');
  const [drawTarget, setDrawTarget] = useState<WorldItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [shapeAiLoading, setShapeAiLoading] = useState(false);
  const [exports, setExports] = useState<MapExport[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportName, setExportName] = useState('');
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showExportSidebar, setShowExportSidebar] = useState(false);
  const [confirmExportDelete, setConfirmExportDelete] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const mapRef = useRef<MapCanvasHandle>(null);

  // Undo history: each entry is a snapshot of polygon/position per item id
  type HistoryEntry = { id: string; polygon?: { x: number; y: number }[] | null; position?: { x: number; y: number } | null };
  const undoStack = useRef<HistoryEntry[][]>([]);

  const pushUndo = useCallback((id: string, item: WorldItem) => {
    undoStack.current.push([{ id, polygon: item.polygon ? [...item.polygon] : null, position: item.position ? { ...item.position } : null }]);
    if (undoStack.current.length > 50) undoStack.current.shift();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const entry = undoStack.current.pop();
        if (!entry) return;
        entry.forEach(({ id, polygon, position }) => {
          setList(prev => prev.map(x => x.id === id ? { ...x, polygon: polygon ?? x.polygon, position: position ?? x.position } : x));
          worldApi.update(projectId, id, { polygon, position } as any);
        });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [projectId]);

  useEffect(() => {
    mapExportsApi.list(projectId).then(setExports).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    worldApi.list(projectId).then(items => {
      const parsed = items.map(parseItem);
      const toUpdate: Promise<any>[] = [];
      const withPos = parsed.map(item => {
        if (item.category === '地理' && !item.position && !item.polygon?.length) {
          const pos = { x: Math.random() * 600 - 300, y: Math.random() * 400 - 200 };
          toUpdate.push(worldApi.update(projectId, item.id, { position: pos } as any));
          return { ...item, position: pos };
        }
        return item;
      });
      setList(withPos);
      Promise.all(toUpdate);
    });
  }, [projectId]);

  const save = async () => {
    if (!editing?.title?.trim()) return;
    const dupName = list.find(x => x.title === editing.title && x.id !== editing.id);
    if (dupName) { alert(`已存在同名条目"${editing.title}"，请使用不同名称。`); return; }
    if (isNew) {
      const payload = { ...editing };
      if (payload.category === '地理' && !payload.position && !payload.polygon) {
        payload.position = { x: Math.random() * 400 - 200, y: Math.random() * 300 - 150 };
      }
      const item = await worldApi.create(projectId, payload);
      const parsed = parseItem(item);
      setList(prev => [...prev, parsed]);
      setDrawTarget(parsed);
    } else {
      const item = await worldApi.update(projectId, editing.id!, editing);
      setList(prev => prev.map(x => x.id === item.id ? parseItem(item) : x));
    }
    setEditing(null);
  };

  const doDelete = async () => {
    if (!editing?.id) return;
    setConfirmDelete(null);
    await worldApi.remove(projectId, editing.id);
    setList(prev => prev.filter(x => x.id !== editing.id));
    setEditing(null);
  };

  const aiGenerate = async () => {
    if (!editing?.title?.trim()) return;
    setAiLoading(true);
    try {
      const prompt = `请为网文世界观设定生成一个"${editing.category}"类型的条目，名称是"${editing.title}"。${editing.content ? `已有内容：\n${editing.content}\n\n请补充完善。` : '请生成详细设定。'}`;
      const result = await aiApi.assist('brainstorm', prompt);
      setEditing(p => ({ ...p, content: result }));
    } finally { setAiLoading(false); }
  };

  const aiGenerateShape = async (item: WorldItem) => {
    setShapeAiLoading(true);
    try {
      const prompt = `你是SVG地图生成器。根据地名"${item.title}"（类型：${item.category}）生成多边形轮廓。要求：返回8-12个坐标点JSON数组[{"x":数字,"y":数字}...]，坐标范围-150到150，形状符合地名气质。只返回JSON数组。`;
      const result = await aiApi.assist('raw', prompt);
      const match = result.match(/\[[\s\S]*\]/);
      if (match) {
        const rawPts = JSON.parse(match[0]);
        if (Array.isArray(rawPts) && rawPts.length >= 3) {
          const center = mapRef.current?.getViewCenter() || { x: 0, y: 0 };
          const currentZoom = mapRef.current?.getZoom() ?? 1;
          const cx = rawPts.reduce((s: number, p: any) => s + p.x, 0) / rawPts.length;
          const cy = rawPts.reduce((s: number, p: any) => s + p.y, 0) / rawPts.length;
          // normalize raw extents (~150px) to screen pixel size, then convert to world coords
          const points = rawPts.map((p: any) => ({
            x: center.x + (p.x - cx) / currentZoom,
            y: center.y + (p.y - cy) / currentZoom,
          }));
          pushUndo(item.id, item);
          await updatePolygon(item.id, points);
          setDrawMode('select');
          setDrawTarget(null);
          return;
        }
      }
      alert('AI生成失败，请重试');
    } catch { alert('AI生成失败，请重试'); }
    finally { setShapeAiLoading(false); }
  };

  const handleChange = async (patch: Partial<WorldItem> & { _quickNew?: { title: string; category: string } }) => {
    if (patch._quickNew) {
      const { _quickNew, ...rest } = patch;
      const newItem = await worldApi.create(projectId, { category: _quickNew.category, title: _quickNew.title, content: TEMPLATES[_quickNew.category] || '' });
      setList(prev => [...prev, parseItem(newItem)]);
      setEditing(p => ({ ...p, ...rest, relations: [...(p?.relations || []), newItem.id] }));
    } else {
      setEditing(p => ({ ...p, ...patch }));
    }
  };

  const updatePosition = async (id: string, pos: { x: number; y: number }) => {
    setList(prev => prev.map(x => x.id === id ? { ...x, position: pos } : x));
    if (editing?.id === id) setEditing(p => ({ ...p, position: pos }));
    await worldApi.update(projectId, id, { position: pos } as any);
  };

  const updatePolygon = async (id: string, polygon: { x: number; y: number }[], persist = true) => {
    setList(prev => prev.map(x => x.id === id ? { ...x, polygon } : x));
    if (persist) await worldApi.update(projectId, id, { polygon } as any);
  };

  const onFinishDraw = async (polygon: { x: number; y: number }[]) => {
    if (!drawTarget) return;
    const cur = list.find(x => x.id === drawTarget.id);
    if (cur) pushUndo(drawTarget.id, cur);
    await updatePolygon(drawTarget.id, polygon);
    setDrawMode('select');
    setDrawTarget(null);
  };


  const doExport = async () => {
    setExportLoading(true);
    setShowExportDialog(false);
    try {
      const image_data = mapRef.current ? await mapRef.current.getSvgDataUrl() : null;
      if (!image_data) { alert('导出失败，请重试'); return; }
      const existingNums = new Set(exports.map(e => e.name));
      let idx = 0;
      while (existingNums.has(String(idx))) idx++;
      const name = exportName.trim() || String(idx);
      const saved = await mapExportsApi.create(projectId, { name, image_data });
      setExports(prev => [...prev, saved]);
      setShowExportSidebar(true);
    } catch { alert('导出失败，请重试'); }
    finally { setExportLoading(false); setExportName(''); }
  };

  const startNew = (category = '其他') => {
    setEditing({ category, content: TEMPLATES[category] || '', relations: [] });
    setIsNew(true);
    setDrawTarget(null);
  };

  const selectedItem = editing
    ? { ...(list.find(x => x.id === editing.id) || {}), ...editing } as WorldItem
    : null;

  const DRAW_MODES: { key: DrawMode; label: string; icon: string }[] = [
    { key: 'select', label: '选择', icon: '↖' },
    { key: 'draw', label: '手绘', icon: '✏️' },
    { key: 'shape', label: '预设', icon: '⬡' },
    { key: 'ai', label: 'AI', icon: '✦' },
  ];

  return (
    <div className="flex h-full relative">
      {confirmExportDelete && (
        <ConfirmDialog message="确认删除此导出图片？" onConfirm={async () => { await mapExportsApi.remove(projectId, confirmExportDelete); setExports(prev => prev.filter(x => x.id !== confirmExportDelete)); setConfirmExportDelete(null); }} onCancel={() => setConfirmExportDelete(null)} />
      )}
      {confirmDelete && (
        <ConfirmDialog message="确认删除此条目？" onConfirm={doDelete} onCancel={() => setConfirmDelete(null)} />
      )}

      {/* Toolbar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex gap-2 bg-white border border-slate-200 rounded-xl shadow-sm px-3 py-1.5 items-center">
        <button onClick={() => startNew('地理')} className="text-xs text-slate-600 hover:text-violet-600 px-2 py-1 rounded-lg hover:bg-violet-50">🗺️ 添加地点</button>
        <div className="w-px h-4 bg-slate-200" />
        <button onClick={() => startNew('势力')} className="text-xs text-slate-600 hover:text-violet-600 px-2 py-1 rounded-lg hover:bg-violet-50">⚔️ 添加势力</button>
        <div className="w-px h-4 bg-slate-200" />
        <button onClick={() => startNew()} className="text-xs text-slate-600 hover:text-violet-600 px-2 py-1 rounded-lg hover:bg-violet-50">+ 其他设定</button>
        <div className="w-px h-4 bg-slate-200" />
        <button onClick={() => setShowExportDialog(true)} disabled={exportLoading || list.length === 0}
          className="text-xs text-slate-600 hover:text-violet-600 px-2 py-1 rounded-lg hover:bg-violet-50 disabled:opacity-40 flex items-center gap-1">
          {exportLoading ? <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin inline-block" /> : '🗺️'} 导出地图
        </button>
        {exports.length > 0 && (
          <button onClick={() => setShowExportSidebar(s => !s)} className="text-xs text-slate-500 hover:text-violet-600 px-2 py-1 rounded-lg hover:bg-violet-50">
            导出记录({exports.length})
          </button>
        )}
        {drawTarget && (
          <>
            <div className="w-px h-4 bg-slate-200" />
            <span className="text-xs text-slate-500">为"{drawTarget.title}"绘制范围：</span>
            <div className="flex gap-1">
              {DRAW_MODES.filter(m => m.key !== 'select').map(m => (
                <button key={m.key}
                  onClick={() => {
                    if (m.key === 'ai') { aiGenerateShape(drawTarget); return; }
                    setDrawMode(m.key);
                  }}
                  disabled={m.key === 'ai' && shapeAiLoading}
                  className={`text-xs px-2 py-1 rounded-lg border transition-all ${drawMode === m.key ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 text-slate-600 hover:border-violet-400 hover:bg-violet-50'} disabled:opacity-50`}>
                  {m.key === 'ai' && shapeAiLoading ? <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin inline-block" /> : m.icon} {m.label}
                </button>
              ))}
            </div>
            {drawMode === 'draw' && <span className="text-xs text-violet-500">点击画顶点，双击完成</span>}
            <button onClick={() => { setDrawMode('select'); setDrawTarget(null); }} className="text-xs text-red-400 hover:text-red-600">取消</button>
          </>
        )}
      </div>

      {/* Shape picker */}
      {drawMode === 'shape' && drawTarget && (
        <ShapePanel onSelect={async pts => {
          const center = mapRef.current?.getViewCenter() || { x: 0, y: 0 };
          const currentZoom = mapRef.current?.getZoom() ?? 1;
          // pts are normalized to -100~100; scale so shape is ~200px on screen regardless of zoom
          const worldScale = 1 / currentZoom;
          const centered = scaleShape(pts, center.x, center.y, worldScale);
          pushUndo(drawTarget.id, drawTarget);
          await updatePolygon(drawTarget.id, centered);
          setDrawMode('select');
          setDrawTarget(null);
        }} />
      )}

      {/* Map */}
      <div className="flex-1 relative overflow-hidden bg-slate-50">
        <MapCanvas
          ref={mapRef}
          items={list}
          selected={selectedItem}
          drawMode={drawMode}
          onSelect={item => { if (item) { setEditing(item); setIsNew(false); } else setEditing(null); }}
          onUpdatePosition={updatePosition}
          onUpdatePolygon={updatePolygon}
          onFinishDraw={onFinishDraw}
          onSnapshotBefore={id => { const cur = list.find(x => x.id === id); if (cur) pushUndo(id, cur); }}
          projectId={projectId}
        />
        {/* Redraw button for existing polygon items */}
        {editing && (editing.category === '势力' || editing.category === '地理') && !isNew && !drawTarget && (
          <button onClick={() => { const f = list.find(x => x.id === editing.id); if (f) { setDrawTarget(f); setDrawMode('draw'); } }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs bg-violet-600 text-white px-4 py-2 rounded-xl shadow hover:bg-violet-700">
            {list.find(x => x.id === editing.id)?.polygon?.length ? '🔄 重新绘制范围' : `✏️ 绘制"${editing.title}"的范围`}
          </button>
        )}
        {list.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-slate-400">
              <div className="text-5xl mb-3">🌍</div>
              <div className="text-sm font-medium text-slate-500 mb-1">开始构建你的世界观</div>
              <div className="text-xs text-slate-400">点击上方"添加地点"绘制大陆、国家、城市</div>
              <div className="text-xs text-slate-400 mt-0.5">点击"添加势力"绘制门派、王国的势力范围</div>
            </div>
          </div>
        )}
        <NonMapList items={list} onEdit={item => { setEditing(item); setIsNew(false); }} />
        {/* Compass */}
        <div className="absolute top-14 left-4 w-14 h-14 pointer-events-none select-none">
          <svg viewBox="0 0 56 56" className="w-full h-full">
            <polygon points="28,14 24,30 28,26 32,30" fill="#ef4444"/>
            <polygon points="28,42 24,26 28,30 32,26" fill="#94a3b8"/>
            <text x="28" y="10" textAnchor="middle" fontSize="8" fill="#ef4444" fontWeight="700">北</text>
            <text x="28" y="54" textAnchor="middle" fontSize="8" fill="#64748b">南</text>
            <text x="5" y="31" textAnchor="middle" fontSize="8" fill="#64748b">西</text>
            <text x="51" y="31" textAnchor="middle" fontSize="8" fill="#64748b">东</text>
          </svg>
        </div>
      </div>

      {editing && (
        <DetailPanel
          item={selectedItem!}
          isNew={isNew}
          allItems={list}
          aiLoading={aiLoading}
          onSave={save}
          onCancel={() => setEditing(null)}
          onDelete={() => setConfirmDelete(editing.id || '')}
          onAI={aiGenerate}
          onChange={handleChange}
        />
      )}

      {/* Export naming dialog */}
      {showExportDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 flex flex-col gap-4">
            <div className="text-sm font-semibold text-slate-700">导出地图</div>
            <input className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder={(() => { const s = new Set(exports.map(e => e.name)); let i = 0; while (s.has(String(i))) i++; return `默认名称：${i}`; })()}
              value={exportName} onChange={e => setExportName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doExport(); if (e.key === 'Escape') setShowExportDialog(false); }}
              autoFocus />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowExportDialog(false)} className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5">取消</button>
              <button onClick={doExport} className="text-xs bg-violet-600 text-white px-4 py-1.5 rounded-xl hover:bg-violet-700">生成</button>
            </div>
          </div>
        </div>
      )}

      {/* Export sidebar */}
      {showExportSidebar && (
        <div className="w-52 border-l border-slate-200 bg-white flex flex-col shrink-0">
          <div className="px-3 py-2 border-b border-slate-200 flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-600">导出记录</span>
            <button onClick={() => setShowExportSidebar(false)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {exports.map(ex => (
              <div key={ex.id} className="border border-slate-200 rounded-xl overflow-hidden">
                {ex.image_data && (
                  <img src={ex.image_data} alt={ex.name} className="w-full object-cover cursor-zoom-in"
                    onClick={() => setLightbox(ex.image_data!)} />
                )}
                <div className="flex items-center justify-between px-2 py-1 gap-1">
                  <span className="text-xs text-slate-600 truncate flex-1">{ex.name}</span>
                  {ex.image_data && (
                    <a href={ex.image_data} download={`${ex.name}.png`}
                      className="text-xs text-slate-400 hover:text-slate-600 shrink-0">下载</a>
                  )}
                  <button onClick={() => setConfirmExportDelete(ex.id)}
                    className="text-xs text-red-400 hover:text-red-600 shrink-0">删除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-[90%] max-h-[90%] rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
