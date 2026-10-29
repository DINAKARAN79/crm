import dotenv from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';

const envPath = [
  process.env.DOTENV_CONFIG_PATH,
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../../../../../.env'),
].find((candidate): candidate is string => !!candidate && existsSync(candidate));

if (envPath) dotenv.config({ path: envPath });