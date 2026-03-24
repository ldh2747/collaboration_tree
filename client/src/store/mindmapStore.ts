import { create } from 'zustand';
import { Node, Edge, NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';

interface MindmapState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  addNode: (node: Node) => void;
  updateNodeContent: (id: string, content: string) => void;
}

export const useMindmapStore = create<MindmapState>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  onNodesChange: (changes) =>
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),
  onEdgesChange: (changes) =>
    set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  updateNodeContent: (id, content) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, label: content } } : n
      ),
    })),
}));
