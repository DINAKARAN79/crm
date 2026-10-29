import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest, generateToken } from '../middleware/auth';

const router = Router();

router.use(authenticate);

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

const chatSchema = z.object({
  message: z.string().min(1),
  conversation_id: z.string().optional(),
});

router.get('/conversations', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = { tenantId: req.tenantId!, userId: req.user!.id };

    const [conversations, total] = await Promise.all([
      prisma.aIConversation.findMany({
        where,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: { select: { messages: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.aIConversation.count({ where }),
    ]);

    res.json({
      success: true,
      data: conversations,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get AI conversations error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
  }
});

router.get('/conversations/:id', async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await prisma.aIConversation.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId!, userId: req.user!.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    res.json({ success: true, data: conversation });
  } catch (error) {
    console.error('Get AI conversation error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch conversation' });
  }
});

router.post('/chat', async (req: AuthRequest, res: Response) => {
  try {
    const data = chatSchema.parse(req.body);

    let conversationId = data.conversation_id;

    if (!conversationId) {
      const conversation = await prisma.aIConversation.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          title: data.message.slice(0, 100),
        },
      });
      conversationId = conversation.id;
    } else {
      const existing = await prisma.aIConversation.findFirst({
        where: { id: conversationId, tenantId: req.tenantId!, userId: req.user!.id },
      });

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Conversation not found' });
      }
    }

    const userMessage = await prisma.aIMessage.create({
      data: {
        conversationId,
        role: 'user',
        content: data.message,
      },
    });

    const userToken = generateToken({
      id: req.user!.id,
      email: req.user!.email,
      tenantId: req.tenantId!,
      isSuperAdmin: req.user!.isSuperAdmin,
    });

    let assistantResponse: string;
    let responseData: any = null;
    let responseType = 'text';

    try {
      const aiResponse = await fetch(`${AI_SERVICE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          message: data.message,
          conversation_id: conversationId,
        }),
      });

      if (!aiResponse.ok) {
        throw new Error(`AI service returned ${aiResponse.status}`);
      }

      const aiResult = await aiResponse.json() as any;
      assistantResponse = aiResult.response || 'I could not generate a response.';
      responseData = aiResult.data || null;
      responseType = aiResult.response_type || 'text';
    } catch (aiError) {
      console.error('AI service error:', aiError);
      assistantResponse = 'AI Assistant is temporarily unavailable. Please try again shortly.';
    }

    const assistantMessage = await prisma.aIMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: assistantResponse,
      },
    });

    await prisma.aIConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    res.status(200).json({
      success: true,
      data: {
        conversationId,
        userMessage,
        assistantMessage,
        response: assistantResponse,
        responseType,
        responseData,
      },
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Send AI message error:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

router.post('/send', async (req: AuthRequest, res: Response) => {
  try {
    const data = chatSchema.parse(req.body);

    let conversationId = data.conversation_id;

    if (!conversationId) {
      const conversation = await prisma.aIConversation.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          title: data.message.slice(0, 100),
        },
      });
      conversationId = conversation.id;
    } else {
      const existing = await prisma.aIConversation.findFirst({
        where: { id: conversationId, tenantId: req.tenantId!, userId: req.user!.id },
      });

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Conversation not found' });
      }
    }

    const userMessage = await prisma.aIMessage.create({
      data: {
        conversationId,
        role: 'user',
        content: data.message,
      },
    });

    const userToken = generateToken({
      id: req.user!.id,
      email: req.user!.email,
      tenantId: req.tenantId!,
      isSuperAdmin: req.user!.isSuperAdmin,
    });

    let assistantResponse: string;

    try {
      const aiResponse = await fetch(`${AI_SERVICE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          message: data.message,
          conversation_id: conversationId,
        }),
      });

      if (!aiResponse.ok) {
        throw new Error(`AI service returned ${aiResponse.status}`);
      }

      const aiResult = await aiResponse.json() as any;
      assistantResponse = aiResult.response || 'I could not generate a response.';
    } catch (aiError) {
      console.error('AI service error:', aiError);
      assistantResponse = 'AI Assistant is temporarily unavailable. Please try again shortly.';
    }

    const assistantMessage = await prisma.aIMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: assistantResponse,
      },
    });

    await prisma.aIConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    res.status(201).json({
      success: true,
      data: {
        conversationId,
        userMessage,
        assistantMessage,
      },
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Send AI message error:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

router.delete('/conversations/:id', async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await prisma.aIConversation.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId!, userId: req.user!.id },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    await prisma.aIMessage.deleteMany({ where: { conversationId: req.params.id } });
    await prisma.aIConversation.delete({ where: { id: req.params.id } });

    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Delete AI conversation error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete conversation' });
  }
});

export { router as aiRoutes };
