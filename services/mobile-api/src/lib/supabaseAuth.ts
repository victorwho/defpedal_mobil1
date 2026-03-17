import { createClient } from '@supabase/supabase-js';

import { config } from '../config';

export const supabaseAuthClient =
  config.supabaseUrl && config.supabaseAnonKey
    ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;
