import fs from 'fs';
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { getProjectLayoutPath } from '../services/fileUpload';

const router = Router();
const projectIdSchema = z.string().min(1).max(100);

router.get(
  '/projects/:projectId',
  authenticate,
  authorize('Lead', 'edit'),
  async (req: AuthRequest, res: Response) => {
    const parsedProjectId = projectIdSchema.safeParse(req.params.projectId);
    if (!parsedProjectId.success || !req.user) {
      return res.status(400).json({ success: false, error: 'Select a valid project' });
    }

    try {
      const layouts = await prisma.projectLayout.findMany({
        where: {
          tenantId: req.user.tenantId,
          projectId: parsedProjectId.data,
          status: { in: ['DRAFT', 'PUBLISHED'] },
        },
        select: {
          id: true,
          name: true,
          originalFilename: true,
          mimeType: true,
          selectedPage: true,
          status: true,
          shapes: {
            select: {
              id: true,
              kind: true,
              geometry: true,
              unit: {
                select: {
                  id: true,
                  tenantId: true,
                  projectId: true,
                  number: true,
                  type: true,
                  block: true,
                  floor: true,
                  area: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
      const validLayouts = layouts.filter((candidate) =>
        candidate.shapes.every((shape) =>
          !shape.unit || (
            shape.unit.tenantId === req.user!.tenantId &&
            shape.unit.projectId === parsedProjectId.data
          ),
        ),
      );
      const layout = validLayouts.find((candidate) =>
        candidate.status === 'PUBLISHED' &&
        candidate.shapes.length > 0 &&
        candidate.shapes.every((shape) => Boolean(shape.unit)),
      )
        ?? validLayouts[0];

      if (!layout) return res.json({ success: true, data: null });
      const isInteractive = layout.status === 'PUBLISHED' &&
        layout.shapes.length > 0 &&
        layout.shapes.every((shape) => Boolean(shape.unit));
      return res.json({
        success: true,
        data: {
          id: layout.id,
          name: layout.name,
          originalFilename: layout.originalFilename,
          mimeType: layout.mimeType,
          selectedPage: layout.selectedPage,
          status: layout.status,
          isInteractive,
          shapes: (isInteractive ? layout.shapes : []).flatMap((shape) => shape.unit ? [{
            id: shape.id,
            kind: shape.kind,
            geometry: shape.geometry,
            unit: {
              id: shape.unit.id,
              number: shape.unit.number,
              type: shape.unit.type,
              block: shape.unit.block,
              floor: shape.unit.floor,
              area: shape.unit.area,
              status: shape.unit.status,
            },
          }] : []),
        },
      });
    } catch (error) {
      console.error('Quotation project layout read failed:', error);
      return res.status(500).json({ success: false, error: 'Could not load this project layout' });
    }
  },
);

router.get(
  '/projects/:projectId/:layoutId/drawing',
  authenticate,
  authorize('Lead', 'edit'),
  async (req: AuthRequest, res: Response) => {
    const parsedProjectId = projectIdSchema.safeParse(req.params.projectId);
    if (!parsedProjectId.success || !req.user) {
      return res.status(400).json({ success: false, error: 'Select a valid project' });
    }

    try {
      const layout = await prisma.projectLayout.findFirst({
        where: {
          id: req.params.layoutId,
          tenantId: req.user.tenantId,
          projectId: parsedProjectId.data,
          status: 'PUBLISHED',
          shapes: { some: {} },
        },
        select: {
          storageKey: true,
          mimeType: true,
          originalFilename: true,
          shapes: {
            select: {
              unit: { select: { tenantId: true, projectId: true } },
            },
          },
        },
      });
      if (
        !layout ||
        layout.shapes.length === 0 ||
        layout.shapes.some((shape) =>
          !shape.unit ||
          shape.unit.tenantId !== req.user!.tenantId ||
          shape.unit.projectId !== parsedProjectId.data,
        )
      ) {
        return res.status(404).json({ success: false, error: 'Project layout drawing not found' });
      }

      const drawingPath = getProjectLayoutPath(layout.storageKey);
      if (!fs.existsSync(drawingPath)) {
        return res.status(404).json({ success: false, error: 'Project layout drawing is unavailable' });
      }
      res.setHeader('Content-Type', layout.mimeType);
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(layout.originalFilename)}`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      return res.sendFile(drawingPath);
    } catch (error) {
      console.error('Quotation project layout drawing read failed:', error);
      return res.status(500).json({ success: false, error: 'Could not load this project layout drawing' });
    }
  },
);

export default router;
