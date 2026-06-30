import { Router, Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { classifyIssue, guardrailsCheck } from '../services/ai-service';

const router = Router();

function apiResponse(success: boolean, data: any = null, error: string | null = null) {
  return { success, data, error };
}

// POST /api/ai/classify - classify an issue from images + description
router.post('/classify', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { images = [], description = '' } = req.body;

    // Guardrails on description
    if (description) {
      const guardrail = await guardrailsCheck(description);
      if (!guardrail.pass) {
        return res.status(400).json(apiResponse(false, null, `Content blocked: ${guardrail.reason}`));
      }
    }

    const result = await classifyIssue(images, description);
    res.json(result); // Return raw result for frontend
  } catch (err: any) {
    console.error('AI classify error:', err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/ai/guardrails - check text against guardrails
router.post('/guardrails', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json(apiResponse(false, null, 'Text required'));
    const result = await guardrailsCheck(text);
    res.json(apiResponse(true, result));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

export default router;
