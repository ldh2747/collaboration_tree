import * as Y from 'yjs';
import { Socket } from 'socket.io-client';

export class YjsMindmapProvider {
  readonly doc: Y.Doc;
  readonly yNodes: Y.Map<Y.Map<unknown>>;
  readonly yEdges: Y.Map<Y.Map<unknown>>;
  private mindmapId: string;
  private socket: Socket;
  private token: string;

  // 특정 핸들러 참조 보관 (destroy 시 해당 리스너만 제거)
  private _onYjsState: (data: { mindmapId: string; state: number[] }) => void;
  private _onYjsUpdate: (data: { mindmapId: string; update: number[] }) => void;
  private _onDocUpdate: (update: Uint8Array, origin: unknown) => void;

  constructor(socket: Socket, mindmapId: string, token: string) {
    this.socket = socket;
    this.mindmapId = mindmapId;
    this.token = token;
    this.doc = new Y.Doc();
    this.yNodes = this.doc.getMap<Y.Map<unknown>>('nodes');
    this.yEdges = this.doc.getMap<Y.Map<unknown>>('edges');

    // 핸들러 바인딩
    this._onYjsState = ({ mindmapId, state }) => {
      if (mindmapId !== this.mindmapId) return;

      const serverUpdate = new Uint8Array(state);

      // ── Yjs sync step 3 ────────────────────────────────
      // 서버가 모르는 클라이언트 업데이트(race condition으로 드롭된 것 포함)를
      // 서버 state 적용 전에 계산해서 되돌려 보낸다.
      const serverStateVec = Y.encodeStateVectorFromUpdate(serverUpdate);
      const clientDiff = Y.encodeStateAsUpdate(this.doc, serverStateVec);
      // 2바이트 이상이면 실제 업데이트가 있음
      if (clientDiff.byteLength > 2) {
        this.socket.emit('yjs_update', {
          mindmapId: this.mindmapId,
          update: Array.from(clientDiff),
        });
      }

      // 서버 state를 클라이언트 doc에 병합
      Y.applyUpdate(this.doc, serverUpdate, 'server');
    };

    this._onYjsUpdate = ({ mindmapId, update }) => {
      if (mindmapId !== this.mindmapId) return;
      Y.applyUpdate(this.doc, new Uint8Array(update), 'remote');
    };

    // 로컬 변경 → 서버 전송 (remote/server 유래 업데이트는 재전송 안 함)
    this._onDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote' || origin === 'server') return;
      this.socket.emit('yjs_update', {
        mindmapId: this.mindmapId,
        update: Array.from(update),
      });
    };

    this._setupSync();
  }

  private _setupSync() {
    this.socket.on('yjs_state', this._onYjsState);
    this.socket.on('yjs_update', this._onYjsUpdate);
    this.doc.on('update', this._onDocUpdate);

    // 서버에 Y.Doc 전체 상태 요청
    this.socket.emit('yjs_join', { mindmapId: this.mindmapId, token: this.token });
  }

  // ── 노드 조작 ─────────────────────────────────────────

  addNode(id: string, content: string, positionX: number, positionY: number, createdById: string) {
    this.doc.transact(() => {
      const yNode = new Y.Map<unknown>();
      yNode.set('content', content);
      yNode.set('positionX', positionX);
      yNode.set('positionY', positionY);
      yNode.set('createdById', createdById);
      this.yNodes.set(id, yNode);
    });
  }

  updateNodeContent(id: string, content: string) {
    const yNode = this.yNodes.get(id);
    if (yNode) yNode.set('content', content);
  }

  updateNodeMemo(id: string, memo: string) {
    const yNode = this.yNodes.get(id);
    if (yNode) yNode.set('memo', memo);
  }

  updateNodePosition(id: string, x: number, y: number) {
    const yNode = this.yNodes.get(id);
    if (yNode) {
      this.doc.transact(() => {
        yNode.set('positionX', x);
        yNode.set('positionY', y);
      });
    }
  }

  deleteNode(id: string) {
    this.yNodes.delete(id);
    this.yEdges.forEach((yEdge, edgeId) => {
      if (yEdge.get('sourceId') === id || yEdge.get('targetId') === id) {
        this.yEdges.delete(edgeId);
      }
    });
  }

  addEdge(
    id: string,
    sourceId: string,
    targetId: string,
    sourceHandle?: string,
    targetHandle?: string,
  ) {
    this.doc.transact(() => {
      const yEdge = new Y.Map<unknown>();
      yEdge.set('sourceId', sourceId);
      yEdge.set('targetId', targetId);
      if (sourceHandle) yEdge.set('sourceHandle', sourceHandle);
      if (targetHandle) yEdge.set('targetHandle', targetHandle);
      this.yEdges.set(id, yEdge);
    });
  }

  deleteEdge(id: string) {
    this.yEdges.delete(id);
  }

  destroy() {
    this.socket.emit('yjs_leave', { mindmapId: this.mindmapId });
    // 이 provider의 리스너만 제거 (다른 provider 리스너는 보존)
    this.socket.off('yjs_state', this._onYjsState);
    this.socket.off('yjs_update', this._onYjsUpdate);
    this.doc.off('update', this._onDocUpdate);
    this.doc.destroy();
  }
}
