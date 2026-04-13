import axios from 'axios';
import { Project, Chapter, Character, WorldItem, AIAction, User } from '../types';

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

export const charactersApi = {
  list: (pid: string) => api.get<Character[]>(`/projects/${pid}/characters`).then(r => r.data),
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
};
