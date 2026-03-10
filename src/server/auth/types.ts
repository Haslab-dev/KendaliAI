// Auth types for KendaliAI

export interface User {
  id: string;
  username: string;
  role: "admin" | "user";
  apiKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  permissions: string[];
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  revokedAt?: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuthContext {
  user?: User;
  apiKey?: ApiKey;
  isAuthenticated: boolean;
  isApiKey: boolean;
}

export type Permission =
  | "read:agents"
  | "write:agents"
  | "read:workflows"
  | "write:workflows"
  | "read:tools"
  | "write:tools"
  | "read:plugins"
  | "write:plugins"
  | "read:messages"
  | "write:messages"
  | "read:gateway"
  | "write:gateway"
  | "admin";
