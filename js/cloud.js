import { isPublishableSupabaseKey } from './supabase-key.mjs';

const ACCOUNT_BINDING_KEY = 'cafeflow-account-binding';
const ACTIVE_ACCOUNT_KEY = 'cafeflow-active-account';
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let clientPromise;
let client;

function assertAccountBinding(userId) {
  const boundUserId = localStorage.getItem(ACCOUNT_BINDING_KEY);
  if (boundUserId && boundUserId !== userId) {
    throw new Error('Este aparelho já está vinculado a outra conta CafeFlow. Use a conta do estabelecimento ou exporte seus dados antes de trocar de conta.');
  }
  localStorage.setItem(ACCOUNT_BINDING_KEY, userId);
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, userId);
}

export async function getSupabaseClient() {
  if (client) return client;
  if (!clientPromise) {
    clientPromise = (async () => {
      let configModule;
      try {
        configModule = await import('./supabase-config.js');
      } catch {
        throw new Error('Configuração local ausente. Crie js/supabase-config.js com a URL e a chave publishable do projeto.');
      }
      const config = configModule.supabaseConfig;
      if (!config || typeof config.url !== 'string' || typeof config.publishableKey !== 'string') {
        throw new Error('A configuração local do Supabase está incompleta.');
      }
      let projectUrl;
      try {
        projectUrl = new URL(config.url);
      } catch {
        throw new Error('A URL configurada para o Supabase é inválida.');
      }
      if ((projectUrl.protocol !== 'https:' && projectUrl.hostname !== 'localhost') ||
          !isPublishableSupabaseKey(config.publishableKey)) {
        throw new Error('Use HTTPS e uma chave publishable/anon. Chaves secret ou service_role não podem ser usadas no navegador.');
      }
      const { createClient } = await import(SDK_URL);
      client = createClient(config.url, config.publishableKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true
        }
      });
      return client;
    })().catch(error => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export async function getAuthState() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Não foi possível verificar a sessão: ${error.message}`);
  const session = data.session;
  const boundUserId = localStorage.getItem(ACCOUNT_BINDING_KEY);
  const accountMismatch = Boolean(session?.user?.id && boundUserId && session.user.id !== boundUserId);
  if (session?.user?.id && !accountMismatch) assertAccountBinding(session.user.id);
  return { session, accountMismatch };
}

export function getActiveAccountId() {
  return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
}

export async function signUp(email, password) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: window.location.origin }
  });
  if (error) throw new Error(`Não foi possível criar a conta: ${error.message}`);
  if (data.session?.user?.id) assertAccountBinding(data.session.user.id);
  return data;
}

export async function signIn(email, password) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });
  if (error) throw new Error(`Não foi possível entrar: ${error.message}`);
  try {
    assertAccountBinding(data.user.id);
  } catch (bindingError) {
    await supabase.auth.signOut({ scope: 'local' });
    throw bindingError;
  }
  return data;
}

export async function signOut() {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw new Error(`Não foi possível sair da conta: ${error.message}`);
  localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}
