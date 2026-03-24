import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// GET /api/mindmaps
router.get('/', async (req: AuthRequest, res: Response) => {
  const mindmaps = await prisma.mindmap.findMany({
    where: {
      OR: [
        { ownerId: req.userId },
        { collaborators: { some: { userId: req.userId } } },
      ],
    },
    include: { owner: { select: { displayName: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(mindmaps);
});

// POST /api/mindmaps
router.post('/', async (req: AuthRequest, res: Response) => {
  const { title } = req.body;
  const mindmap = await prisma.mindmap.create({
    data: { title: title || 'Untitled', ownerId: req.userId! },
  });
  res.status(201).json(mindmap);
});

// GET /api/mindmaps/:id  (nodes + edges + reactions 포함)
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const mindmap = await prisma.mindmap.findUnique({
    where: { id: req.params.id },
    include: {
      nodes: { include: { reactions: true } },
      edges: true,
    },
  });
  if (!mindmap) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(mindmap);
});

// PATCH /api/mindmaps/:id
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const { title } = req.body;
  const mindmap = await prisma.mindmap.findUnique({ where: { id: req.params.id } });
  if (!mindmap || mindmap.ownerId !== req.userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.mindmap.update({
    where: { id: req.params.id },
    data: { title },
  });
  res.json(updated);
});

// DELETE /api/mindmaps/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const mindmap = await prisma.mindmap.findUnique({ where: { id: req.params.id } });
  if (!mindmap || mindmap.ownerId !== req.userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  await prisma.mindmap.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ─── Node CRUD ───────────────────────────────────────────

router.post('/:id/nodes', async (req: AuthRequest, res: Response) => {
  const { content, positionX, positionY, style } = req.body;
  const node = await prisma.node.create({
    data: {
      mindmapId: req.params.id,
      content: content || '새 아이디어',
      positionX: positionX ?? 200,
      positionY: positionY ?? 200,
      style: style ?? {},
      createdById: req.userId!,
    },
  });
  await prisma.mindmap.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
  res.status(201).json(node);
});

router.patch('/:id/nodes/:nodeId', async (req: AuthRequest, res: Response) => {
  const { content, positionX, positionY, style } = req.body;
  const node = await prisma.node.update({
    where: { id: req.params.nodeId },
    data: {
      ...(content !== undefined && { content }),
      ...(positionX !== undefined && { positionX }),
      ...(positionY !== undefined && { positionY }),
      ...(style !== undefined && { style }),
    },
  });
  await prisma.mindmap.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
  res.json(node);
});

router.delete('/:id/nodes/:nodeId', async (req: AuthRequest, res: Response) => {
  await prisma.node.delete({ where: { id: req.params.nodeId } });
  res.status(204).send();
});

// ─── Reaction (토글) ─────────────────────────────────────

// POST /api/mindmaps/:id/nodes/:nodeId/reactions
router.post('/:id/nodes/:nodeId/reactions', async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const nodeId = req.params.nodeId;
  const { emoji } = req.body;

  if (!emoji) {
    res.status(400).json({ error: 'emoji is required' });
    return;
  }

  const existing = await prisma.reaction.findUnique({
    where: { nodeId_userId: { nodeId, userId } },
  });

  if (existing) {
    if (existing.emoji === emoji) {
      // 같은 이모티콘 → 제거 (토글 off)
      await prisma.reaction.delete({ where: { nodeId_userId: { nodeId, userId } } });
      res.json({ action: 'removed', nodeId, userId, emoji });
    } else {
      // 다른 이모티콘 → 변경
      const updated = await prisma.reaction.update({
        where: { nodeId_userId: { nodeId, userId } },
        data: { emoji },
      });
      res.json({ action: 'updated', ...updated });
    }
  } else {
    // 새 리액션 추가
    const reaction = await prisma.reaction.create({
      data: { nodeId, userId, emoji },
    });
    res.status(201).json({ action: 'added', ...reaction });
  }
});

// ─── Edge CRUD ───────────────────────────────────────────

router.post('/:id/edges', async (req: AuthRequest, res: Response) => {
  const { sourceId, targetId, label } = req.body;
  const edge = await prisma.edge.create({
    data: { mindmapId: req.params.id, sourceId, targetId, label },
  });
  res.status(201).json(edge);
});

router.delete('/:id/edges/:edgeId', async (req: AuthRequest, res: Response) => {
  await prisma.edge.delete({ where: { id: req.params.edgeId } });
  res.status(204).send();
});

export default router;
