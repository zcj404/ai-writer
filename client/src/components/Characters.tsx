import React, { useState, useEffect, useRef, useCallback } from 'react';
import { charactersApi, chaptersApi, aiApi, relationshipsApi, snapshotsApi } from '../api';
import { Character, Chapter, Relationship, RelationSnapshot } from '../types';
import ConfirmDialog from './ConfirmDialog';

interface Props { projectId: string; projectGenre?: string; chapters: Chapter[]; }

const EMPTY: Partial<Character> = { name: '', role: '', description: '', personality: '', background: '', appearance: '' };

// ---- Relation Graph ----
interface Node { id: string; name: string; x: number; y: number; vx: number; vy: number; fixed?: boolean; }
interface Edge extends Relationship {}

function RelationGraph({ projectId, characters, onCharacterUpdated, onCharacterCreated, projectGenre, chapters }: { projectId: string; characters: Character[]; onCharacterUpdated?: (c: Character) => void; onCharacterCreated?: (c: Character) => void; projectGenre?: string; chapters: Chapter[] }) {
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<{ type: 'node' | 'edge'; id: string } | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editingEdgeLabel, setEditingEdgeLabel] = useState('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeName, setEditingNodeName] = useState('');
  // wire drawing: dragging from a node port to create a new edge
  const wireRef = useRef<{ fromId: string; x: number; y: number } | null>(null);
  const [wireTip, setWireTip] = useState<{ x: number; y: number } | null>(null);
  const [snapshots, setSnapshots] = useState<RelationSnapshot[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [mergeDialog, setMergeDialog] = useState<{ newChapterIds: string[]; baseSnapshot: RelationSnapshot } | null>(null);
  const [reanalyzeDialog, setReanalyzeDialog] = useState<{ chapterIds: string[] } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [chapterPanelOpen, setChapterPanelOpen] = useState(false);
  const [zoom, setZoom] = useState({ scale: 1, tx: 0, ty: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingSnapshotId, setEditingSnapshotId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmSnapshotDelete, setConfirmSnapshotDelete] = useState<string | null>(null);
  const [saveDialog, setSaveDialog] = useState<{ json: any; existingMatches: Character[]; baseRelations: Edge[]; chapterIds: string[]; overlapping: RelationSnapshot[] } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; offX: number; offY: number; startClientX: number; startClientY: number } | null>(null);
  const selBoxRef = useRef<{ startX: number; startY: number } | null>(null);
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const multiDragRef = useRef<{ startX: number; startY: number; origPositions: Record<string, { x: number; y: number }> } | null>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<Node[]>([]);
  const componentCenterRef = useRef<Record<string, { x: number; y: number }>>({});
  const pauseRef = useRef(false);
  const undoStackRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [drawerCharId, setDrawerCharId] = useState<string | null>(null);
  const [newCharDialog, setNewCharDialog] = useState(false);
  const [newCharName, setNewCharName] = useState('');
  const [inheritDialog, setInheritDialog] = useState<{ existingChars: Character[]; proceed: (inherit: boolean) => void } | null>(null);
  const [syncCharDialog, setSyncCharDialog] = useState<{ char: Character; oldChar: Character; otherSnapshots: RelationSnapshot[] } | null>(null);
  const [listGenDialog, setListGenDialog] = useState<{ existingId: string } | null>(null);
  const snapshotRelsCache = useRef<Record<string, Array<{ source_id: string; target_id: string }>>>({});
  const snapshotCharCache = useRef<Record<string, Record<string, Character>>>({});
  const [draftForms, setDraftForms] = useState<Record<string, { form: Partial<Character>; pendingAvatar: string | null; genLoading?: boolean }>>();
  const [graphCharMap, setGraphCharMap] = useState<Record<string, Character>>({});
  const charMap = React.useMemo(() => ({ ...Object.fromEntries(characters.map(c => [c.id, c])), ...graphCharMap }), [characters, graphCharMap]);

  useEffect(() => {
    snapshotsApi.list(projectId).then(setSnapshots);
    relationshipsApi.list(projectId).then(existing => {
      setEdges(existing);
      initNodes(characters, existing);
    });
  }, [projectId]);

  const buildNodes = (chars: Character[], rels: Relationship[]): Node[] => {
    const involved = chars.filter(c => rels.some(r => r.source_id === c.id || r.target_id === c.id));
    if (involved.length === 0) return [];

    const parent: Record<string, string> = {};
    const find = (x: string): string => { if (parent[x] !== x) parent[x] = find(parent[x]); return parent[x]; };
    const union = (a: string, b: string) => { parent[find(a)] = find(b); };
    involved.forEach(c => { parent[c.id] = c.id; });
    rels.forEach(r => { if (parent[r.source_id] && parent[r.target_id]) union(r.source_id, r.target_id); });

    const components: Record<string, string[]> = {};
    involved.forEach(c => { const root = find(c.id); if (!components[root]) components[root] = []; components[root].push(c.id); });

    const degree: Record<string, number> = {};
    involved.forEach(c => { degree[c.id] = 0; });
    rels.forEach(r => { degree[r.source_id] = (degree[r.source_id] || 0) + 1; degree[r.target_id] = (degree[r.target_id] || 0) + 1; });

    const groups = Object.values(components);
    const W = 500, H = 400;
    const cols = groups.length === 1 ? 1 : Math.ceil(Math.sqrt(groups.length));
    const rows = Math.ceil(groups.length / cols);
    const cellW = W / cols, cellH = H / rows;

    const ns: Node[] = [];
    const centers: Record<string, { x: number; y: number }> = {};
    groups.forEach((ids, gi) => {
      const col = gi % cols, row = Math.floor(gi / cols);
      const cx = cellW * col + cellW / 2;
      const cy = cellH * row + cellH / 2;
      const r = Math.min(cellW, cellH) * 0.32;
      const sorted = [...ids].sort((a, b) => (degree[b] || 0) - (degree[a] || 0));
      sorted.forEach(id => { centers[id] = { x: cx, y: cy }; });
      sorted.forEach((id, i) => {
        const char = chars.find(c => c.id === id)!;
        if (i === 0) {
          ns.push({ id, name: char.name, x: cx, y: cy, vx: 0, vy: 0 });
        } else {
          const angle = (2 * Math.PI * (i - 1)) / (sorted.length - 1);
          ns.push({ id, name: char.name, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), vx: 0, vy: 0 });
        }
      });
    });
    componentCenterRef.current = centers;
    return ns;
  };

  // ---------- fitView (like Neo4j / d3-zoom) ----------
  // Computes a zoom transform so all nodes fit inside the SVG viewport with padding.
  // Works in the SVG's own coordinate space (500×400 viewBox) so it's independent
  // of the actual pixel size of the container – no preserveAspectRatio weirdness.
  const fitView = useCallback((ns: Node[]) => {
    if (ns.length === 0) return;
    const PAD = 50; // padding inside viewBox units
    const VW = 500, VH = 400;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ns.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    });

    const contentW = Math.max(maxX - minX, 1);
    const contentH = Math.max(maxY - minY, 1);
    // uniform scale – keep aspect ratio, same as Neo4j "fit to screen"
    const scale = Math.min(
      (VW - PAD * 2) / contentW,
      (VH - PAD * 2) / contentH,
      1.5 // don't zoom in beyond 1.5× if graph is tiny
    );
    // center the bounding box in the viewBox
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const tx = VW / 2 - cx * scale;
    const ty = VH / 2 - cy * scale;
    setZoom({ scale, tx, ty });
  }, []);

  const initNodes = (chars: Character[], rels: Relationship[]) => {
    const ns = buildNodes(chars, rels);
    nodesRef.current = ns;
    setNodes([...ns]);
    // auto fit after a short settle so the force sim has run a few ticks
    setTimeout(() => fitView(nodesRef.current), 600);
  };

  // force simulation
  useEffect(() => {
    if (nodes.length === 0) return;
    const tick = () => {
      if (!pauseRef.current) {
        const ns = nodesRef.current.map(n => ({ ...n }));
        const W = 500, H = 400, k = 80;
        for (let i = 0; i < ns.length; i++) {
          if (ns[i].fixed) continue;
          let fx = 0, fy = 0;
          for (let j = 0; j < ns.length; j++) {
            if (i === j) continue;
            const dx = ns[i].x - ns[j].x, dy = ns[i].y - ns[j].y;
            const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            fx += (k * k / d) * (dx / d);
            fy += (k * k / d) * (dy / d);
          }
          edges.forEach(e => {
            const a = e.source_id === ns[i].id ? ns.find(n => n.id === e.target_id) : e.target_id === ns[i].id ? ns.find(n => n.id === e.source_id) : null;
            if (a) {
              const dx = ns[i].x - a.x, dy = ns[i].y - a.y;
              const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
              fx -= (d - k) * (dx / d) * 0.05;
              fy -= (d - k) * (dy / d) * 0.05;
            }
          });
          const cc = componentCenterRef.current[ns[i].id];
          if (cc) {
            fx += (cc.x - ns[i].x) * 0.02;
            fy += (cc.y - ns[i].y) * 0.02;
          } else {
            fx += (W / 2 - ns[i].x) * 0.01;
            fy += (H / 2 - ns[i].y) * 0.01;
          }
          ns[i].vx = (ns[i].vx + fx) * 0.6;
          ns[i].vy = (ns[i].vy + fy) * 0.6;
          ns[i].x = Math.max(30, Math.min(W - 30, ns[i].x + ns[i].vx));
          ns[i].y = Math.max(30, Math.min(H - 30, ns[i].y + ns[i].vy));
        }
        nodesRef.current = ns;
        setNodes([...ns]);
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [edges, nodes.length]);

  const runAnalysis = async (chapterIds: string[], baseRelations: Edge[] = []) => {
    setAnalyzing(true);
    try {
      const selected = chapters.filter(c => chapterIds.includes(c.id));
      let text = selected.map(c => c.content).join('\n\n').trim();
      if (!text) { alert('所选章节内容为空，请先编写章节内容后再分析。'); return null; }
      if (text.length > 8000) text = text.slice(-8000);
      const raw = await aiApi.assist('analyze_relations', text);
      const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('AI 返回格式异常，请重试');
      const json = JSON.parse(raw.slice(start, end + 1));
      const existingMatches = (json.characters || [])
        .map((ac: any) => characters.find(c => c.name === ac.name))
        .filter(Boolean) as Character[];
      return { json, existingMatches, baseRelations };
    } catch (e: any) {
      alert(`分析失败：${e?.response?.data?.error || e?.message || '未知错误'}`);
      return null;
    } finally { setAnalyzing(false); }
  };

  const applyAnalysis = async (json: any, baseRelations: Edge[], inherit: boolean) => {
    let chars = inherit ? [...characters, ...Object.values(graphCharMap).filter(c => !characters.find(x => x.id === c.id))] : [...Object.values(graphCharMap)];
    for (const ac of (json.characters || [])) {
      const existing = chars.find(c => c.name === ac.name);
      if (existing) {
        if (!inherit) {
          const created = await charactersApi.create(projectId, { name: ac.name, role: ac.role || '' });
          onCharacterCreated?.(created);
          setGraphCharMap(prev => ({ ...prev, [created.id]: created }));
          chars = chars.filter(c => c.id !== existing.id);
          chars.push(created);
        }
      } else {
        const created = await charactersApi.create(projectId, { name: ac.name, role: ac.role || '' });
        onCharacterCreated?.(created);
        setGraphCharMap(prev => ({ ...prev, [created.id]: created }));
        chars.push(created);
      }
    }
    const newEdges: Edge[] = [...baseRelations];
    for (const r of (json.relations || [])) {
      const src = chars.find(c => c.name === r.source);
      const tgt = chars.find(c => c.name === r.target);
      if (!src || !tgt) continue;
      if (!newEdges.find(e => e.source_id === src.id && e.target_id === tgt.id))
        newEdges.push({ id: `tmp-${Date.now()}-${Math.random()}`, source_id: src.id, target_id: tgt.id, label: r.label || '' });
    }
    setEdges(newEdges);
    setActiveSnapshotId(null);
    setTimeout(() => {
      const laid = buildNodes(chars, newEdges);
      const newIds = new Set(laid.map(n => n.id));
      const ns = laid.map(n => {
        const existing = nodesRef.current.find(e => e.id === n.id);
        return existing && newIds.has(existing.id) ? { ...n, x: existing.x, y: existing.y } : n;
      });
      nodesRef.current = ns;
      setNodes([...ns]);
    }, 0);
    return { edges: newEdges, chars };
  };

  const generateFromList = async () => {
    if (!characters.length) return;
    const existing = snapshots.filter(s => s.name === '主要人物列表' || s.name.match(/^主要人物列表\(\d+\)$/));
    if (existing.length > 0) {
      setListGenDialog({ existingId: existing[0].id });
    } else {
      await doGenerateFromList(null, '主要人物列表');
    }
  };

  const doGenerateFromList = async (overwriteSnapshotId: string | null, snapName: string) => {
    setAnalyzing(true);
    try {
      // build text from characters for AI analysis
      const text = characters.map(c =>
        `【${c.name}】角色：${c.role || ''}。简介：${c.description || ''}。与其他人物关系：${c.relations || ''}`
      ).join('\n');
      const raw = await aiApi.assist('analyze_relations', text);
      const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
      if (start === -1 || end === -1) { alert('AI 返回格式异常，请重试'); return; }
      const json = JSON.parse(raw.slice(start, end + 1));
      // map AI character names back to real character IDs
      const nameToChar: Record<string, Character> = Object.fromEntries(characters.map(c => [c.name, c]));
      const newEdges: Edge[] = [];
      for (const r of (json.relations || [])) {
        const src = nameToChar[r.source] || characters.find(c => c.name.includes(r.source) || r.source.includes(c.name));
        const tgt = nameToChar[r.target] || characters.find(c => c.name.includes(r.target) || r.target.includes(c.name));
        if (!src || !tgt) continue;
        const dup = newEdges.some(e => (e.source_id === src.id && e.target_id === tgt.id) || (e.source_id === tgt.id && e.target_id === src.id));
        if (!dup) newEdges.push({ id: `gen-${src.id}-${tgt.id}`, source_id: src.id, target_id: tgt.id, label: r.label || '' });
      }
      await relationshipsApi.batchSave(projectId, newEdges.map(e => ({ source_id: e.source_id, target_id: e.target_id, label: e.label })));
      const saved = await relationshipsApi.list(projectId);
      const rels = saved.map(e => ({ source_id: e.source_id, target_id: e.target_id, label: e.label }));

      // check for existing snapshot chars that overlap with current characters
      const existingSnapChars = characters.filter(c =>
        Object.values(snapshotCharCache.current).some(m => m[c.id] && JSON.stringify(m[c.id]) !== JSON.stringify(c))
      );

      const doFinalize = async (inherit: boolean) => {
        const charUpdates: Record<string, Character> = Object.fromEntries(
          characters.map(c => {
            if (inherit) {
              const cached = Object.values(snapshotCharCache.current).map(m => m[c.id]).find(Boolean);
              return [c.id, cached || c];
            }
            return [c.id, c];
          })
        );
        let snap: RelationSnapshot;
        if (overwriteSnapshotId) {
          await snapshotsApi.update(projectId, overwriteSnapshotId, { relations: rels, chapter_ids: [], characters: charUpdates });
          snap = snapshots.find(s => s.id === overwriteSnapshotId)!;
          snapshotRelsCache.current[snap.id] = saved;
          snapshotCharCache.current[snap.id] = charUpdates;
          setSnapshots(prev => prev.map(s => s.id === overwriteSnapshotId ? { ...s } : s));
          setActiveSnapshotId(snap.id);
        } else {
          snap = await snapshotsApi.create(projectId, { name: snapName, chapter_ids: [], relations: rels, characters: charUpdates });
          snapshotRelsCache.current[snap.id] = saved;
          snapshotCharCache.current[snap.id] = charUpdates;
          setSnapshots(prev => [snap, ...prev]);
          setActiveSnapshotId(snap.id);
        }
        setGraphCharMap(prev => ({ ...prev, ...charUpdates }));
        const W = 500, H = 400;
        const newNodes: Node[] = characters.map((c, i) => {
          const angle = (2 * Math.PI * i) / characters.length;
          const r = Math.min(W, H) * 0.35;
          return { id: c.id, name: c.name, x: W / 2 + r * Math.cos(angle), y: H / 2 + r * Math.sin(angle), vx: 0, vy: 0, fixed: true };
        });
        nodesRef.current = newNodes;
        setNodes([...newNodes]);
        setEdges(saved);
        const positions: Record<string, { x: number; y: number }> = {};
        newNodes.forEach(n => { positions[n.id] = { x: n.x, y: n.y }; });
        const snapId = overwriteSnapshotId || snap.id;
        snapshotsApi.update(projectId, snapId, { positions });
        setTimeout(() => fitView(nodesRef.current), 300);
        setAnalyzing(false);
      };

      if (existingSnapChars.length > 0) {
        setInheritDialog({ existingChars: existingSnapChars, proceed: async (inherit) => { setInheritDialog(null); await doFinalize(inherit); } });
      } else {
        await doFinalize(false);
      }
    } catch (e: any) {
      alert(`生成失败：${e?.message || '未知错误'}`);
      setAnalyzing(false);
    }
  };

  const analyze = async () => {
    if (!selectedChapters.length) return;

    // exact match: snapshot covers exactly the selected chapters
    const exactSnapshot = snapshots.find(s =>
      s.chapter_ids.length === selectedChapters.length &&
      selectedChapters.every(id => s.chapter_ids.includes(id))
    );
    if (exactSnapshot) {
      setReanalyzeDialog({ chapterIds: selectedChapters });
      return;
    }

    // partial match: find snapshot that covers some (but not all) selected chapters
    // only consider snapshots whose chapter_ids are a strict subset of selectedChapters
    const baseSnapshot = snapshots.reduce<RelationSnapshot | null>((best, s) => {
      const isSubset = s.chapter_ids.every(id => selectedChapters.includes(id));
      if (!isSubset) return best;
      const overlap = s.chapter_ids.length;
      if (overlap === 0) return best;
      const bestOverlap = best ? best.chapter_ids.length : 0;
      return overlap > bestOverlap ? s : best;
    }, null);

    const newChapterIds = baseSnapshot
      ? selectedChapters.filter(id => !baseSnapshot.chapter_ids.includes(id))
      : selectedChapters;

    if (baseSnapshot && newChapterIds.length > 0) {
      setMergeDialog({ newChapterIds, baseSnapshot });
      return;
    }

    const result = await runAnalysis(selectedChapters);
    if (!result) return;
    await promptSaveSnapshot(result, selectedChapters);
  };

  const promptSaveSnapshot = async (result: { json: any; existingMatches: Character[]; baseRelations: Edge[] }, chapterIds: string[]) => {
    const overlapping = snapshots.filter(s => s.chapter_ids.some(id => chapterIds.includes(id)));
    setSaveDialog({ json: result.json, existingMatches: result.existingMatches, baseRelations: result.baseRelations, chapterIds, overlapping });
  };

  const handleMergeChoice = async (mode: 'full' | 'incremental') => {
    const { newChapterIds, baseSnapshot } = mergeDialog!;
    setMergeDialog(null);
    let result: Awaited<ReturnType<typeof runAnalysis>>;
    if (mode === 'full') {
      result = await runAnalysis(selectedChapters);
    } else {
      const full = await snapshotsApi.get(projectId, baseSnapshot.id);
      const baseEdges: Edge[] = (full.relations || []).map((r, i) => ({ id: `snap-${i}`, ...r }));
      result = await runAnalysis(newChapterIds, baseEdges);
    }
    if (!result) return;
    await promptSaveSnapshot(result, selectedChapters);
  };

  const loadSnapshot = async (snap: RelationSnapshot) => {
    const full = await snapshotsApi.get(projectId, snap.id);
    const rels: Edge[] = (full.relations || []).map((r, i) => ({ id: `snap-${i}`, ...r }));
    const positions: Record<string, { x: number; y: number }> = (full as any).positions || {};
    setEdges(rels);
    setActiveSnapshotId(snap.id);
    snapshotRelsCache.current[snap.id] = rels;
    const allIds = new Set([...rels.map(r => r.source_id), ...rels.map(r => r.target_id)]);
    // prefer snapshot-stored characters (independent from characters table)
    const snapChars: Record<string, Character> = full.characters || {};
    let updates: Record<string, Character> = {};
    if (Object.keys(snapChars).length > 0) {
      allIds.forEach(id => { updates[id] = snapChars[id] || { id, name: id.slice(0, 6), role: '' } as Character; });
    } else {
      // fallback for old snapshots: load from DB
      const allCharsFromDB = await charactersApi.listAll(projectId);
      const dbMap: Record<string, Character> = Object.fromEntries(allCharsFromDB.map((c: Character) => [c.id, c]));
      allIds.forEach(id => { updates[id] = dbMap[id] || { id, name: id.slice(0, 6), role: '' } as Character; });
    }
    snapshotCharCache.current[snap.id] = updates;
    setGraphCharMap(prev => ({ ...prev, ...updates }));
    const allChars = Object.values(updates);
    const ns = buildNodes(allChars, rels).map(n =>
      positions[n.id] ? { ...n, x: positions[n.id].x, y: positions[n.id].y, fixed: true } : n
    );
    nodesRef.current = ns;
    setNodes([...ns]);
  };

  const deleteSnapshot = async (id: string) => {
    setConfirmSnapshotDelete(id);
  };

  const doDeleteSnapshot = async (id: string) => {
    setConfirmSnapshotDelete(null);
    await snapshotsApi.remove(projectId, id);
    setSnapshots(prev => prev.filter(s => s.id !== id));
    if (activeSnapshotId === id) {
      setActiveSnapshotId(null);
      setEdges([]);
      setNodes([]);
      nodesRef.current = [];
    }
  };

  const getSnapshotName = (chapterIds: string[]) => {
    const nums = chapters
      .map((c, i) => ({ id: c.id, num: i + 1 }))
      .filter(x => chapterIds.includes(x.id))
      .map(x => x.num);
    if (nums.length === 0) return '未命名';
    if (nums.length === 1) return `第${nums[0]}章`;
    const isConsecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    return isConsecutive ? `第${nums[0]}-${nums[nums.length - 1]}章` : `第${nums.join(',')}章`;
  };

  const commitRename = async (id: string) => {
    const name = editingName.trim();
    setEditingSnapshotId(null);
    if (!name) return;
    await snapshotsApi.rename(projectId, id, name);
    setSnapshots(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  };

  const deleteEdge = (id: string) => setEdges(prev => prev.filter(e => e.id !== id));

  const pushUndo = (currentEdges: Edge[]) => {
    undoStackRef.current.push({ nodes: nodesRef.current.map(n => ({ ...n })), edges: currentEdges });
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
  };

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    pushUndo(edges);
    if (selected.type === 'edge') {
      setEdges(prev => prev.filter(e => e.id !== selected.id));
    } else {
      // remove node and its edges
      setEdges(prev => prev.filter(e => e.source_id !== selected.id && e.target_id !== selected.id));
      nodesRef.current = nodesRef.current.filter(n => n.id !== selected.id);
      setNodes([...nodesRef.current]);
    }
    setSelected(null);
  }, [selected, edges]);

  // keyboard: Delete / Backspace removes selection; Escape clears it; Ctrl+Z undoes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
      if (e.key === 'Escape') setSelected(null);
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        const snap = undoStackRef.current.pop();
        if (snap) {
          nodesRef.current = snap.nodes;
          setNodes([...snap.nodes]);
          setEdges(snap.edges);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteSelected]);

  // add a character node to the graph (drag-in from sidebar or click)
  const addCharacterNode = (charId: string) => {
    if (nodesRef.current.find(n => n.id === charId)) return;
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    setGraphCharMap(prev => ({ ...prev, [charId]: char }));
    pushUndo(edges);
    const newNode: Node = { id: charId, name: char.name, x: 250 + Math.random() * 60 - 30, y: 200 + Math.random() * 60 - 30, vx: 0, vy: 0 };
    nodesRef.current = [...nodesRef.current, newNode];
    setNodes([...nodesRef.current]);
  };

  // start drawing a wire from a node's port handle
  const onPortMouseDown = (e: React.MouseEvent, fromId: string) => {
    e.stopPropagation();
    e.preventDefault();
    pauseRef.current = true;
    const { x, y } = getSVGCoords(e);
    wireRef.current = { fromId, x, y };
    setWireTip({ x, y });
    setSelected(null);
  };

  const onMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    pauseRef.current = true;
    const { x, y } = getSVGCoords(e);
    // if this node is part of multi-selection, start multi-drag
    if (multiSelected.has(id)) {
      const origPositions: Record<string, { x: number; y: number }> = {};
      nodesRef.current.forEach(n => { if (multiSelected.has(n.id)) origPositions[n.id] = { x: n.x, y: n.y }; });
      pushUndo(edges);
      multiDragRef.current = { startX: x, startY: y, origPositions };
      return;
    }
    setMultiSelected(new Set());
    setSelected({ type: 'node', id });
    setEditingEdgeId(null);
    pushUndo(edges);
    const node = nodesRef.current.find(n => n.id === id)!;
    dragRef.current = { id, offX: x - node.x, offY: y - node.y, startClientX: e.clientX, startClientY: e.clientY };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const { x, y } = getSVGCoords(e);
    if (wireRef.current) { setWireTip({ x, y }); return; }
    if (multiDragRef.current) {
      const { startX, startY, origPositions } = multiDragRef.current;
      const dx = x - startX, dy = y - startY;
      nodesRef.current = nodesRef.current.map(n =>
        origPositions[n.id] ? { ...n, x: origPositions[n.id].x + dx, y: origPositions[n.id].y + dy, vx: 0, vy: 0 } : n
      );
      setNodes([...nodesRef.current]);
      return;
    }
    if (selBoxRef.current) {
      const sx = selBoxRef.current.startX, sy = selBoxRef.current.startY;
      setSelBox({ x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) });
      return;
    }
    if (!dragRef.current) return;
    const nx = x - dragRef.current.offX, ny = y - dragRef.current.offY;
    nodesRef.current = nodesRef.current.map(n =>
      n.id === dragRef.current!.id ? { ...n, x: nx, y: ny, vx: 0, vy: 0 } : n
    );
    setNodes([...nodesRef.current]);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (wireRef.current) {
      const { x, y } = getSVGCoords(e);
      const target = nodesRef.current.find(n => {
        const dx = n.x - x, dy = n.y - y;
        return n.id !== wireRef.current!.fromId && Math.sqrt(dx * dx + dy * dy) < 32;
      });
      if (target) {
        const fromId = wireRef.current.fromId;
        const exists = edges.find(e => e.source_id === fromId && e.target_id === target.id);
        if (!exists) {
          const newEdge: Edge = { id: `e-${Date.now()}`, source_id: fromId, target_id: target.id, label: '' };
          setEdges(prev => { pushUndo(prev); return [...prev, newEdge]; });
          setEditingEdgeId(newEdge.id);
          setEditingEdgeLabel('');
        }
      }
      wireRef.current = null;
      setWireTip(null);
      pauseRef.current = false;
      return;
    }
    if (multiDragRef.current) {
      multiDragRef.current = null;
      pauseRef.current = false;
      nodesRef.current = nodesRef.current.map(n => ({ ...n, vx: 0, vy: 0, fixed: true }));
      setNodes([...nodesRef.current]);
      if (activeSnapshotId) {
        const positions: Record<string, { x: number; y: number }> = {};
        nodesRef.current.forEach(n => { positions[n.id] = { x: n.x, y: n.y }; });
        snapshotsApi.update(projectId, activeSnapshotId, { positions });
      }
      return;
    }
    if (selBoxRef.current && selBox) {
      const { x: bx, y: by, w: bw, h: bh } = selBox;
      if (bw > 5 || bh > 5) {
        const ids = new Set(nodesRef.current.filter(n => n.x >= bx && n.x <= bx + bw && n.y >= by && n.y <= by + bh).map(n => n.id));
        setMultiSelected(ids);
        setSelected(null);
      } else {
        setSelected(null);
        setEditingEdgeId(null);
      }
      selBoxRef.current = null;
      setSelBox(null);
      pauseRef.current = false;
      return;
    }
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.startClientX, dy = e.clientY - dragRef.current.startClientY;
      if (Math.sqrt(dx * dx + dy * dy) < 6) setDrawerCharId(dragRef.current.id);
      nodesRef.current = nodesRef.current.map(n => ({ ...n, vx: 0, vy: 0, fixed: true }));
      setNodes([...nodesRef.current]);
      if (activeSnapshotId) {
        const positions: Record<string, { x: number; y: number }> = {};
        nodesRef.current.forEach(n => { positions[n.id] = { x: n.x, y: n.y }; });
        snapshotsApi.update(projectId, activeSnapshotId, { positions });
      }
    }
    dragRef.current = null;
    pauseRef.current = false;
  };

  const onSvgClick = (e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as SVGElement).dataset.bg) {
      setSelected(null);
      setEditingEdgeId(null);
    }
  };

  const onSvgMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as SVGElement).dataset.bg === undefined && e.target !== svgRef.current) return;
    // start selection box or multi-drag
    const { x, y } = getSVGCoords(e);
    if (multiSelected.size > 0) {
      // check if click is near a selected node → start multi-drag
      const hit = nodesRef.current.find(n => multiSelected.has(n.id) && Math.hypot(n.x - x, n.y - y) < 32);
      if (hit) {
        const origPositions: Record<string, { x: number; y: number }> = {};
        nodesRef.current.forEach(n => { if (multiSelected.has(n.id)) origPositions[n.id] = { x: n.x, y: n.y }; });
        multiDragRef.current = { startX: x, startY: y, origPositions };
        pauseRef.current = true;
        return;
      }
    }
    // start rubber-band selection
    setMultiSelected(new Set());
    selBoxRef.current = { startX: x, startY: y };
    setSelBox({ x, y, w: 0, h: 0 });
    pauseRef.current = true;
  };

  const getSVGCoords = (e: React.MouseEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const vp = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return {
      x: (vp.x - zoom.tx) / zoom.scale,
      y: (vp.y - zoom.ty) / zoom.scale,
    };
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const vp = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    setZoom(prev => {
      const newScale = Math.max(0.3, Math.min(4, prev.scale * factor));
      const ratio = newScale / prev.scale;
      return {
        scale: newScale,
        tx: vp.x - ratio * (vp.x - prev.tx),
        ty: vp.y - ratio * (vp.y - prev.ty),
      };
    });
  };

  // 阻止 Ctrl+滚轮 触发浏览器页面缩放
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [nodes.length]);


  const save = async () => {
    setSaving(true);
    try {
      await relationshipsApi.batchSave(projectId, edges.map(e => ({ source_id: e.source_id, target_id: e.target_id, label: e.label })));
    } finally { setSaving(false); }
  };

  return (
    <>
    <div className="flex h-full">
      {confirmSnapshotDelete && (
        <ConfirmDialog
          message="确认删除此快照？"
          onConfirm={() => doDeleteSnapshot(confirmSnapshotDelete)}
          onCancel={() => setConfirmSnapshotDelete(null)}
        />
      )}
      {saveDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 flex flex-col gap-4">
            {saveDialog.overlapping.length > 0 ? (
              <>
                <p className="text-sm text-gray-700">检测到与当前章节重合的快照：{saveDialog.overlapping.map(s => `「${s.name}」`).join('、')}</p>
                <div className="flex flex-col gap-2">
                  <button className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm hover:bg-indigo-700"
                    onClick={() => {
                      const d = saveDialog; setSaveDialog(null);
                      const doSave = async (inherit: boolean) => {
                        const result = await applyAnalysis(d.json, d.baseRelations, inherit);
                        if (!result) return;
                        const rels = result.edges.map(e => ({ source_id: e.source_id, target_id: e.target_id, label: e.label }));
                        const charMap = Object.fromEntries(result.chars.map(c => [c.id, c]));
                        const name = getSnapshotName(d.chapterIds);
                        for (const s of d.overlapping) await snapshotsApi.update(projectId, s.id, { relations: rels, name, chapter_ids: d.chapterIds, characters: charMap });
                        d.overlapping.forEach(s => { snapshotRelsCache.current[s.id] = rels; snapshotCharCache.current[s.id] = charMap; });
                        setSnapshots(prev => prev.map(s => d.overlapping.find(o => o.id === s.id) ? { ...s, name, chapter_ids: d.chapterIds } : s));
                        setActiveSnapshotId(d.overlapping[0].id);
                      };
                      if (d.existingMatches.length > 0) setInheritDialog({ existingChars: d.existingMatches, proceed: async (inherit) => { setInheritDialog(null); await doSave(inherit); } });
                      else doSave(true);
                    }}>覆盖已有快照</button>
                  <button className="w-full border py-2 rounded-lg text-sm hover:bg-gray-50"
                    onClick={() => {
                      const d = saveDialog; setSaveDialog(null);
                      const doSave = async (inherit: boolean) => {
                        const result = await applyAnalysis(d.json, d.baseRelations, inherit);
                        if (!result) return;
                        const rels = result.edges.map(e => ({ source_id: e.source_id, target_id: e.target_id, label: e.label }));
                        const charMap = Object.fromEntries(result.chars.map(c => [c.id, c]));
                        const snap = await snapshotsApi.create(projectId, { name: getSnapshotName(d.chapterIds), chapter_ids: d.chapterIds, relations: rels, characters: charMap });
                        snapshotRelsCache.current[snap.id] = rels;
                        snapshotCharCache.current[snap.id] = charMap;
                        setSnapshots(prev => [snap, ...prev]); setActiveSnapshotId(snap.id);
                      };
                      if (d.existingMatches.length > 0) setInheritDialog({ existingChars: d.existingMatches, proceed: async (inherit) => { setInheritDialog(null); await doSave(inherit); } });
                      else doSave(true);
                    }}>保存为新快照</button>
                  <button className="text-gray-400 text-sm py-1 hover:text-gray-600"
                    onClick={() => {
                      const d = saveDialog; setSaveDialog(null);
                      if (d.existingMatches.length > 0) setInheritDialog({ existingChars: d.existingMatches, proceed: async (inherit) => { setInheritDialog(null); applyAnalysis(d.json, d.baseRelations, inherit); } });
                      else applyAnalysis(d.json, d.baseRelations, true);
                    }}>不保存</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-700">是否将分析结果保存为快照？</p>
                <div className="flex gap-2 justify-end">
                  <button className="px-4 py-1.5 text-sm rounded-lg text-gray-500 hover:bg-gray-100"
                    onClick={() => {
                      const d = saveDialog; setSaveDialog(null);
                      if (d.existingMatches.length > 0) setInheritDialog({ existingChars: d.existingMatches, proceed: async (inherit) => { setInheritDialog(null); applyAnalysis(d.json, d.baseRelations, inherit); } });
                      else applyAnalysis(d.json, d.baseRelations, true);
                    }}>不保存</button>
                  <button className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                    onClick={() => {
                      const d = saveDialog; setSaveDialog(null);
                      const doSave = async (inherit: boolean) => {
                        const result = await applyAnalysis(d.json, d.baseRelations, inherit);
                        if (!result) return;
                        const rels = result.edges.map(e => ({ source_id: e.source_id, target_id: e.target_id, label: e.label }));
                        const charMap = Object.fromEntries(result.chars.map(c => [c.id, c]));
                        const snap = await snapshotsApi.create(projectId, { name: getSnapshotName(d.chapterIds), chapter_ids: d.chapterIds, relations: rels, characters: charMap });
                        snapshotRelsCache.current[snap.id] = rels;
                        snapshotCharCache.current[snap.id] = charMap;
                        setSnapshots(prev => [snap, ...prev]); setActiveSnapshotId(snap.id);
                      };
                      if (d.existingMatches.length > 0) setInheritDialog({ existingChars: d.existingMatches, proceed: async (inherit) => { setInheritDialog(null); await doSave(inherit); } });
                      else doSave(true);
                    }}>保存</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Left: Snapshot Sidebar */}
      <div className="w-40 border-r bg-gray-50 flex flex-col flex-shrink-0">
        <div className="px-3 py-2 border-b text-xs font-semibold text-gray-600 bg-white">历史快照</div>
        <div className="flex-1 overflow-y-auto">
          {snapshots.length === 0 && <div className="text-xs text-gray-400 text-center py-6">暂无快照</div>}
          {snapshots.map(s => (
            <div key={s.id}
              className={`flex items-start gap-1 px-2 py-2 border-b cursor-pointer group hover:bg-indigo-50 ${activeSnapshotId === s.id && !minimized ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}
              onClick={() => { loadSnapshot(s); setMinimized(false); }}>
              <div className="flex-1 min-w-0">
                {editingSnapshotId === s.id ? (
                  <input
                    autoFocus
                    className="text-xs border rounded px-1 w-full"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={() => commitRename(s.id)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(s.id); if (e.key === 'Escape') setEditingSnapshotId(null); }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <div
                    className="text-xs font-medium text-gray-700 truncate"
                    onDoubleClick={e => { e.stopPropagation(); setEditingSnapshotId(s.id); setEditingName(s.name); }}>
                    {s.name}
                  </div>
                )}
                <div className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString()}</div>
              </div>
              <button className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs pt-0.5 flex-shrink-0"
                onClick={e => { e.stopPropagation(); deleteSnapshot(s.id); }}>✕</button>
            </div>
          ))}
        </div>
        <div className="p-2 border-t flex flex-col gap-1">
          {nodes.length > 0 && (
            <>
              <div className="flex items-center justify-between px-1 mb-0.5">
                <div className="text-xs text-gray-500 font-medium">人物</div>
                <button className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  onClick={() => { setNewCharName(''); setNewCharDialog(true); }}>+ 新建</button>
              </div>
              <div className="max-h-32 overflow-y-auto">
                {nodes.map(n => {
                  const c = characters.find(ch => ch.id === n.id);
                  return (
                    <div key={n.id} className="text-xs px-2 py-1 rounded cursor-pointer truncate text-gray-600 hover:bg-indigo-50 hover:text-indigo-600"
                      onClick={() => setDrawerCharId(n.id)}>
                      {c?.name || n.name}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <div className="text-xs text-gray-400 text-center pt-1 border-t">Ctrl+滚轮 缩放</div>
        </div>
      </div>

      {/* Right: main graph area */}
      <div className="flex flex-col flex-1 overflow-hidden p-4 gap-3">
        {/* Reanalyze dialog */}
        {reanalyzeDialog && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-80">
              <h3 className="font-semibold text-gray-800 mb-2">已有相同章节的快照</h3>
              <p className="text-sm text-gray-600 mb-4">所选章节已有对应快照，是否重新分析？</p>
              <div className="flex flex-col gap-2">
                <button onClick={async () => { setReanalyzeDialog(null); const result = await runAnalysis(reanalyzeDialog.chapterIds); if (result) await promptSaveSnapshot(result, reanalyzeDialog.chapterIds); }}
                  className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm hover:bg-indigo-700">
                  重新分析
                </button>
                <button onClick={() => setReanalyzeDialog(null)}
                  className="w-full text-gray-400 py-1 text-sm hover:text-gray-600">
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Merge dialog */}
        {mergeDialog && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 w-80">
              <h3 className="font-semibold text-gray-800 mb-2">检测到已有相关快照</h3>
              <p className="text-sm text-gray-600 mb-4">
                已有快照「{mergeDialog.baseSnapshot.name}」包含部分所选章节。
                有 <span className="font-medium text-indigo-600">{mergeDialog.newChapterIds.length}</span> 个新章节未被覆盖。
              </p>
              <div className="flex flex-col gap-2">
                <button onClick={() => handleMergeChoice('incremental')}
                  className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm hover:bg-indigo-700">
                  增量合并（只分析新章节，节省 token）
                </button>
                <button onClick={() => handleMergeChoice('full')}
                  className="w-full border py-2 rounded-lg text-sm hover:bg-gray-50">
                  重新整体分析
                </button>
                <button onClick={() => setMergeDialog(null)}
                  className="w-full text-gray-400 py-1 text-sm hover:text-gray-600">
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chapter selector */}
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1">
            <button
              onClick={() => setChapterPanelOpen(o => !o)}
              className="w-full flex items-center justify-between border rounded-lg px-3 py-1.5 bg-white text-sm hover:bg-gray-50 text-left"
            >
              <span className="text-gray-600">
                {selectedChapters.length === 0 ? '选择章节（可多选）' : `已选 ${selectedChapters.length} / ${chapters.length} 章`}
              </span>
              <span className="text-gray-400 text-xs ml-2">{chapterPanelOpen ? '▲' : '▼'}</span>
            </button>
            {chapterPanelOpen && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 border rounded-lg bg-white shadow-lg max-h-56 overflow-y-auto">
                <div className="flex items-center justify-between px-3 py-1.5 border-b bg-gray-50 sticky top-0">
                  <span className="text-xs text-gray-500">共 {chapters.length} 章</span>
                  <div className="flex gap-2">
                    <button className="text-xs text-indigo-500 hover:underline" onClick={() => setSelectedChapters(chapters.map(c => c.id))}>全选</button>
                    <button className="text-xs text-gray-400 hover:underline" onClick={() => setSelectedChapters([])}>清空</button>
                  </div>
                </div>
                {chapters.map((c, i) => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-indigo-50">
                    <input type="checkbox" checked={selectedChapters.includes(c.id)}
                      onChange={e => setSelectedChapters(prev => e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id))} />
                    <span className="text-gray-400 text-xs w-10 shrink-0">第{i+1}章</span>
                    <span className="truncate">{c.title}</span>
                    <span className="text-gray-400 text-xs shrink-0 ml-auto">{c.word_count}字</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button onClick={analyze} disabled={analyzing || !selectedChapters.length}
            className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap">
            {analyzing ? '分析中...' : '分析关系'}
          </button>
          <button onClick={generateFromList} disabled={!characters.length}
            className="text-sm bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 whitespace-nowrap">
            从主要人物列表生成
          </button>
        </div>

        {/* Progress bar */}
        {analyzing && (
          <div className="flex flex-col gap-1">
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="h-2 rounded-full bg-indigo-500 animate-[indeterminate_1.5s_ease-in-out_infinite]"
                style={{ width: '40%', animation: 'indeterminate 1.5s ease-in-out infinite' }} />
            </div>
            <p className="text-xs text-gray-400">AI 正在解析人物关系，内容越多耗时越长，您可以先切换到其他页面，稍后回来查看结果。</p>
          </div>
        )}

        {/* Add relation modal */}

        {/* SVG Graph */}
        <div className={`rounded-xl overflow-hidden bg-slate-50 border border-slate-200 relative flex-1 ${minimized ? 'hidden' : ''}`}>
          {/* toolbar */}
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            {selected && (
              <button onClick={deleteSelected}
                className="text-xs bg-white hover:bg-red-50 text-red-400 border border-red-200 rounded px-2 py-0.5 shadow-sm">删除</button>
            )}
            <button onClick={() => fitView(nodesRef.current)}
              className="text-xs bg-white hover:bg-gray-50 text-gray-500 border border-gray-200 rounded px-2 py-0.5 shadow-sm"
              title="适应视图">⊙</button>
            <button onClick={() => setMinimized(true)}
              className="text-xs bg-white hover:bg-gray-50 text-gray-500 border border-gray-200 rounded px-2 py-0.5 shadow-sm"
              title="最小化">─</button>
          </div>
          {/* hint */}
          {nodes.length > 0 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 text-xs text-slate-400 pointer-events-none select-none">
              拖动节点边缘连线 · 双击编辑 · Delete 删除
            </div>
          )}
          {nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">选择章节后点击"分析关系"生成关系图，或点击左侧快照加载历史版本</div>
          ) : (
            <svg ref={svgRef} width="100%" height="100%" viewBox="0 0 500 400"
              onMouseDown={onSvgMouseDown}
              onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
              onWheel={onWheel} onClick={onSvgClick}
              style={{ cursor: wireRef.current ? 'crosshair' : selBox ? 'crosshair' : 'default', display: 'block' }}>
              <defs>
                <pattern id="grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="0.8" fill="#cbd5e1" />
                </pattern>
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="#94a3b8" />
                </marker>
                <marker id="arrow-sel" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="#6366f1" />
                </marker>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                {nodes.map(n => (
                  <clipPath key={`clip-${n.id}`} id={`clip-${n.id}`}>
                    <circle cx={n.x} cy={n.y} r="22" />
                  </clipPath>
                ))}
              </defs>
              <rect width="500" height="400" fill="#f8fafc" data-bg="1" />
              <g transform={`translate(${zoom.tx},${zoom.ty}) scale(${zoom.scale})`}>
                <rect x="-2000" y="-2000" width="4500" height="4400" fill="url(#grid)" data-bg="1" />
              {edges.map(e => {
                const s = nodes.find(n => n.id === e.source_id);
                const t = nodes.find(n => n.id === e.target_id);
                if (!s || !t) return null;
                const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
                const isSel = selected?.type === 'edge' && selected.id === e.id;
                return (
                  <g key={e.id} onClick={ev => { ev.stopPropagation(); setSelected({ type: 'edge', id: e.id }); setEditingEdgeId(null); }}>
                    {/* wide invisible hit area */}
                    <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="transparent" strokeWidth="12" className="cursor-pointer" />
                    <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                      stroke={isSel ? '#6366f1' : '#94a3b8'} strokeWidth={isSel ? 2 : 1.5}
                      markerEnd={isSel ? 'url(#arrow-sel)' : 'url(#arrow)'} className="pointer-events-none" />
                    {editingEdgeId === e.id ? (
                      <foreignObject x={mx - 40} y={my - 11} width="80" height="22">
                        <input
                          // @ts-ignore
                          xmlns="http://www.w3.org/1999/xhtml"
                          autoFocus
                          className="w-full text-center text-xs border border-indigo-400 rounded px-1 outline-none bg-white"
                          value={editingEdgeLabel}
                          onChange={ev => setEditingEdgeLabel(ev.target.value)}
                          onBlur={() => {
                            setEdges(prev => prev.map(ed => ed.id === e.id ? { ...ed, label: editingEdgeLabel } : ed));
                            setEditingEdgeId(null);
                          }}
                          onKeyDown={ev => {
                            if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
                            if (ev.key === 'Escape') { setEditingEdgeId(null); }
                            ev.stopPropagation();
                          }}
                        />
                      </foreignObject>
                    ) : (
                      <g onDoubleClick={ev => { ev.stopPropagation(); setEditingEdgeId(e.id); setEditingEdgeLabel(e.label || ''); }} className="cursor-text">
                        {e.label ? (
                          <>
                            <rect x={mx - e.label.length * 3.2} y={my - 9} width={e.label.length * 6.4} height={13} fill="white" stroke={isSel ? '#6366f1' : '#e2e8f0'} strokeWidth="0.5" rx="3" />
                            <text x={mx} y={my + 1} textAnchor="middle" fontSize="9" fill={isSel ? '#6366f1' : '#64748b'}>{e.label}</text>
                          </>
                        ) : isSel ? (
                          <>
                            <rect x={mx - 16} y={my - 9} width="32" height="13" fill="white" stroke="#6366f1" strokeWidth="0.5" strokeDasharray="3,2" rx="3" />
                            <text x={mx} y={my + 1} textAnchor="middle" fontSize="9" fill="#a5b4fc">双击添加</text>
                          </>
                        ) : null}
                      </g>
                    )}
                  </g>
                );
              })}
              {nodes.map(n => {
                const isSel = selected?.type === 'node' && selected.id === n.id;
                const isMultiSel = multiSelected.has(n.id);
                const ports = [{ dx: 0, dy: -24 }, { dx: 0, dy: 24 }, { dx: 24, dy: 0 }, { dx: -24, dy: 0 }];
                const char = charMap[n.id];
                return (
                  <g key={n.id}>
                    <circle cx={n.x} cy={n.y} r="22" fill="white" filter="url(#glow)"
                      stroke={isSel ? '#6366f1' : isMultiSel ? '#f59e0b' : '#a5b4fc'} strokeWidth={isSel || isMultiSel ? 2.5 : 1.5}
                      onMouseDown={e => onMouseDown(e, n.id)} className="cursor-grab" />
                    {char?.avatar ? (
                      <image href={char.avatar} x={n.x - 22} y={n.y - 22} width="44" height="44"
                        clipPath={`url(#clip-${n.id})`} preserveAspectRatio="xMidYMin slice" className="pointer-events-none" />
                    ) : (
                      <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize="14" fill="#6366f1" fontWeight="700"
                        className="pointer-events-none select-none">{n.name.charAt(0)}</text>
                    )}
                    {editingNodeId === n.id ? (
                      <foreignObject x={n.x - 30} y={n.y + 24} width="60" height="20">
                        <input
                          // @ts-ignore
                          xmlns="http://www.w3.org/1999/xhtml"
                          autoFocus
                          className="w-full text-center text-xs border border-indigo-400 rounded px-1 outline-none bg-white"
                          value={editingNodeName}
                          onChange={ev => setEditingNodeName(ev.target.value)}
                          onBlur={() => {
                            const name = editingNodeName.trim();
                            if (name) {
                              nodesRef.current = nodesRef.current.map(nd => nd.id === n.id ? { ...nd, name } : nd);
                              setNodes([...nodesRef.current]);
                            }
                            setEditingNodeId(null);
                          }}
                          onKeyDown={ev => {
                            if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
                            if (ev.key === 'Escape') setEditingNodeId(null);
                            ev.stopPropagation();
                          }}
                        />
                      </foreignObject>
                    ) : (
                      <text x={n.x} y={n.y + 34} textAnchor="middle" fontSize="10" fill="#64748b" fontWeight="500"
                        className="pointer-events-none select-none">{n.name}</text>
                    )}
                    {isSel && ports.map((p, i) => (
                      <circle key={i} cx={n.x + p.dx} cy={n.y + p.dy} r="5"
                        fill="white" stroke="#6366f1" strokeWidth="1.5"
                        className="cursor-crosshair"
                        onMouseDown={e => onPortMouseDown(e, n.id)} />
                    ))}
                    <circle cx={n.x} cy={n.y} r="22" fill="transparent"
                      onMouseDown={e => onMouseDown(e, n.id)}
                      onDoubleClick={e => { e.stopPropagation(); setEditingNodeId(n.id); setEditingNodeName(n.name); }} />
                  </g>
                );
              })}
              {/* wire preview while dragging from a port */}
              {wireTip && wireRef.current && (() => {
                const from = nodes.find(n => n.id === wireRef.current!.fromId);
                if (!from) return null;
                return <line x1={from.x} y1={from.y} x2={wireTip.x} y2={wireTip.y}
                  stroke="#6366f1" strokeWidth="1.5" strokeDasharray="5,3" markerEnd="url(#arrow-sel)"
                  className="pointer-events-none" />;
              })()}
              {/* rubber-band selection box */}
              {selBox && (
                <rect x={selBox.x} y={selBox.y} width={selBox.w} height={selBox.h}
                  fill="rgba(99,102,241,0.08)" stroke="#6366f1" strokeWidth="1" strokeDasharray="4,2"
                  className="pointer-events-none" />
              )}
              </g>
            </svg>
          )}
        </div>
      </div>
    </div>
    {drawerCharId && (
      <CharacterDrawer
        projectId={projectId}
        charId={drawerCharId}
        characters={Object.values({ ...Object.fromEntries(characters.map(c => [c.id, c])), ...graphCharMap })}
        projectGenre={projectGenre}
        initialDraft={draftForms?.[drawerCharId]}
        onFormChange={(form, pendingAvatar, genLoading) => setDraftForms(prev => ({ ...prev, [drawerCharId]: { form, pendingAvatar, genLoading } }))}
        onClose={() => setDrawerCharId(null)}
        graphOnly={true}
        onSaved={c => {
          onCharacterUpdated?.(c);
          const oldChar = charMap[c.id]; // save old value before update
          if (activeSnapshotId) {
            snapshotCharCache.current[activeSnapshotId] = { ...(snapshotCharCache.current[activeSnapshotId] || {}), [c.id]: c };
          }
          setGraphCharMap(prev => ({ ...prev, [c.id]: c }));
          setDraftForms(prev => { const n = { ...prev }; delete n[c.id]; return n; });
          const others = snapshots.filter(s => s.id !== activeSnapshotId && (snapshotRelsCache.current[s.id] || []).some((r: any) => r.source_id === c.id || r.target_id === c.id));
          if (others.length > 0) setSyncCharDialog({ char: c, oldChar: oldChar || c, otherSnapshots: others });
        }}
      />
    )}
    {newCharDialog && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl p-6 w-72">
          <h3 className="font-semibold text-gray-800 mb-3">新建角色</h3>
          <input autoFocus className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="角色名称" value={newCharName} onChange={e => setNewCharName(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter' && newCharName.trim()) {
                const c = await charactersApi.create(projectId, { name: newCharName.trim() });
                onCharacterCreated?.(c); addCharacterNode(c.id); setNewCharDialog(false);
              }
            }} />
          <div className="flex gap-2 justify-end">
            <button className="px-4 py-1.5 text-sm rounded-lg text-gray-500 hover:bg-gray-100" onClick={() => setNewCharDialog(false)}>取消</button>
            <button className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              disabled={!newCharName.trim()}
              onClick={async () => {
                const c = await charactersApi.create(projectId, { name: newCharName.trim() });
                onCharacterCreated?.(c); addCharacterNode(c.id); setNewCharDialog(false);
              }}>创建</button>
          </div>
        </div>
      </div>
    )}

    {inheritDialog && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl p-6 w-80">
          <h3 className="font-semibold text-gray-800 mb-2">检测到已有角色</h3>
          <p className="text-sm text-gray-600 mb-2">以下角色在角色库中已存在：</p>
          <div className="text-sm text-indigo-700 font-medium mb-4 flex flex-wrap gap-1">
            {inheritDialog.existingChars.map(c => (
              <span key={c.id} className="bg-indigo-50 px-2 py-0.5 rounded-full">{c.name}</span>
            ))}
          </div>
          <p className="text-sm text-gray-600 mb-4">是否继承已有角色的头像和详细信息？</p>
          <div className="flex flex-col gap-2">
            <button className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm hover:bg-indigo-700"
              onClick={() => inheritDialog.proceed(true)}>继承已有信息</button>
            <button className="w-full border py-2 rounded-lg text-sm hover:bg-gray-50"
              onClick={() => inheritDialog.proceed(false)}>全新创建（不继承）</button>
          </div>
        </div>
      </div>
    )}
    {syncCharDialog && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl p-6 w-80">
          <h3 className="font-semibold text-gray-800 mb-2">同步角色信息</h3>
          <p className="text-sm text-gray-600 mb-4">「{syncCharDialog.char.name}」还出现在以下快照中：{syncCharDialog.otherSnapshots.map(s => `「${s.name}」`).join('、')}，是否同步更新？</p>
          <div className="flex gap-2 justify-end">
            <button className="px-4 py-1.5 text-sm rounded-lg border hover:bg-gray-50"
              onClick={() => {
                syncCharDialog.otherSnapshots.forEach(s => {
                  snapshotCharCache.current[s.id] = { ...(snapshotCharCache.current[s.id] || {}), [syncCharDialog.oldChar.id]: syncCharDialog.oldChar };
                });
                setSyncCharDialog(null);
              }}>不同步</button>
            <button className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => {
                syncCharDialog.otherSnapshots.forEach(s => {
                  snapshotCharCache.current[s.id] = { ...(snapshotCharCache.current[s.id] || {}), [syncCharDialog.char.id]: syncCharDialog.char };
                });
                setSyncCharDialog(null);
              }}>同步更新</button>
          </div>
        </div>
      </div>
    )}
    {listGenDialog && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl p-6 w-80">
          <h3 className="font-semibold text-gray-800 mb-2">已存在同名快照</h3>
          <p className="text-sm text-gray-600 mb-4">已存在「主要人物列表」快照，是否覆盖？</p>
          <div className="flex flex-col gap-2">
            <button className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm hover:bg-indigo-700"
              onClick={() => { const d = listGenDialog; setListGenDialog(null); doGenerateFromList(d.existingId, '主要人物列表'); }}>覆盖已有快照</button>
            <button className="w-full border py-2 rounded-lg text-sm hover:bg-gray-50"
              onClick={() => {
                const d = listGenDialog; setListGenDialog(null);
                const existingNames = new Set(snapshots.map(s => s.name));
                let name = '主要人物列表';
                let i = 1;
                while (existingNames.has(name)) { name = `主要人物列表(${i++})`; }
                doGenerateFromList(null, name);
              }}>保存为新快照</button>
            <button className="text-gray-400 text-sm py-1 hover:text-gray-600"
              onClick={() => setListGenDialog(null)}>取消</button>
          </div>
        </div>
      </div>
    )}

    </>
  );
}

// ---- Character Drawer ----
function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = url;
  });
}

function CharacterDrawer({ projectId, charId, characters, onClose, onSaved, projectGenre, initialDraft, onFormChange, graphOnly }: {
  projectId: string; charId: string; characters: Character[]; projectGenre?: string;
  initialDraft?: { form: Partial<Character>; pendingAvatar: string | null; genLoading?: boolean };
  onFormChange?: (form: Partial<Character>, pendingAvatar: string | null, genLoading?: boolean) => void;
  onClose: () => void; onSaved: (c: Character) => void; graphOnly?: boolean;
}) {
  const orig = characters.find(c => c.id === charId)!;
  const defaultForm = { ...orig, novel_category: orig.novel_category || projectGenre || '', ethnicity: orig.ethnicity || '人族' };
  const [form, setFormRaw] = useState<Partial<Character>>(initialDraft?.form ?? defaultForm);
  const [saving, setSaving] = useState(false);
  const [genLoading, setGenLoadingRaw] = useState(initialDraft?.genLoading ?? false);
  const setGenLoading = (v: boolean) => { setGenLoadingRaw(v); onFormChange?.(formRef.current, pendingAvatarRef.current, v); };
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatarRaw] = useState<string | null>(initialDraft?.pendingAvatar ?? null);
  const pendingAvatarRef = useRef<string | null>(initialDraft?.pendingAvatar ?? null);
  const formRef = useRef<Partial<Character>>(initialDraft?.form ?? defaultForm);

  const setForm = (updater: Partial<Character> | ((prev: Partial<Character>) => Partial<Character>)) => {
    setFormRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      formRef.current = next;
      onFormChange?.(next, pendingAvatarRef.current);
      return next;
    });
  };

  const setPendingAvatar = (url: string | null) => {
    pendingAvatarRef.current = url;
    setPendingAvatarRaw(url);
    onFormChange?.(formRef.current, url);
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await resizeImage(file, 200);
    setForm(prev => ({ ...prev, avatar: base64 }));
  };

  const generateAvatar = async () => {
    setGenLoading(true);
    try {
      const url = await aiApi.generateAvatar({
        name: form.name, role: form.role, appearance: form.appearance, personality: form.personality,
        age_group: form.age_group, ethnicity: form.ethnicity, gender: form.gender, novel_category: form.novel_category,
      });
      setPendingAvatar(url);
    } finally { setGenLoading(false); }
  };

  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (graphOnly) {
        onSaved({ ...orig, ...form } as Character);
      } else {
        const updated = await charactersApi.update(projectId, charId, form);
        onSaved(updated);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const SELECT_OPTIONS: Partial<Record<keyof Character, string[]>> = {
    gender: ['男', '女', '雄性', '雌性'],
    age_group: ['5岁以下', '5-10岁', '10-15岁', '15-18岁', '18-22岁', '22-25岁', '25-30岁', '30-35岁', '35-40岁', '40-50岁', '50-60岁', '60-70岁', '70-80岁', '80岁以上'],
    ethnicity: ['人族', '妖族', '魔族', '神族', '龙族', '精灵族', '兽族', '鬼族', '仙族', '异族', '自定义'],
    novel_category: ['玄幻', '仙侠', '武侠', '都市', '科幻', '历史', '游戏', '悬疑', '言情', '末世', '自定义'],
  };
  const [customEthnicity, setCustomEthnicity] = useState('');
  const [customCategory, setCustomCategory] = useState('');

  const selectVal = (key: keyof Character) => {
    const val = (form as any)[key] || '';
    if (!SELECT_OPTIONS[key]) return val;
    if (SELECT_OPTIONS[key]!.slice(0, -1).includes(val)) return val;
    if (val) return '自定义';
    return '';
  };

  const handleSelect = (key: keyof Character, val: string) => {
    if (val !== '自定义') {
      setForm(prev => ({ ...prev, [key]: val }));
      if (key === 'ethnicity') setCustomEthnicity('');
      if (key === 'novel_category') setCustomCategory('');
    } else {
      setForm(prev => ({ ...prev, [key]: '' }));
    }
  };


  return (
    <>
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-2xl flex flex-col"
        style={{background: 'linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%)'}}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full bg-gradient-to-b from-indigo-500 to-purple-500" />
            <span className="font-semibold text-gray-800 text-sm tracking-wide">角色详情</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Avatar row */}
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center shadow-md">
                {form.avatar
                  ? <img src={form.avatar} className="w-full h-full object-cover cursor-zoom-in" alt="" onClick={() => setPreviewAvatar(form.avatar!)} />
                  : <span className="text-2xl font-bold text-indigo-400">{form.name?.charAt(0) || '?'}</span>}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 cursor-pointer px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors w-fit">
                <span>📁</span> 上传头像
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
              </label>
              <button onClick={generateAvatar} disabled={genLoading}
                className="flex items-center gap-1.5 text-xs font-medium text-purple-600 px-3 py-1.5 rounded-lg border border-purple-200 hover:bg-purple-50 transition-colors disabled:opacity-40 w-fit">
                <span>{genLoading ? '⏳' : '✨'}</span> {genLoading ? '生成中...' : 'AI生成头像'}
              </button>
              <p className="text-xs text-gray-400">角色信息越全面，生成质量越高；<br/>修改信息后请先保存，再生成头像</p>
            </div>
          </div>

          {/* Fields grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* 姓名 full width */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">姓名</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                value={form.name || ''} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            {/* 角色定位 full width */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">角色定位</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                value={form.role || ''} onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))} />
            </div>
            {/* 性别 */}
            {(['gender', 'age_group'] as const).map(key => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{key === 'gender' ? '性别' : '外在年龄段'}<span className="text-gray-400 font-normal ml-1">{key === 'age_group' ? '（用于AI生成头像）' : ''}</span></label>
                <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                  value={(form as any)[key] || ''}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}>
                  <option value="">请选择</option>
                  {SELECT_OPTIONS[key]!.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
            {/* 种族 with custom */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">种族</label>
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                value={selectVal('ethnicity')}
                onChange={e => handleSelect('ethnicity', e.target.value)}>
                <option value="">请选择</option>
                {SELECT_OPTIONS.ethnicity!.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {selectVal('ethnicity') === '自定义' && (
                <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                  placeholder="输入种族" value={customEthnicity}
                  onChange={e => { setCustomEthnicity(e.target.value); setForm(prev => ({ ...prev, ethnicity: e.target.value })); }} />
              )}
            </div>
            {/* 小说类别 with custom */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">小说类别<span className="text-gray-400 font-normal ml-1">（用于AI生成头像）</span></label>
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                value={selectVal('novel_category')}
                onChange={e => handleSelect('novel_category', e.target.value)}>
                <option value="">请选择</option>
                {SELECT_OPTIONS.novel_category!.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {selectVal('novel_category') === '自定义' && (
                <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                  placeholder="输入类别" value={customCategory}
                  onChange={e => { setCustomCategory(e.target.value); setForm(prev => ({ ...prev, novel_category: e.target.value })); }} />
              )}
            </div>
            {/* 外貌 full width, larger */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">外貌描述</label>
              <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                value={form.appearance || ''} onChange={e => setForm(prev => ({ ...prev, appearance: e.target.value }))} />
            </div>
            {/* 性格 full width */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">性格</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                value={form.personality || ''} onChange={e => setForm(prev => ({ ...prev, personality: e.target.value }))} />
            </div>
            {/* 简介+背景故事 merged */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">简介 / 背景故事</label>
              <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm h-16 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                value={form.description || ''} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={save} disabled={saving}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50"
            style={{background: saved ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)'}}>
            {saving ? '保存中...' : saved ? '已保存 ✓' : '保存'}
          </button>
        </div>
      </div>
    </div>
    {(previewAvatar || pendingAvatar) && (
      <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center gap-4" onClick={() => { setPreviewAvatar(null); setPendingAvatar(null); }}>
        <img src={previewAvatar || pendingAvatar!} className="max-w-[80vw] max-h-[70vh] rounded-lg" alt="" onClick={e => e.stopPropagation()} />
        {pendingAvatar && (
          <div className="flex gap-3" onClick={e => e.stopPropagation()}>
            <button className="px-5 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
              onClick={() => setPendingAvatar(null)}>不使用</button>
            <button className="px-5 py-2 rounded-xl text-sm font-medium text-white transition-colors"
              style={{background: 'linear-gradient(135deg, #6366f1, #8b5cf6)'}}
              onClick={() => { setForm(prev => ({ ...prev, avatar: pendingAvatar! })); setPendingAvatar(null); }}>
              用作头像
            </button>
          </div>
        )}
      </div>
    )}
    </>
  );
}

const fields: { key: keyof Character; label: string; multi?: boolean }[] = [
  { key: 'name', label: '姓名' }, { key: 'role', label: '角色定位' },
  { key: 'appearance', label: '外貌' }, { key: 'personality', label: '性格' },
  { key: 'description', label: '简介' }, { key: 'background', label: '背景故事', multi: true },
  { key: 'relations', label: '与其他人物关系', multi: true },
];

export default function Characters({ projectId, projectGenre, chapters }: Props) {
  const [tab, setTab] = useState<'list' | 'graph'>('list');
  const [list, setList] = useState<Character[]>([]);
  const [editing, setEditing] = useState<Partial<Character> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [customEthnicity, setCustomEthnicity] = useState('');
  const [customCategory, setCustomCategory] = useState('');

  const SELECT_OPTIONS: Partial<Record<keyof Character, string[]>> = {
    gender: ['男', '女', '雄性', '雌性'],
    age_group: ['5岁以下', '5-10岁', '10-15岁', '15-18岁', '18-22岁', '22-25岁', '25-30岁', '30-35岁', '35-40岁', '40-50岁', '50-60岁', '60-70岁', '70-80岁', '80岁以上'],
    ethnicity: ['人族', '妖族', '魔族', '神族', '龙族', '精灵族', '兽族', '鬼族', '仙族', '异族', '自定义'],
    novel_category: ['玄幻', '仙侠', '武侠', '都市', '科幻', '历史', '游戏', '悬疑', '言情', '末世', '自定义'],
  };

  useEffect(() => { charactersApi.list(projectId).then(setList); }, [projectId]);

  const selectEditing = (c: Partial<Character> | null, newChar = false) => {
    setEditing(c ? { ...c, novel_category: (c as any).novel_category || projectGenre || '', ethnicity: (c as any).ethnicity || '人族' } : null);
    setIsNew(newChar);
    setPendingAvatar(null);
    setCustomEthnicity('');
    setCustomCategory('');
  };

  const save = async () => {
    if (!editing?.name?.trim()) return;
    setSaving(true);
    try {
      if (isNew) {
        const c = await charactersApi.create(projectId, { ...editing, is_main: 1 });
        setList(prev => [...prev, c]);
        setEditing(c);
        setIsNew(false);
      } else {
        const c = await charactersApi.update(projectId, editing.id!, editing);
        setList(prev => prev.map(x => x.id === c.id ? c : x));
        setEditing(c);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const [confirmCharDelete, setConfirmCharDelete] = useState<string | null>(null);
  const remove = (id: string) => setConfirmCharDelete(id);
  const doRemove = async (id: string) => {
    setConfirmCharDelete(null);
    await charactersApi.remove(projectId, id);
    setList(prev => prev.filter(c => c.id !== id));
    if (editing?.id === id) setEditing(null);
  };

  const generate = async () => {
    const desc = editing?.description || editing?.name;
    if (!desc) return;
    setGenerating(true);
    try {
      const baseURL = process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api';
      const token = localStorage.getItem('token');
      const resp = await fetch(`${baseURL}/ai/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'character', text: desc }),
      });
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '', result = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop()!;
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          const parsed = JSON.parse(data);
          if (parsed.text) { result += parsed.text; setEditing(prev => ({ ...prev, background: result })); }
        }
      }
    } finally { setGenerating(false); }
  };

  const generateAvatar = async () => {
    if (!editing) return;
    setGenLoading(true);
    try {
      const url = await aiApi.generateAvatar({
        name: editing.name, role: editing.role, appearance: editing.appearance, personality: editing.personality,
        age_group: editing.age_group, ethnicity: editing.ethnicity, gender: editing.gender, novel_category: editing.novel_category,
      });
      setPendingAvatar(url);
    } finally { setGenLoading(false); }
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await resizeImage(file, 200);
    setEditing(prev => ({ ...prev, avatar: base64 }));
  };

  const selectVal = (key: keyof Character) => {
    const val = (editing as any)?.[key] || '';
    if (!SELECT_OPTIONS[key]) return val;
    if (SELECT_OPTIONS[key]!.slice(0, -1).includes(val)) return val;
    if (val) return '自定义';
    return '';
  };

  const handleSelect = (key: keyof Character, val: string) => {
    if (val !== '自定义') {
      setEditing(prev => ({ ...prev, [key]: val }));
      if (key === 'ethnicity') setCustomEthnicity('');
      if (key === 'novel_category') setCustomCategory('');
    } else {
      setEditing(prev => ({ ...prev, [key]: '' }));
    }
  };

  return (
    <div className="flex flex-col h-full">
      {confirmCharDelete && (
        <ConfirmDialog
          message="确认删除此人物？删除后无法恢复。"
          onConfirm={() => doRemove(confirmCharDelete)}
          onCancel={() => setConfirmCharDelete(null)}
        />
      )}
      {/* Tabs */}
      <div className="flex border-b px-4 pt-2 gap-4">
        {(['list', 'graph'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'list' ? '主要人物列表' : '关系图'}
          </button>
        ))}
      </div>

      <div className={`flex flex-1 overflow-hidden ${tab !== 'list' ? 'hidden' : ''}`}>
        {/* Left sidebar */}
        <div className="w-52 border-r bg-gray-50 flex flex-col flex-shrink-0">
          <div className="p-3 border-b flex justify-between items-center bg-white">
            <span className="font-semibold text-gray-700 text-sm">人物列表</span>
            <button onClick={() => selectEditing(EMPTY, true)}
              className="text-xs px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">+ 新增</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.map(c => (
              <div key={c.id} onClick={() => selectEditing(c)}
                className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b group relative transition-colors ${editing?.id === c.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : 'hover:bg-gray-100'}`}>
                <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
                  {c.avatar ? <img src={c.avatar} className="w-full h-full object-cover" alt="" /> : <span className="text-xs font-bold text-indigo-400">{c.name?.charAt(0)}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-800 truncate">{c.name}</div>
                  {c.role && <div className="text-xs text-gray-400 truncate">{c.role}</div>}
                </div>
                <button onClick={e => { e.stopPropagation(); remove(c.id); }}
                  className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs flex-shrink-0">✕</button>
              </div>
            ))}
            {list.length === 0 && <div className="text-xs text-gray-400 text-center py-8">暂无人物</div>}
          </div>
        </div>

        {/* Main edit area */}
        <div className="flex-1 overflow-y-auto bg-white">
          {!editing ? (
            <div className="flex items-center justify-center h-full text-gray-300">
              <div className="text-center">
                <div className="text-6xl mb-4">👤</div>
                <div className="text-sm">选择人物查看详情，或点击「+ 新增」创建</div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col px-6 py-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h2 className="text-base font-semibold text-gray-800">{isNew ? '新建人物' : '编辑人物'}</h2>
                <div className="flex gap-2">
                  <button onClick={generate} disabled={generating}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    {generating ? 'AI生成中...' : '✨ AI生成设定'}
                  </button>
                  <button onClick={save} disabled={saving}
                    className="text-xs px-4 py-1.5 rounded-lg text-white font-medium transition-all disabled:opacity-50"
                    style={{background: saved ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>
                    {saving ? '保存中...' : saved ? '已保存 ✓' : '保存'}
                  </button>
                  <button onClick={() => setEditing(null)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">取消</button>
                </div>
              </div>

              {/* Two-column layout */}
              <div className="flex gap-5 flex-1 min-h-0">
                {/* Left: avatar + basic + selectors */}
                <div className="w-64 flex-shrink-0 flex flex-col gap-2 overflow-y-auto">
                  {/* Avatar */}
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-br from-indigo-50/60 to-purple-50/60 border border-indigo-100">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center shadow-md cursor-pointer flex-shrink-0"
                      onClick={() => editing.avatar && setPreviewAvatar(editing.avatar)}>
                      {editing.avatar ? <img src={editing.avatar} className="w-full h-full object-cover" alt="" /> : <span className="text-2xl font-bold text-indigo-300">{editing.name?.charAt(0) || '?'}</span>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-indigo-600 cursor-pointer px-2 py-1 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors text-center">
                        📁 上传<input type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
                      </label>
                      <button onClick={generateAvatar} disabled={genLoading} className="text-xs text-purple-600 px-2 py-1 rounded-lg border border-purple-200 hover:bg-purple-50 transition-colors disabled:opacity-40">
                        {genLoading ? '⏳' : '✨'} AI头像
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">姓名</label>
                    <input className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                      value={editing.name || ''} onChange={e => setEditing(prev => ({ ...prev, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">角色定位</label>
                    <input className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                      value={editing.role || ''} onChange={e => setEditing(prev => ({ ...prev, role: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">性别</label>
                      <select className="w-full border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                        value={(editing as any).gender || ''} onChange={e => setEditing(prev => ({ ...prev, gender: e.target.value }))}>
                        <option value="">请选择</option>
                        {SELECT_OPTIONS.gender!.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">种族</label>
                      <select className="w-full border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                        value={selectVal('ethnicity')} onChange={e => handleSelect('ethnicity', e.target.value)}>
                        <option value="">请选择</option>
                        {SELECT_OPTIONS.ethnicity!.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      {selectVal('ethnicity') === '自定义' && (
                        <input className="w-full border border-gray-200 rounded-xl px-2 py-1 text-xs mt-1 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                          placeholder="输入种族" value={customEthnicity}
                          onChange={e => { setCustomEthnicity(e.target.value); setEditing(prev => ({ ...prev, ethnicity: e.target.value })); }} />
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">外在年龄段 <span className="text-gray-400 font-normal">（用于AI生成头像）</span></label>
                      <select className="w-full border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                        value={(editing as any).age_group || ''} onChange={e => setEditing(prev => ({ ...prev, age_group: e.target.value }))}>
                        <option value="">请选择</option>
                        {SELECT_OPTIONS.age_group!.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">小说类别 <span className="text-gray-400 font-normal">（用于AI生成头像）</span></label>
                      <select className="w-full border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                        value={selectVal('novel_category')} onChange={e => handleSelect('novel_category', e.target.value)}>
                        <option value="">请选择</option>
                        {SELECT_OPTIONS.novel_category!.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      {selectVal('novel_category') === '自定义' && (
                        <input className="w-full border border-gray-200 rounded-xl px-2 py-1 text-xs mt-1 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                          placeholder="输入类别" value={customCategory}
                          onChange={e => { setCustomCategory(e.target.value); setEditing(prev => ({ ...prev, novel_category: e.target.value })); }} />
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: text fields */}
                <div className="flex-1 flex flex-col gap-3 overflow-y-auto px-1">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">外貌描述</label>
                    <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" style={{height: '80px'}}
                      value={editing.appearance || ''} onChange={e => setEditing(prev => ({ ...prev, appearance: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">性格</label>
                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                      value={editing.personality || ''} onChange={e => setEditing(prev => ({ ...prev, personality: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">简介</label>
                    <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" style={{height: '72px'}}
                      value={editing.description || ''} onChange={e => setEditing(prev => ({ ...prev, description: e.target.value }))} />
                  </div>
                  <div className="flex-1 flex flex-col min-h-0">
                    <label className="block text-xs font-medium text-gray-500 mb-1">背景故事</label>
                    <textarea className="w-full flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white min-h-[80px]"
                      value={editing.background || ''} onChange={e => setEditing(prev => ({ ...prev, background: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">与其他人物关系</label>
                    <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" style={{height: '80px'}}
                      value={editing.relations || ''} onChange={e => setEditing(prev => ({ ...prev, relations: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`flex-1 overflow-hidden ${tab !== 'graph' ? 'hidden' : ''}`}>
        <RelationGraph projectId={projectId} characters={list} projectGenre={projectGenre} chapters={chapters} onCharacterUpdated={c => setList(prev => prev.map(x => x.id === c.id ? c : x))} />
      </div>

      {/* Avatar preview/pending */}
      {(previewAvatar || pendingAvatar) && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center gap-4"
          onClick={() => { setPreviewAvatar(null); setPendingAvatar(null); }}>
          <img src={previewAvatar || pendingAvatar!} className="max-w-[80vw] max-h-[70vh] rounded-lg" alt="" onClick={e => e.stopPropagation()} />
          {pendingAvatar && (
            <div className="flex gap-3" onClick={e => e.stopPropagation()}>
              <button className="px-5 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20"
                onClick={() => setPendingAvatar(null)}>不使用</button>
              <button className="px-5 py-2 rounded-xl text-sm font-medium text-white"
                style={{background: 'linear-gradient(135deg,#6366f1,#8b5cf6)'}}
                onClick={() => { setEditing(prev => ({ ...prev, avatar: pendingAvatar! })); setPendingAvatar(null); }}>
                用作头像
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
