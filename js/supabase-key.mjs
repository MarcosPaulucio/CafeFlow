export function isPublishableSupabaseKey(value) {
  if (typeof value !== 'string') return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;

  const parts = value.split('.');
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const encodedPayload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(encodedPayload.padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=')));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}
