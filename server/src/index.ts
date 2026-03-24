import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import mindmapRoutes from './routes/mindmaps';
import collaboratorRoutes from './routes/collaborators';
import aiRoutes from './routes/ai';
import { registerSocketHandlers } from './socket/handlers';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/mindmaps', mindmapRoutes);
app.use('/api/mindmaps/:id/collaborators', collaboratorRoutes);
app.use('/api/ai', aiRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Socket.io
registerSocketHandlers(io);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
