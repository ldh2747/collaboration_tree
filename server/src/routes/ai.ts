import { Router, Response } from 'express';
import OpenAI from 'openai';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.use(authMiddleware);

// POST /api/ai/expand
router.post('/expand', async (req: AuthRequest, res: Response) => {
  const { nodeContent, parentChain, siblingNodes, count } = req.body;
  const ideaCount = Math.min(Math.max(parseInt(count) || 5, 1), 10);

  if (!nodeContent) {
    res.status(400).json({ error: 'nodeContent is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      stream: true,
      messages: [
        {
          role: 'system',
          content:
            '당신은 창의적인 브레인스토밍 도우미입니다. 마인드맵의 맥락을 파악하고 구체적인 하위 아이디어를 JSON 배열 형태로 제안하세요. 반드시 {"ideas": ["아이디어1", "아이디어2", ...]} 형식으로만 응답하세요.',
        },
        {
          role: 'user',
          content: `현재 노드: "${nodeContent}"
상위 맥락: "${parentChain || '없음'}"
관련 노드들: "${siblingNodes?.join(', ') || '없음'}"

이 아이디어를 확장할 수 있는 구체적인 하위 아이디어 ${ideaCount}가지를 제안해주세요.`,
        },
      ],
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: 'AI request failed' })}\n\n`);
    res.end();
  }
});

// POST /api/ai/analyze
router.post('/analyze', async (req: AuthRequest, res: Response) => {
  const { nodeContent, memo } = req.body;
  if (!nodeContent) {
    res.status(400).json({ error: 'nodeContent is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      stream: true,
      messages: [
        {
          role: 'system',
          content:
            '당신은 마인드맵 아이디어 분석 전문가입니다. 아이디어와 메모를 바탕으로 핵심 인사이트, 강점, 개선 방향을 간결하게 분석해주세요. 마크다운 없이 자연스러운 한국어로 작성하세요.',
        },
        {
          role: 'user',
          content: `아이디어: "${nodeContent}"
메모: "${memo?.trim() || '없음'}"

위 아이디어를 분석해주세요. 다음 순서로 작성하세요:
1. 핵심 인사이트 (1~2문장)
2. 강점 (bullet 2개)
3. 개선 방향 (bullet 2개)`,
        },
      ],
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch {
    res.write(`data: ${JSON.stringify({ error: 'AI request failed' })}\n\n`);
    res.end();
  }
});

export default router;
