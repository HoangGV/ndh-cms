export type UserRole = 'admin' | 'member';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  created_at?: string;
  post_count?: number;
}

export type PostStatus = 'draft' | 'pending' | 'published' | 'rejected';

export interface PostSummary {
  id: number;
  title: string;
  slug: string;
  published_slug: string | null;
  description: string;
  tags: string;
  reading_time: number;
  status: PostStatus;
  author_id: number;
  author_name: string;
  author_role: UserRole;
  reject_reason: string | null;
  delete_requested: number;
  delete_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostDetail extends PostSummary {
  cover: string;
  content: string;
  approved_by: number | null;
}

export interface NotificationItem {
  id: number;
  post_title: string;
  action_type: string;
  message: string;
  created_at: string;
}

export interface GitHubConfigStatus {
  configured: boolean;
  hasToken: boolean;
  hasRepo: boolean;
  owner: string;
  repo: string;
  branch: string;
  contentPath: string;
}

export type AppView = 'dashboard' | 'editor' | 'account' | 'guide' | 'login' | 'register';

export interface FlashMessage {
  text: string;
  type: 'success' | 'error' | 'info';
}
