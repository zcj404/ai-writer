export interface Project {
  id: string;
  title: string;
  description: string;
  synopsis?: string;
  genre: string;
  created_at: string;
  updated_at: string;
}

export interface Volume {
  id: string;
  project_id: string;
  name: string;
  order_num: number;
}

export interface Chapter {
  id: string;
  project_id: string;
  title: string;
  content: string;
  order_num: number;
  word_count: number;
  volume_id?: string | null;
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
  age_group?: string;
  ethnicity?: string;
  gender?: string;
  novel_category?: string;
  avatar?: string;
  relations?: string;
  is_main?: number;
}

export interface WorldItem {
  id: string;
  project_id: string;
  category: string;
  title: string;
  content: string;
  parent_id?: string | null;
  relations?: string[];
  position?: { x: number; y: number } | null;
  polygon?: { x: number; y: number }[] | null;
  color?: string | null;
}

export interface User {
  id: string;
  email: string;
  nickname: string;
  plan: string;
  ai_calls_today?: number;
}

export type AIAction = 'continue' | 'rewrite' | 'expand' | 'polish' | 'summarize' | 'outline' | 'brainstorm' | 'proofread' | 'character' | 'title' | 'analyze_relations' | 'conflict' | 'plot_twist' | 'hook' | 'raw';

export interface Relationship {
  id: string;
  source_id: string;
  target_id: string;
  label: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description: string;
  tag: string | null;
  volume_id: string | null;
  target_chapter: string | null;
  order_num: number;
  created_at: string;
}

export interface MapExport {
  id: string;
  project_id: string;
  name: string;
  image_data?: string;
  created_at: string;
}

export interface RelationSnapshot {
  id: string;
  name: string;
  chapter_ids: string[];
  relations?: Array<{ source_id: string; target_id: string; label: string }>;
  characters?: Record<string, Character>;
  created_at: string;
}

export interface AiNovel {
  id: string;
  title: string;
  genre: string;
  premise: string;
  protagonist: string;
  total_volumes: number;
  chapters_per_volume: number;
  words_per_chapter: number;
  memory: Record<string, any>;
  status: string;
  created_at: string;
}

export interface AiNovelVolume {
  id: string;
  novel_id: string;
  volume_num: number;
  title: string;
  outline: string;
  status: string;
  is_paused?: number;
  error_msg?: string;
}

export interface AiNovelChapter {
  id: string;
  novel_id: string;
  volume_id: string;
  chapter_num: number;
  title: string;
  outline: string;
  content: string;
  summary: string;
  status: string;
  word_count?: number;
  error_msg?: string;
  protagonist_status?: string;
}
