export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface MindmapMeta {
  id: string;
  title: string;
  ownerId: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MindmapNode {
  id: string;
  mindmapId: string;
  parentId?: string;
  content: string;
  positionX: number;
  positionY: number;
  style?: Record<string, unknown>;
}

export interface MindmapEdge {
  id: string;
  mindmapId: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

export interface Reaction {
  nodeId: string;
  userId: string;
  emoji: string;
}
