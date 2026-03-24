import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import * as Y from 'yjs';
import { joinRoom, leaveRoom, applyRemoteUpdate } from './yjsManager';

interface JoinRoomPayload { mindmapId: string; token: string; }
interface ReactionPayload {
  mindmapId: string; nodeId: string; userId: string; emoji: string;
  action: 'added' | 'updated' | 'removed'; prevEmoji?: string;
}

export function registerSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);
    // 이 소켓이 yjs_join한 방을 추적 (강제 종료 시 leaveRoom 호출용)
    const joinedRooms = new Set<string>();

    // ── 방 입장 ───────────────────────────────────────────
    socket.on('join_room', async ({ mindmapId, token }: JoinRoomPayload) => {
      try {
        jwt.verify(token, process.env.JWT_SECRET!);
        socket.join(mindmapId);
        socket.to(mindmapId).emit('user_joined', { socketId: socket.id });
        console.log(`Socket ${socket.id} joined room ${mindmapId}`);
      } catch {
        socket.emit('error', { message: 'Invalid token' });
      }
    });

    socket.on('leave_room', ({ mindmapId }: { mindmapId: string }) => {
      socket.leave(mindmapId);
      socket.to(mindmapId).emit('user_left', { socketId: socket.id });
    });

    // ── Yjs 동기화 ────────────────────────────────────────

    // 클라이언트가 방 입장 시 Y.Doc 전체 상태 요청
    socket.on('yjs_join', async ({ mindmapId, token }: JoinRoomPayload) => {
      try {
        jwt.verify(token, process.env.JWT_SECRET!);
        const doc = await joinRoom(mindmapId);
        joinedRooms.add(mindmapId);
        const state = Y.encodeStateAsUpdate(doc);
        // 이 클라이언트에게 현재 전체 상태 전송
        socket.emit('yjs_state', {
          mindmapId,
          state: Array.from(state),
        });
      } catch {
        socket.emit('error', { message: 'Invalid token' });
      }
    });

    // 클라이언트가 보낸 Yjs 업데이트 → 서버 적용 → 다른 클라이언트에 브로드캐스트
    socket.on('yjs_update', async ({ mindmapId, update }: { mindmapId: string; update: number[] }) => {
      let ok = applyRemoteUpdate(mindmapId, new Uint8Array(update));

      // room이 없으면(race condition) joinRoom으로 생성 후 재시도
      if (!ok && joinedRooms.has(mindmapId)) {
        try {
          await joinRoom(mindmapId);
          ok = applyRemoteUpdate(mindmapId, new Uint8Array(update));
        } catch (err) {
          console.error(`[handlers] yjs_update fallback joinRoom failed: ${mindmapId}`, err);
        }
      }

      if (ok) {
        socket.to(mindmapId).emit('yjs_update', { mindmapId, update });
      }
    });

    // 클라이언트 퇴장 시 Y.Doc 참조 해제
    socket.on('yjs_leave', ({ mindmapId }: { mindmapId: string }) => {
      joinedRooms.delete(mindmapId);
      leaveRoom(mindmapId);
    });

    // ── Reaction ──────────────────────────────────────────
    socket.on('reaction', (payload: ReactionPayload) => {
      io.to(payload.mindmapId).emit('reaction_updated', payload);
    });

    // ── Cursor ────────────────────────────────────────────
    socket.on('cursor_move', (payload: { mindmapId: string; [key: string]: unknown }) => {
      socket.to(payload.mindmapId).emit('cursor_moved', payload);
    });

    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: ${socket.id}`);
      // yjs_leave 없이 끊긴 경우 남은 방 정리
      for (const mindmapId of joinedRooms) {
        await leaveRoom(mindmapId);
      }
      joinedRooms.clear();
    });
  });
}
