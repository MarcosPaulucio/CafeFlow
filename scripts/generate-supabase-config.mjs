import { writeFile } from 'node:fs/promises';
import { isPublishableSupabaseKey } from '../js/supabase-key.mjs';

const url = process.env.SUPABASE_URL?.trim();
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

if (!url || !publishableKey) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY nas variáveis de ambiente da Vercel.');
}

let projectUrl;
try {
  projectUrl = new URL(url);
} catch {
  throw new Error('SUPABASE_URL não contém uma URL válida.');
}

if (projectUrl.protocol !== 'https:' || !isPublishableSupabaseKey(publishableKey)) {
  throw new Error('Use uma URL HTTPS e uma chave publishable/anon do Supabase; nunca use secret ou service_role.');
}

const config = `export const supabaseConfig = Object.freeze(${JSON.stringify({ url, publishableKey })});\n`;
await writeFile(new URL('../js/supabase-config.js', import.meta.url), config, 'utf8');
