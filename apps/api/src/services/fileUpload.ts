import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/auth';

const UPLOAD_DIR = path.resolve(__dirname, '../../../uploads/logos');
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
export const PROJECT_LAYOUT_UPLOAD_DIR = path.join(UPLOAD_DIR, 'project-layouts');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(PROJECT_LAYOUT_UPLOAD_DIR)) {
  fs.mkdirSync(PROJECT_LAYOUT_UPLOAD_DIR, { recursive: true });
}

export function generateProjectLayoutFilename(originalFilename: string): string {
  const ext = path.extname(originalFilename).toLowerCase();
  return `layout_${crypto.randomBytes(16).toString('hex')}${ext}`;
}

export function getProjectLayoutPath(storageKey: string): string {
  if (!/^layout_[a-f0-9]{32}\.(?:png|jpe?g|pdf)$/i.test(storageKey)) {
    throw new Error('Invalid project layout storage key');
  }
  return path.join(PROJECT_LAYOUT_UPLOAD_DIR, storageKey);
}

function generateSafeFilename(originalFilename: string): string {
  const ext = path.extname(originalFilename).toLowerCase();
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `logo_${timestamp}_${randomBytes}${ext}`;
}

function validateFile(file: Express.Multer.File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` };
  }

  if (!ALLOWED_MIMES.includes(file.mimetype)) {
    return { valid: false, error: `MIME type not allowed: ${file.mimetype}` };
  }

  const dangerousPatterns = ['.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif', '.js', '.vbs', '.wsf', '.php', '.pl', '.py', '.rb'];
  const lowerName = file.originalname.toLowerCase();
  for (const pattern of dangerousPatterns) {
    if (lowerName.includes(pattern)) {
      return { valid: false, error: 'Potentially dangerous file detected' };
    }
  }

  return { valid: true };
}

function deleteFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function getLogoPath(filename: string): string {
  return path.join(UPLOAD_DIR, filename);
}

function serveLogo(req: AuthRequest, res: Response): void {
  const { filename } = req.params;

  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    res.status(400).json({ success: false, error: 'Invalid filename' });
    return;
  }

  const safeName = path.basename(filename);
  const filePath = getLogoPath(safeName);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  const ext = path.extname(safeName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };

  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(filePath).pipe(res);
}

export { validateFile, generateSafeFilename, deleteFile, getLogoPath, serveLogo, UPLOAD_DIR, MAX_FILE_SIZE, ALLOWED_MIMES, ALLOWED_EXTENSIONS };
