import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { layoutAssignmentMatrix, resolveAssignedLayout, saveLayoutAssignments } from '../services/layoutAccess';

const router = Router();
router.use(authenticate);

router.get('/resolve', async (req: AuthRequest, res: Response) => {
  try {
    const objectName = String(req.query.object || '').trim();
    if (!objectName) return res.status(400).json({ success: false, error: 'Object is required' });
    const layout = await resolveAssignedLayout(req.tenantId!, req.user?.profileId, objectName);
    if (!layout) return res.status(404).json({ success: false, error: 'No layout found' });
    res.json({ success: true, data: layout });
  } catch (error) {
    console.error('Resolve layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to resolve layout' });
  }
});

router.get('/', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const objectName = String(req.query.object || '').trim();
    if (!objectName) return res.status(400).json({ success: false, error: 'Object is required' });
    const matrix = await layoutAssignmentMatrix(req.tenantId!, objectName);
    if (!matrix) return res.status(404).json({ success: false, error: 'Object not found' });
    res.json({ success: true, data: matrix });
  } catch (error) {
    console.error('Get layout assignments error:', error);
    res.status(500).json({ success: false, error: 'Failed to load layout assignments' });
  }
});

router.put('/', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const objectName = String(req.body?.object || req.query.object || '').trim();
    const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : null;
    if (!objectName || !assignments) {
      return res.status(400).json({ success: false, error: 'Object and assignments are required' });
    }
    const saved = await saveLayoutAssignments(req.tenantId!, req.user?.id, objectName, assignments);
    if ('error' in saved) return res.status(400).json({ success: false, error: saved.error });
    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('Save layout assignments error:', error);
    res.status(500).json({ success: false, error: 'Failed to save layout assignments' });
  }
});

export { router as layoutAssignmentRoutes };
