import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
const prisma = new PrismaClient();

router.use(authMiddleware);

// GET /api/mindmaps/:id/collaborators
router.get('/', async (req: AuthRequest, res: Response) => {
  const collaborators = await prisma.collaborator.findMany({
    where: { mindmapId: req.params.id },
    include: { user: { select: { id: true, displayName: true, email: true } } },
  });
  res.json(collaborators);
});

// POST /api/mindmaps/:id/collaborators  — 이메일로 초대
router.post('/', async (req: AuthRequest, res: Response) => {
  const { email, role = 'EDITOR' } = req.body;
  if (!email) { res.status(400).json({ error: 'email is required' }); return; }

  // 권한 확인 (소유자만 초대 가능)
  const mindmap = await prisma.mindmap.findUnique({ where: { id: req.params.id } });
  if (!mindmap || mindmap.ownerId !== req.userId) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }

  const target = await prisma.user.findUnique({ where: { email } });
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }
  if (target.id === req.userId) { res.status(400).json({ error: 'Cannot invite yourself' }); return; }

  const collaborator = await prisma.collaborator.upsert({
    where: { mindmapId_userId: { mindmapId: req.params.id, userId: target.id } },
    update: { role: role as 'EDITOR' | 'VIEWER' },
    create: { mindmapId: req.params.id, userId: target.id, role: role as 'EDITOR' | 'VIEWER' },
    include: { user: { select: { id: true, displayName: true, email: true } } },
  });
  res.status(201).json(collaborator);
});

// DELETE /api/mindmaps/:id/collaborators/:userId
router.delete('/:userId', async (req: AuthRequest, res: Response) => {
  const mindmap = await prisma.mindmap.findUnique({ where: { id: req.params.id } });
  if (!mindmap || mindmap.ownerId !== req.userId) {
    res.status(403).json({ error: 'Forbidden' }); return;
  }
  await prisma.collaborator.delete({
    where: { mindmapId_userId: { mindmapId: req.params.id, userId: req.params.userId } },
  });
  res.status(204).send();
});

export default router;
