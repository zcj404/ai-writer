import axios from 'axios';
import { Project, Chapter, Character, WorldItem, AIAction, User, Relationship, RelationSnapshot, Volume, Milestone } from '../types';

const api = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api'
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  register: (email: string, password: string, nickname?: string) =>
    api.post<{ token: string; user: User }>('/users/register', { email, password, nickname }).then(r => r.data),
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('/users/login', { email, password }).then(r => r.data),
  me: () => api.get<User>('/users/me').then(r => r.data),
};

export const projectsApi = {
  list: () => api.get<Project[]>('/projects').then(r => r.data),
  create: (data: Partial<Project>) => api.post<Project>('/projects', data).then(r => r.data),
  get: (id: string) => api.get<Project>(`/projects/${id}`).then(r => r.data),
  update: (id: string, data: Partial<Project>) => api.put<Project>(`/projects/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/projects/${id}`),
};

export const chaptersApi = {
  list: (pid: string) => api.get<Chapter[]>(`/projects/${pid}/chapters`).then(r => r.data),
  create: (pid: string, data: Partial<Chapter>) => api.post<Chapter>(`/projects/${pid}/chapters`, data).then(r => r.data),
  get: (pid: string, id: string) => api.get<Chapter>(`/projects/${pid}/chapters/${id}`).then(r => r.data),
  update: (pid: string, id: string, data: Partial<Chapter>) => api.put<Chapter>(`/projects/${pid}/chapters/${id}`, data).then(r => r.data),
  remove: (pid: string, id: string) => api.delete(`/projects/${pid}/chapters/${id}`),
};

export const volumesApi = {
  list: (pid: string) => api.get<Volume[]>(`/projects/${pid}/volumes`).then(r => r.data),
  create: (pid: string, data: { name: string; order_num: number }) => api.post<Volume>(`/projects/${pid}/volumes`, data).then(r => r.data),
  update: (pid: string, id: string, name: string) => api.put(`/projects/${pid}/volumes/${id}`, { name }).then(r => r.data),
  remove: (pid: string, id: string) => api.delete(`/projects/${pid}/volumes/${id}`),
};

export const charactersApi = {
  list: (pid: string) => api.get<Character[]>(`/projects/${pid}/characters`).then(r => r.data),
  listAll: (pid: string) => api.get<Character[]>(`/projects/${pid}/characters?all=1`).then(r => r.data),
  create: (pid: string, data: Partial<Character>) => api.post<Character>(`/projects/${pid}/characters`, data).then(r => r.data),
  update: (pid: string, id: string, data: Partial<Character>) => api.put<Character>(`/projects/${pid}/characters/${id}`, data).then(r => r.data),
  remove: (pid: string, id: string) => api.delete(`/projects/${pid}/characters/${id}`),
};

export const worldApi = {
  list: (pid: string) => api.get<WorldItem[]>(`/projects/${pid}/worldbuilding`).then(r => r.data),
  create: (pid: string, data: Partial<WorldItem>) => api.post<WorldItem>(`/projects/${pid}/worldbuilding`, data).then(r => r.data),
  update: (pid: string, id: string, data: Partial<WorldItem>) => api.put<WorldItem>(`/projects/${pid}/worldbuilding/${id}`, data).then(r => r.data),
  remove: (pid: string, id: string) => api.delete(`/projects/${pid}/worldbuilding/${id}`),
};

export const aiApi = {
  assist: (action: AIAction, text: string, context?: string) =>
    api.post<{ result: string }>('/ai/assist', { action, text, context }).then(r => r.data.result),
  generateAvatar: (data: { name?: string; role?: string; appearance?: string; personality?: string; age_group?: string; ethnicity?: string; gender?: string; novel_category?: string }) =>
    api.post<{ url: string }>('/ai/generate-avatar', data).then(r => r.data.url),
  inspirationConfig: () => api.get<{
    writing_tips: string[];
    plot_structures: { name: string; beats: string[] }[];
    rand_settings: string[];
    rand_relations: string[];
    rand_conflicts: string[];
  }>('/ai/inspiration-config').then(r => r.data),
  getSummary: (chapterId: string) =>
    api.get<{ summary: string; content_length: number } | null>(`/ai/summary/${chapterId}`).then(r => r.data),
  saveSummary: (chapterId: string, summary: string, content_length: number) =>
    api.post(`/ai/summary/${chapterId}`, { summary, content_length }),
  deleteSummary: (chapterId: string) =>
    api.delete(`/ai/summary/${chapterId}`),
};

export const relationshipsApi = {
  list: (pid: string) => api.get<Relationship[]>(`/projects/${pid}/relationships`).then(r => r.data),
  batchSave: (pid: string, relations: Omit<Relationship, 'id'>[]) =>
    api.post(`/projects/${pid}/relationships/batch`, { relations }).then(r => r.data),
  create: (pid: string, data: Omit<Relationship, 'id'>) =>
    api.post<Relationship>(`/projects/${pid}/relationships`, data).then(r => r.data),
  remove: (pid: string, id: string) => api.delete(`/projects/${pid}/relationships/${id}`),
};

export const milestonesApi = {
  list: (pid: string) => api.get<Milestone[]>(`/projects/${pid}/milestones`).then(r => r.data),
  create: (pid: string, data: Partial<Milestone>) => api.post<Milestone>(`/projects/${pid}/milestones`, data).then(r => r.data),
  update: (pid: string, id: string, data: Partial<Milestone>) => api.put<Milestone>(`/projects/${pid}/milestones/${id}`, data).then(r => r.data),
  remove: (pid: string, id: string) => api.delete(`/projects/${pid}/milestones/${id}`),
};

export const mapExportsApi = {
  list: (pid: string) => api.get<import('../types').MapExport[]>(`/projects/${pid}/mapexports`).then(r => r.data),
  get: (pid: string, id: string) => api.get<import('../types').MapExport>(`/projects/${pid}/mapexports/${id}`).then(r => r.data),
  create: (pid: string, data: { name: string; image_data: string }) => api.post<import('../types').MapExport>(`/projects/${pid}/mapexports`, data).then(r => r.data),
  generate: (pid: string, data: { items: any[]; projectTitle?: string; genre?: string; svgDataUrl?: string | null }) => api.post<{ jobId: string }>(`/projects/${pid}/mapexports/generate`, data).then(r => r.data),
  jobStatus: (pid: string, jobId: string) => api.get<{ status: string; styleDesc: string | null; image_data: string | null; error: string | null }>(`/projects/${pid}/mapexports/job/${jobId}`).then(r => r.data),
  remove: (pid: string, id: string) => api.delete(`/projects/${pid}/mapexports/${id}`),
};

export const snapshotsApi = {  list: (pid: string) => api.get<RelationSnapshot[]>(`/projects/${pid}/snapshots`).then(r => r.data),
  get: (pid: string, id: string) => api.get<RelationSnapshot>(`/projects/${pid}/snapshots/${id}`).then(r => r.data),
  create: (pid: string, data: { name: string; chapter_ids: string[]; relations: Array<{source_id:string;target_id:string;label:string}>; positions?: Record<string,{x:number;y:number}>; characters?: Record<string, any> }) =>
    api.post<RelationSnapshot>(`/projects/${pid}/snapshots`, data).then(r => r.data),
  update: (pid: string, id: string, data: { relations?: Array<{source_id:string;target_id:string;label:string}>; name?: string; chapter_ids?: string[]; positions?: Record<string,{x:number;y:number}>; characters?: Record<string, any> }) =>
    api.put(`/projects/${pid}/snapshots/${id}`, data).then(r => r.data),
  rename: (pid: string, id: string, name: string) =>
    api.put(`/projects/${pid}/snapshots/${id}`, { name }).then(r => r.data),
  remove: (pid: string, id: string) => api.delete(`/projects/${pid}/snapshots/${id}`),
};

export const aiNovelsApi = {
  list: () => api.get<import('../types').AiNovel[]>('/ainovels').then(r => r.data),
  create: (data: { title: string; genre: string; premise: string; protagonist: string; total_volumes?: number; chapters_per_volume?: number; words_per_chapter?: number }) =>
    api.post<{ id: string }>('/ainovels', data).then(r => r.data),
  get: (id: string) => api.get<import('../types').AiNovel>(`/ainovels/${id}`).then(r => r.data),
  update: (id: string, data: { title: string; genre: string; premise: string; protagonist: string; realm_system?: string; official_system?: string }) =>
    api.put<import('../types').AiNovel>(`/ainovels/${id}`, data).then(r => r.data),
  remove: (id: string) => api.delete(`/ainovels/${id}`),
  listVolumes: (id: string) => api.get<import('../types').AiNovelVolume[]>(`/ainovels/${id}/volumes`).then(r => r.data),
  addVolume: (id: string) => api.post<import('../types').AiNovelVolume>(`/ainovels/${id}/volumes`, {}).then(r => r.data),
  updateVolume: (id: string, vid: string, data: { title: string; outline: string }) =>
    api.put(`/ainovels/${id}/volumes/${vid}`, data).then(r => r.data),
  retryVolume: (id: string, vid: string) => api.post(`/ainovels/${id}/volumes/${vid}/retry`, {}).then(r => r.data),
  approveVolume: (id: string, vid: string) => api.post(`/ainovels/${id}/volumes/${vid}/approve`, {}),
  listChapters: (id: string, vid: string) => api.get<import('../types').AiNovelChapter[]>(`/ainovels/${id}/volumes/${vid}/chapters`).then(r => r.data),
  addChapter: (id: string, vid: string, data: { title?: string; outline?: string; ai?: boolean; insert_after?: number }) =>
    api.post<import('../types').AiNovelChapter>(`/ainovels/${id}/volumes/${vid}/chapters`, data).then(r => r.data),
  getChapter: (id: string, vid: string, cid: string) => api.get<import('../types').AiNovelChapter>(`/ainovels/${id}/volumes/${vid}/chapters/${cid}`).then(r => r.data),
  updateChapter: (id: string, vid: string, cid: string, data: { title?: string; outline?: string; content?: string }) =>
    api.put<import('../types').AiNovelChapter>(`/ainovels/${id}/volumes/${vid}/chapters/${cid}`, data).then(r => r.data),
  removeChapter: (id: string, vid: string, cid: string) => api.delete(`/ainovels/${id}/volumes/${vid}/chapters/${cid}`),
  regenerateSummary: (id: string, vid: string, cid: string) =>
    api.post<{ outline: string }>(`/ainovels/${id}/volumes/${vid}/chapters/${cid}/regenerate-summary`, {}).then(r => r.data),
  extractProtagonistStatus: (id: string, vid: string, cid: string) =>
    api.post<{ protagonist_status: string }>(`/ainovels/${id}/volumes/${vid}/chapters/${cid}/extract-status`, {}).then(r => r.data),
  generateChapter: (id: string, vid: string, cid: string) => api.post(`/ainovels/${id}/volumes/${vid}/chapters/${cid}/generate`, {}),
  chatChapterOutline: (id: string, vid: string, cid: string, data: { message: string; history: {role:string;content:string}[] }) =>
    api.post<{ reply: string }>(`/ainovels/${id}/volumes/${vid}/chapters/${cid}/chat-outline`, data).then(r => r.data),
  generateVolume: (id: string, vid: string) => api.post<{ total: number }>(`/ainovels/${id}/volumes/${vid}/generate`, {}).then(r => r.data),
  pauseVolume: (id: string, vid: string) => api.post(`/ainovels/${id}/volumes/${vid}/pause`, {}),
  resumeVolume: (id: string, vid: string) => api.post<{ total: number }>(`/ainovels/${id}/volumes/${vid}/resume`, {}).then(r => r.data),
  chatChapter: (id: string, vid: string, cid: string, data: { message: string; history: {role:string;content:string}[] }) =>
    api.post<{ reply: string }>(`/ainovels/${id}/volumes/${vid}/chapters/${cid}/chat`, data).then(r => r.data),
  chat: (id: string, data: { message: string; history: {role:string;content:string}[]; mode: 'world'|'volume'; vid?: string }) =>
    api.post<{ reply: string }>(`/ainovels/${id}/chat`, data).then(r => r.data),
  updateMemory: (id: string, data: Record<string, string>) =>
    api.put(`/ainovels/${id}/memory`, data).then(r => r.data),
  getChatHistory: (id: string) =>
    api.get<{ history: {role: string; content: string}[] }>(`/ainovels/${id}/chat-history`).then(r => r.data.history),
  applyProposal: (id: string, proposal: any) =>
    api.post(`/ainovels/${id}/apply-proposal`, { proposal }).then(r => r.data),
  getChapterChatHistory: (id: string, vid: string, cid: string) =>
    api.get<{ history: {role: string; content: string}[] }>(`/ainovels/${id}/volumes/${vid}/chapters/${cid}/chat-history`).then(r => r.data.history),
  clearChapterChatHistory: (id: string, vid: string, cid: string) =>
    api.delete(`/ainovels/${id}/volumes/${vid}/chapters/${cid}/chat-history`),
  updateChapterChatHistory: (id: string, vid: string, cid: string, history: {role: string; content: string}[]) =>
    api.put(`/ainovels/${id}/volumes/${vid}/chapters/${cid}/chat-history`, { history }).then(r => r.data),
  applyChapterProposal: (id: string, vid: string, cid: string, data: { outlineProposal?: any; revisedProposal?: string }) =>
    api.post(`/ainovels/${id}/volumes/${vid}/chapters/${cid}/apply-proposal`, data).then(r => r.data),
  updateChatHistory: (id: string, history: {role: string; content: string}[]) =>
    api.put(`/ainovels/${id}/chat-history`, { history }).then(r => r.data),
};
