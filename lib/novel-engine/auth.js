// lib/novel-engine/auth.js
// Verifies a Supabase session access token server-side, instead of trusting
// a client-supplied userId. Any request that claims to act as a given user
// must present that user's own valid Supabase JWT in the Authorization
// header, or it's rejected -- the claimed userId is no longer taken on faith.

const SUPABASE_URL = (process.env.supabase_url || process.env.SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/, '');
const SUPABASE_SERVICE_KEY = process.env.supabase_ret_key || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Returns the verified user id for the bearer token on this request, or
// null if the header is missing or the token doesn't check out. Never
// throws -- callers decide what an unverified request means for them.
export async function getVerifiedUserId(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!token) return null;

  try {
    const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_SERVICE_KEY,
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user && user.id ? user.id : null;
  } catch (err) {
    console.error('[auth] token verification failed', err);
    return null;
  }
}

// Verifies the request's bearer token identifies exactly the userId the
// request claims to act as. Returns the verified id on success; sends a
// 401/403 and returns null on failure so the caller can just `return` on
// a null result.
export async function requireMatchingUser(req, res, claimedUserId) {
  const verifiedId = await getVerifiedUserId(req);
  if (!verifiedId) {
    res.status(401).json({ error: 'Missing or invalid session' });
    return null;
  }
  if (verifiedId !== claimedUserId) {
    res.status(403).json({ error: 'Session does not match requested user' });
    return null;
  }
  return verifiedId;
}
