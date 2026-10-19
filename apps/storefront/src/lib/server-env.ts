import 'server-only';
import { z } from 'zod';

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PAYMENT_PROVIDER_MODE: z.enum(['mock']).default('mock'),
  WAREHOUSE_PROVIDER_MODE: z.enum(['mock']).default('mock'),
});

/** Server-only secrets. Importing this from a client component fails the build. */
export function getServerEnv() {
  return serverSchema.parse(process.env);
}
