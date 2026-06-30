import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const env = {
  port: parseInt(process.env.PORT || '8000', 10),
  nvidiaApiKey: process.env.NVIDIA_API_KEY || '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',
  nvidiaModel: process.env.NVIDIA_MODEL || 'qwen/qwen3.5-122b-a10b',
  nvidiaBaseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  corsOrigins: process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000',
  environment: process.env.ENVIRONMENT || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://communityhero:communityhero_dev@localhost:5432/communityhero',
};
