export interface Project {
  id: string;
  title: string;
  description: string;
  genre: string;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  project_id: string;
  title: string;
  content: string;
  order_num: number;
  word_count: number;
  created_at: string;
  updated_at: string;
}

export interface Character {
  id: string;
  project_id: string;
  name: string;
  role: string;
  description: string;
  personality: string;
  background: string;
  appearance: string;
}

export interface WorldItem {
  id: string;
  project_id: string;
  category: string;
  title: string;
  content: string;
}

export interface User {
  id: string;
  email: string;
  nickname: string;
  plan: string;
  ai_calls_today?: number;
}

export type AIAction = 'continue' | 'rewrite' | 'expand' | 'polish' | 'summarize' | 'outline' | 'brainstorm' | 'proofread' | 'character' | 'title';
