import 'server-only';
import { z } from 'zod';

/** Server-only secrets. Importing this from a client component fails the build. */
export const serverEnv = z
  .object({
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    PAYMENT_PROVIDER_MODE: z.enum(['mock']).default('mock'),
    WAREHOUSE_PROVIDER_MODE: z.enum(['mock']).default('mock'),
  })
  .parse(process.env);
