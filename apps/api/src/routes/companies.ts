import { Router, Response } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { prisma } from '@dct-crm/db';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import { auditLog } from '../middleware/audit';
import { bootstrapTenant } from '../services/tenantBootstrap';
import {
  validateFile,
  generateSafeFilename,
  deleteFile,
  getLogoPath,
  serveLogo,
  UPLOAD_DIR,
  MAX_FILE_SIZE,
  ALLOWED_MIMES,
} from '../services/fileUpload';

const router = Router();

router.use(authenticate);

router.get('/logos/:filename', async (req: AuthRequest, res: Response) => {
  serveLogo(req, res);
});

router.use(requireSuperAdmin);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, generateSafeFilename(file.originalname)),
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

const WROTE_FIELDS = [
  'name', 'companyCode', 'email', 'phone', 'website',
  'address', 'city', 'state', 'country', 'postalCode',
  'timezone', 'currency', 'description', 'domain', 'settings',
  'companyStartDate', 'companyExpiryDate',
] as const;

const createCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required').max(200),
  companyCode: z.string().min(1, 'Company code is required').max(50).regex(/^[A-Za-z0-9_-]+$/, 'Company code must be alphanumeric with hyphens or underscores'),
  email: z.string().email('Valid email is required').min(1, 'Email is required'),
  phone: z.string().min(1, 'Phone is required').max(30),
  website: z.union([z.string().trim().url('Invalid URL'), z.string().trim().max(0)]).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(100).optional().or(z.literal('')),
  country: z.string().max(100).optional().or(z.literal('')),
  postalCode: z.string().max(20).optional().or(z.literal('')),
  timezone: z.string().max(50).optional().or(z.literal('')),
  currency: z.string().max(10).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  domain: z.string().max(200).optional().or(z.literal('')),
  companyStartDate: z.string().optional().or(z.literal('')),
  companyExpiryDate: z.string().optional().or(z.literal('')),
  initialAdmin: z.object({
    username: z.string().min(1, 'Admin username is required').max(100),
    adminName: z.string().max(200).optional().or(z.literal('')),
    email: z.string().email('Valid admin email is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  }).optional(),
}).refine(
  (data) => !data.initialAdmin || data.initialAdmin.password === data.initialAdmin.confirmPassword,
  { message: 'Passwords do not match', path: ['initialAdmin', 'confirmPassword'] }
);

const updateCompanySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  companyCode: z.string().min(1).max(50).regex(/^[A-Za-z0-9_-]+$/).optional(),
  email: z.string().email('Valid email is required').min(1, 'Email is required'),
  phone: z.string().min(1, 'Phone is required').max(30),
  website: z.union([z.string().trim().url('Invalid URL'), z.string().trim().max(0)]).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(100).optional().or(z.literal('')),
  country: z.string().max(100).optional().or(z.literal('')),
  postalCode: z.string().max(20).optional().or(z.literal('')),
  timezone: z.string().max(50).optional().or(z.literal('')),
  currency: z.string().max(10).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  domain: z.string().max(200).optional().or(z.literal('')),
  companyStartDate: z.string().optional().or(z.literal('')),
  companyExpiryDate: z.string().optional().or(z.literal('')),
}).refine(Object.keys, { message: 'At least one field must be provided' });

const companyStatisticTypes = ['users', 'roles', 'leads', 'projects'] as const;
const companyStatisticTypeSchema = z.enum(companyStatisticTypes);
const companyUserPasswordSchema = z.object({ password: z.string().min(8, 'Password must be at least 8 characters') });

function searchTerms(search: string) {
  return search.split(/\s+/).filter(Boolean);
}

const ALLOWED_SORT_FIELDS = ['name', 'companyCode', 'createdAt', 'updatedAt', 'isActive'];
const ALLOWED_SORT_ORDERS = ['asc', 'desc'];

function getCompanyLifecycleStatus(tenant: { isActive: boolean; companyStartDate: Date | null; companyExpiryDate: Date | null }): string {
  if (!tenant.isActive) return 'deactivated';
  const now = new Date();
  if (tenant.companyStartDate && now < tenant.companyStartDate) return 'pending';
  if (tenant.companyExpiryDate && now > tenant.companyExpiryDate) return 'expired';
  return 'active';
}

function sanitizeCompanyCreate(data: any) {
  const sanitized: any = {};
  for (const field of WROTE_FIELDS) {
    if (data[field] !== undefined && data[field] !== null) {
      if (field === 'companyStartDate' || field === 'companyExpiryDate') {
        sanitized[field] = data[field] === '' ? null : data[field] ? new Date(data[field]) : null;
      } else {
        sanitized[field] = data[field] === '' ? null : data[field];
      }
    }
  }
  return sanitized;
}

function sanitizeCompanyUpdate(data: any) {
  const sanitized: any = {};
  const protectedFields = ['id', 'createdAt', 'updatedAt', 'createdBy', 'isSuperAdmin'];
  for (const [key, value] of Object.entries(data)) {
    if (!protectedFields.includes(key) && WROTE_FIELDS.includes(key as any)) {
      if (key === 'companyStartDate' || key === 'companyExpiryDate') {
        sanitized[key] = value === '' ? null : value ? new Date(value as string) : null;
      } else {
        sanitized[key] = value === '' ? null : value;
      }
    }
  }
  return sanitized;
}

router.get('/companies', async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const sortField = ALLOWED_SORT_FIELDS.includes(sortBy as string) ? sortBy as string : 'createdAt';
    const sortDir = ALLOWED_SORT_ORDERS.includes(sortOrder as string) ? sortOrder as 'asc' | 'desc' : 'desc';

    const where: any = {};
    if (isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true';
    }
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { companyCode: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { country: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        include: {
          _count: { select: { users: true } },
        },
        skip,
        take: limitNum,
        orderBy: { [sortField]: sortDir },
      }),
      prisma.tenant.count({ where }),
    ]);

    const tenantsWithLifecycle = tenants.map((t) => ({
      ...t,
      lifecycleStatus: getCompanyLifecycleStatus(t),
    }));

    res.json({
      success: true,
      data: tenantsWithLifecycle,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch companies' });
  }
});

router.get('/companies/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid company ID' });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            roles: true,
            leads: true,
            projects: true,
          },
        },
      },
    });

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const adminProfiles = await prisma.profile.findMany({
      where: { tenantId: id, isAdmin: true },
      select: { id: true },
    });
    const adminProfileIds = adminProfiles.map((p) => p.id);
    const adminUserCount = adminProfileIds.length > 0
      ? await prisma.user.count({
          where: { tenantId: id, isActive: true, isSuperAdmin: false, profileId: { in: adminProfileIds } },
        })
      : 0;

    res.json({
      success: true,
      data: {
        ...tenant,
        lifecycleStatus: getCompanyLifecycleStatus(tenant),
        adminUserCount,
      },
    });
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch company' });
  }
});

router.get('/companies/:id/statistics/:type', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid company ID' });
    }

    const parsedType = companyStatisticTypeSchema.safeParse(req.params.type);
    if (!parsedType.success) {
      return res.status(400).json({ success: false, error: 'Invalid company statistics type' });
    }

    const tenantExists = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
    if (!tenantExists) return res.status(404).json({ success: false, error: 'Company not found' });

    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const requestedLimit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return res.status(400).json({ success: false, error: 'Page and limit must be positive integers' });
    }
    const limit = Math.min(100, requestedLimit);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 200) : '';
    const terms = searchTerms(search);
    const skip = (page - 1) * limit;

    switch (parsedType.data) {
      case 'users': {
        const where: Prisma.UserWhereInput = {
          tenantId: id,
          isSuperAdmin: false,
          ...(terms.length ? {
            AND: terms.map((term) => ({
              OR: [
                { firstName: { contains: term, mode: 'insensitive' as const } },
                { lastName: { contains: term, mode: 'insensitive' as const } },
                { email: { contains: term, mode: 'insensitive' as const } },
                { profile: { is: { name: { contains: term, mode: 'insensitive' as const } } } },
                { roles: { some: { role: { name: { contains: term, mode: 'insensitive' as const } } } } },
              ],
            })),
          } : {}),
        };
        const [users, total] = await Promise.all([
          prisma.user.findMany({
            where,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              isActive: true,
              profile: { select: { name: true } },
              roles: { select: { role: { select: { name: true } } } },
            },
            skip,
            take: limit,
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          }),
          prisma.user.count({ where }),
        ]);
        return res.json({
          success: true,
          data: users.map((user) => ({
            id: user.id,
            name: `${user.firstName} ${user.lastName}`.trim(),
            email: user.email,
            isActive: user.isActive,
            profile: user.profile?.name || 'No profile',
            roles: user.roles.map(({ role }) => role.name),
          })),
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
      }
      case 'roles': {
        const where: Prisma.RoleWhereInput = {
          tenantId: id,
          ...(terms.length ? {
            AND: terms.map((term) => ({
              OR: [
                { name: { contains: term, mode: 'insensitive' as const } },
                { description: { contains: term, mode: 'insensitive' as const } },
              ],
            })),
          } : {}),
        };
        const [roles, total] = await Promise.all([
          prisma.role.findMany({
            where,
            select: { id: true, name: true, description: true, _count: { select: { users: true } } },
            skip,
            take: limit,
            orderBy: { name: 'asc' },
          }),
          prisma.role.count({ where }),
        ]);
        return res.json({
          success: true,
          data: roles.map((role) => ({
            id: role.id,
            name: role.name,
            description: role.description,
            userCount: role._count.users,
          })),
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
      }
      case 'leads': {
        const where: Prisma.LeadWhereInput = {
          tenantId: id,
          ...(terms.length ? {
            AND: terms.map((term) => ({
              OR: [
                { firstName: { contains: term, mode: 'insensitive' as const } },
                { lastName: { contains: term, mode: 'insensitive' as const } },
                { leadNumber: { contains: term, mode: 'insensitive' as const } },
                { company: { contains: term, mode: 'insensitive' as const } },
                { email: { contains: term, mode: 'insensitive' as const } },
                { phone: { contains: term, mode: 'insensitive' as const } },
              ],
            })),
          } : {}),
        };
        const [leads, total] = await Promise.all([
          prisma.lead.findMany({
            where,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              leadNumber: true,
              company: true,
              email: true,
              phone: true,
              status: true,
              createdAt: true,
            },
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
          }),
          prisma.lead.count({ where }),
        ]);
        return res.json({
          success: true,
          data: leads.map((lead) => ({
            id: lead.id,
            name: `${lead.firstName || ''} ${lead.lastName}`.trim(),
            number: lead.leadNumber,
            company: lead.company,
            email: lead.email,
            phone: lead.phone,
            status: lead.status,
            createdAt: lead.createdAt,
          })),
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
      }
      case 'projects': {
        const normalizedSearch = search.toLowerCase();
        const matchingActiveStatus = normalizedSearch === 'active'
          ? true
          : normalizedSearch === 'inactive'
            ? false
            : undefined;
        const matchingUnitCount = /^\d+$/.test(search) ? Number(search) : undefined;
        const where: Prisma.ProjectWhereInput = {
          tenantId: id,
          ...(terms.length ? {
            OR: [
              {
                AND: terms.map((term) => ({
                  OR: [
                    { name: { contains: term, mode: 'insensitive' as const } },
                    { description: { contains: term, mode: 'insensitive' as const } },
                    { address: { contains: term, mode: 'insensitive' as const } },
                    { city: { contains: term, mode: 'insensitive' as const } },
                    { state: { contains: term, mode: 'insensitive' as const } },
                    { zipCode: { contains: term, mode: 'insensitive' as const } },
                    { projectType: { contains: term, mode: 'insensitive' as const } },
                  ],
                })),
              },
              ...(matchingActiveStatus !== undefined ? [{ isActive: matchingActiveStatus }] : []),
              ...(matchingUnitCount !== undefined ? [{ totalUnits: matchingUnitCount }] : []),
            ],
          } : {}),
        };
        const [projects, total] = await Promise.all([
          prisma.project.findMany({
            where,
            select: {
              id: true,
              name: true,
              description: true,
              address: true,
              city: true,
              state: true,
              zipCode: true,
              projectType: true,
              totalUnits: true,
              isActive: true,
            },
            skip,
            take: limit,
            orderBy: { name: 'asc' },
          }),
          prisma.project.count({ where }),
        ]);
        return res.json({
          success: true,
          data: projects.map((project) => ({
            id: project.id,
            name: project.name,
            description: [project.description, project.address, project.city, project.state, project.zipCode].filter(Boolean).join(', '),
            status: project.isActive ? 'Active' : 'Inactive',
            totalUnits: project.totalUnits,
            projectType: project.projectType,
          })),
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
      }
    }
  } catch (error) {
    console.error('Get company statistics records error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch company records' });
  }
});

router.put('/companies/:id/users/:userId/password', async (req: AuthRequest, res: Response) => {
  try {
    const data = companyUserPasswordSchema.parse(req.body);
    const user = await prisma.user.findFirst({
      where: { id: req.params.userId, tenantId: req.params.id, isSuperAdmin: false },
      select: { id: true },
    });
    if (!user) return res.status(404).json({ success: false, error: 'Company user not found' });

    const passwordHash = await bcrypt.hash(data.password, 12);
    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: req.params.id,
          userId: req.user!.id,
          action: 'UPDATE',
          objectType: 'User',
          objectId: user.id,
          newValues: { passwordReset: true },
        },
      });
    });
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Reset company user password error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset company user password' });
  }
});

router.post('/companies', async (req: AuthRequest, res: Response) => {
  try {
    const rawData = createCompanySchema.parse(req.body);
    const { initialAdmin, ...companyData } = rawData;

    const cleanData = sanitizeCompanyCreate(companyData);

    const existingBySlug = await prisma.tenant.findUnique({
      where: { slug: cleanData.companyCode.toLowerCase().replace(/[_\s]+/g, '-') },
    });
    if (existingBySlug) {
      return res.status(409).json({ success: false, error: 'A company with this code already exists (slug conflict)' });
    }

    const existingByCode = await prisma.tenant.findUnique({
      where: { companyCode: cleanData.companyCode },
    });
    if (existingByCode) {
      return res.status(409).json({ success: false, error: 'Company code already exists' });
    }

    const slug = cleanData.companyCode.toLowerCase().replace(/[_\s]+/g, '-');

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: cleanData.name,
          slug,
          companyCode: cleanData.companyCode,
          email: cleanData.email || null,
          phone: cleanData.phone || null,
          website: cleanData.website || null,
          address: cleanData.address || null,
          city: cleanData.city || null,
          state: cleanData.state || null,
          country: cleanData.country || null,
          postalCode: cleanData.postalCode || null,
          timezone: cleanData.timezone || 'UTC',
          currency: cleanData.currency || 'INR',
          settings: cleanData.settings || {
            timezone: cleanData.timezone || 'UTC',
            currency: cleanData.currency || 'INR',
            dateFormat: 'DD/MM/YYYY',
          },
          description: cleanData.description || null,
          domain: cleanData.domain || null,
          companyStartDate: cleanData.companyStartDate || null,
          companyExpiryDate: cleanData.companyExpiryDate || null,
          createdBy: req.user!.id,
        },
      });

      const { adminProfileId, adminRoleId } = await bootstrapTenant(tx, tenant.id, req.user!.id);
      let adminUser = null;

      if (initialAdmin) {
        const passwordHash = await bcrypt.hash(initialAdmin.password, 12);

        const firstNameParts = (initialAdmin.adminName || initialAdmin.username).split(' ');
        const firstName = firstNameParts[0] || initialAdmin.username;
        const lastName = firstNameParts.slice(1).join(' ') || '';

        adminUser = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: initialAdmin.email.trim().toLowerCase(),
            passwordHash,
            firstName,
            lastName,
            isActive: true,
            profileId: adminProfileId,
            roleId: adminRoleId,
          },
        });
        await tx.userRole.create({
          data: { userId: adminUser.id, roleId: adminRoleId },
        });

        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            userId: req.user!.id,
            action: 'CREATE',
            objectType: 'User',
            objectId: adminUser.id,
            newValues: { email: initialAdmin.email.trim().toLowerCase(), role: 'Initial Admin', linkedCompanyId: tenant.id },
          },
        });
      }

      return { tenant, adminUser };
    });

    await auditLog(
      result.tenant.id,
      req.user!.id,
      'CREATE',
      'Tenant',
      result.tenant.id,
      undefined,
      { name: result.tenant.name, companyCode: result.tenant.companyCode, hasInitialAdmin: !!initialAdmin },
      req.ip,
    );

    res.status(201).json({ success: true, data: result.tenant });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create company error:', error);
    res.status(500).json({ success: false, error: 'Failed to create company' });
  }
});

router.put('/companies/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid company ID' });
    }

    const existingTenant = await prisma.tenant.findUnique({ where: { id } });
    if (!existingTenant) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const rawData = updateCompanySchema.parse(req.body);
    const cleanData = sanitizeCompanyUpdate(rawData);

    if (Object.keys(cleanData).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    if (cleanData.companyCode && cleanData.companyCode !== existingTenant.companyCode) {
      const dup = await prisma.tenant.findUnique({ where: { companyCode: cleanData.companyCode } });
      if (dup) {
        return res.status(409).json({ success: false, error: 'Company code already exists' });
      }
    }

    if (cleanData.companyCode) {
      cleanData.slug = cleanData.companyCode.toLowerCase().replace(/[_\s]+/g, '-');
    }

    cleanData.updatedBy = req.user!.id;

    const tenant = await prisma.tenant.update({
      where: { id },
      data: cleanData,
    });

    const auditChanges: Record<string, any> = {};
    if (cleanData.companyStartDate !== undefined) auditChanges.companyStartDate = { old: existingTenant.companyStartDate, new: cleanData.companyStartDate };
    if (cleanData.companyExpiryDate !== undefined) auditChanges.companyExpiryDate = { old: existingTenant.companyExpiryDate, new: cleanData.companyExpiryDate };

    await auditLog(
      req.user!.tenantId,
      req.user!.id,
      'UPDATE',
      'Tenant',
      tenant.id,
      existingTenant,
      { ...cleanData, ...(Object.keys(auditChanges).length > 0 ? { lifecycleChanges: auditChanges } : {}) },
      req.ip,
    );

    res.json({ success: true, data: tenant });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update company error:', error);
    res.status(500).json({ success: false, error: 'Failed to update company' });
  }
});

router.put('/companies/:id/activate', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid company ID' });
    }

    const existingTenant = await prisma.tenant.findUnique({ where: { id } });
    if (!existingTenant) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    if (existingTenant.isActive) {
      return res.status(400).json({ success: false, error: 'Company is already active' });
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { isActive: true, updatedBy: req.user!.id },
    });

    await auditLog(
      req.user!.tenantId,
      req.user!.id,
      'STATUS_CHANGE',
      'Tenant',
      tenant.id,
      { isActive: false },
      { isActive: true },
      req.ip,
    );

    res.json({ success: true, data: tenant });
  } catch (error) {
    console.error('Activate company error:', error);
    res.status(500).json({ success: false, error: 'Failed to activate company' });
  }
});

router.put('/companies/:id/deactivate', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid company ID' });
    }

    const existingTenant = await prisma.tenant.findUnique({ where: { id } });
    if (!existingTenant) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    if (!existingTenant.isActive) {
      return res.status(400).json({ success: false, error: 'Company is already inactive' });
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { isActive: false, updatedBy: req.user!.id },
    });

    await auditLog(
      req.user!.tenantId,
      req.user!.id,
      'STATUS_CHANGE',
      'Tenant',
      tenant.id,
      { isActive: true },
      { isActive: false },
      req.ip,
    );

    res.json({ success: true, data: tenant });
  } catch (error) {
    console.error('Deactivate company error:', error);
    res.status(500).json({ success: false, error: 'Failed to deactivate company' });
  }
});

router.delete('/companies/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid company ID' });
    }

    const existingTenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            leads: true,
            projects: true,
            followUps: true,
            activities: true,
            auditLogs: true,
            reports: true,
            dashboards: true,
            workflows: true,
            automations: true,
            notifications: true,
            roles: true,
            profiles: true,
            queues: true,
            aiConversations: true,
            objectDefinitions: true,
            customRecords: true,
            newPermissionSets: true,
            permissionSets: true,
            siteVisits: true,
            units: true,
          },
        },
      },
    });

    if (!existingTenant) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const totalRecords = Object.values(existingTenant._count).reduce((a, b) => a + b, 0);
    if (totalRecords > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete company with ${totalRecords} associated record(s). Deactivate instead.`,
      });
    }

    if (existingTenant.logo) {
      deleteFile(getLogoPath(existingTenant.logo));
    }

    await prisma.tenant.delete({ where: { id } });

    res.json({ success: true, message: 'Company deleted successfully' });
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete company' });
  }
});

router.post('/companies/:id/logo', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid company ID' });
    }

    const existingTenant = await prisma.tenant.findUnique({ where: { id } });
    if (!existingTenant) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const uploadSingle = upload.single('logo');
    uploadSingle(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, error: 'File size exceeds 5MB limit' });
          }
          return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
        }
        return res.status(400).json({ success: false, error: err.message || 'File upload failed' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file provided' });
      }

      const validation = validateFile(req.file);
      if (!validation.valid) {
        deleteFile(req.file.path);
        return res.status(400).json({ success: false, error: validation.error });
      }

      if (existingTenant.logo) {
        deleteFile(getLogoPath(existingTenant.logo));
      }

      const tenant = await prisma.tenant.update({
        where: { id },
        data: { logo: req.file.filename, updatedBy: req.user!.id },
      });

      await auditLog(
        req.user!.tenantId,
        req.user!.id,
        existingTenant.logo ? 'LOGO_REPLACE' : 'LOGO_UPLOAD',
        'Tenant',
        tenant.id,
        { logo: existingTenant.logo },
        { logo: req.file.filename },
        req.ip,
      );

      res.json({ success: true, data: { logo: req.file.filename } });
    });
  } catch (error) {
    console.error('Upload logo error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload logo' });
  }
});

router.delete('/companies/:id/logo', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid company ID' });
    }

    const existingTenant = await prisma.tenant.findUnique({ where: { id } });
    if (!existingTenant) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    if (!existingTenant.logo) {
      return res.status(400).json({ success: false, error: 'No logo to remove' });
    }

    deleteFile(getLogoPath(existingTenant.logo));

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { logo: null, updatedBy: req.user!.id },
    });

    await auditLog(
      req.user!.tenantId,
      req.user!.id,
      'LOGO_REMOVE',
      'Tenant',
      tenant.id,
      { logo: existingTenant.logo },
      { logo: null },
      req.ip,
    );

    res.json({ success: true, message: 'Logo removed successfully' });
  } catch (error) {
    console.error('Remove logo error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove logo' });
  }
});

router.get('/companies/:id/capacity', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid company ID' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const activeUsers = await prisma.user.count({
      where: { tenantId: id, isActive: true, isSuperAdmin: false },
    });

    const profiles = await prisma.profile.findMany({
      where: { tenantId: id },
      select: { id: true, name: true, isAdmin: true },
    });

    const grouped = await prisma.user.groupBy({
      by: ['profileId'],
      where: { tenantId: id, isActive: true, isSuperAdmin: false, profileId: { not: null } },
      _count: { id: true },
    });

    const profileMap = new Map(profiles.map(p => [p.id, p]));
    const profileBreakdown = grouped
      .map(g => {
        const profile = profileMap.get(g.profileId!);
        return { profileId: g.profileId, profileName: profile?.name ?? 'Unknown', isAdmin: profile?.isAdmin ?? false, count: g._count.id };
      })
      .concat(profiles
        .filter(p => !grouped.some(g => g.profileId === p.id))
        .map(p => ({ profileId: p.id, profileName: p.name, isAdmin: p.isAdmin, count: 0 }))
      );

    const adminUsers = profileBreakdown
      .filter((p) => p.isAdmin)
      .reduce((sum, p) => sum + p.count, 0);

    const noProfileUsers = activeUsers - profileBreakdown.reduce((sum, p) => sum + p.count, 0);

    res.json({
      success: true,
      data: {
        maxTotalUsers: tenant.maxTotalUsers,
        maxAdminUsers: tenant.maxAdminUsers,
        currentTotalUsers: activeUsers,
        currentAdminUsers: adminUsers,
        availableSlots: Math.max(0, tenant.maxTotalUsers - activeUsers),
        availableAdminSlots: Math.max(0, tenant.maxAdminUsers - adminUsers),
        profileBreakdown: profileBreakdown.filter((p) => p.count > 0),
        noProfileUsers,
        package: {
          name: tenant.packageName,
          status: tenant.packageStatus,
          startDate: tenant.packageStartDate,
          expiryDate: tenant.packageExpiryDate,
          notes: tenant.packageNotes,
        },
      },
    });
  } catch (error) {
    console.error('Get capacity error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch capacity' });
  }
});

const updateCapacitySchema = z.object({
  maxTotalUsers: z.number().int().min(1).max(10000).optional(),
  maxAdminUsers: z.number().int().min(0).max(10000).optional(),
});

router.put('/companies/:id/capacity', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid company ID' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const data = updateCapacitySchema.parse(req.body);

    const updateData: Record<string, any> = {};
    if (data.maxTotalUsers !== undefined) updateData.maxTotalUsers = data.maxTotalUsers;
    if (data.maxAdminUsers !== undefined) updateData.maxAdminUsers = data.maxAdminUsers;

    const updated = await prisma.tenant.update({ where: { id }, data: updateData });

    await prisma.auditLog.create({
      data: {
        tenantId: id,
        userId: req.user!.id,
        action: 'UPDATE',
        objectType: 'Tenant',
        objectId: id,
        oldValues: { maxTotalUsers: tenant.maxTotalUsers, maxAdminUsers: tenant.maxAdminUsers },
        newValues: updateData,
      },
    });

    res.json({
      success: true,
      data: {
        maxTotalUsers: updated.maxTotalUsers,
        maxAdminUsers: updated.maxAdminUsers,
      },
      message: data.maxTotalUsers !== undefined && data.maxTotalUsers < tenant.maxTotalUsers
        ? 'Current users may exceed the new limit. New user creation is blocked until usage is within the configured limit.'
        : undefined,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update capacity error:', error);
    res.status(500).json({ success: false, error: 'Failed to update capacity' });
  }
});

const updatePackageSchema = z.object({
  packageName: z.string().nullable().optional(),
  packageStatus: z.enum(['active', 'inactive', 'trial', 'expired']).optional(),
  packageStartDate: z.string().nullable().optional(),
  packageExpiryDate: z.string().nullable().optional(),
  packageNotes: z.string().nullable().optional(),
});

router.put('/companies/:id/package', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid company ID' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const rawData = updatePackageSchema.parse(req.body);
    const updateData: Record<string, any> = {};
    if (rawData.packageName !== undefined) updateData.packageName = rawData.packageName;
    if (rawData.packageStatus !== undefined) updateData.packageStatus = rawData.packageStatus;
    if (rawData.packageStartDate !== undefined) updateData.packageStartDate = rawData.packageStartDate ? new Date(rawData.packageStartDate) : null;
    if (rawData.packageExpiryDate !== undefined) updateData.packageExpiryDate = rawData.packageExpiryDate ? new Date(rawData.packageExpiryDate) : null;
    if (rawData.packageNotes !== undefined) updateData.packageNotes = rawData.packageNotes;

    const updated = await prisma.tenant.update({ where: { id }, data: updateData });

    await prisma.auditLog.create({
      data: {
        tenantId: id,
        userId: req.user!.id,
        action: 'UPDATE',
        objectType: 'Tenant',
        objectId: id,
        oldValues: { packageName: tenant.packageName, packageStatus: tenant.packageStatus },
        newValues: updateData,
      },
    });

    res.json({
      success: true,
      data: {
        packageName: updated.packageName,
        packageStatus: updated.packageStatus,
        packageStartDate: updated.packageStartDate,
        packageExpiryDate: updated.packageExpiryDate,
        packageNotes: updated.packageNotes,
      },
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update package error:', error);
    res.status(500).json({ success: false, error: 'Failed to update package' });
  }
});

export { router as companyRoutes };
