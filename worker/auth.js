/**
 * Google OAuth Auth Worker
 * Routes: /auth/google, /auth/callback, /auth/logout, /auth/me
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    try {
      if (path === '/auth/google') {
        return handleGoogleAuth(url, env);
      }
      if (path === '/auth/callback') {
        return await handleCallback(request, url, env);
      }
      if (path === '/auth/me') {
        return await handleMe(request, env);
      }
      if (path === '/auth/logout') {
        return handleLogout();
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error('Auth error:', err);
      return jsonResponse({ error: err.message }, 500);
    }
  }
};

// ------------------- Handlers -------------------

function handleGoogleAuth(url, env) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const redirectUri = `${url.origin}/auth/callback`;
  const state = generateState();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return Response.redirect(authUrl, 302);
}

async function handleCallback(request, url, env) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return jsonResponse({ error: `Google auth error: ${error}` }, 400);
  }

  if (!code) {
    return jsonResponse({ error: 'Missing code' }, 400);
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    return jsonResponse({ error: 'Failed to get access token', detail: tokens }, 400);
  }

  // Get user info
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userInfo = await userRes.json();

  // Upsert user in D1
  const userId = generateId();
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO users (id, google_id, email, name, picture, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(google_id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      picture = excluded.picture
  `).bind(userId, userInfo.id, userInfo.email, userInfo.name, userInfo.picture || '', now).run();

  // Get the user (in case of conflict, fetch existing)
  let user;
  const { results } = await env.DB.prepare(
    'SELECT * FROM users WHERE google_id = ?'
  ).bind(userInfo.id).all();
  user = results[0];

  // Create session token
  const sessionToken = generateId();
  const sessionExpiry = now + 30 * 24 * 60 * 60 * 1000; // 30 days

  await env.DB.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).bind(sessionToken, user.id, sessionExpiry).run();

  // Return HTML with session token (simple redirect page)
  const html = `<!DOCTYPE html>
<html>
<head><title>Login Success</title></head>
<body>
  <script>
    const token = "${sessionToken}";
    localStorage.setItem('session_token', token);
    localStorage.setItem('user', JSON.stringify(${JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture
    })}));
    window.location.href = "/?logged_in=1";
  </script>
  <p>登录成功，正在跳转...</p>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

async function handleMe(request, env) {
  const token = extractToken(request);
  if (!token) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { results } = await env.DB.prepare(`
    SELECT u.id, u.email, u.name, u.picture, u.created_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `).bind(token, Date.now()).all();

  if (results.length === 0) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401);
  }

  return jsonResponse({ user: results[0] });
}

function handleLogout() {
  const html = `<!DOCTYPE html>
<html>
<body>
  <script>
    localStorage.removeItem('session_token');
    localStorage.removeItem('user');
    window.location.href = "/?logged_out=1";
  </script>
</body>
</html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

// ------------------- Utils -------------------

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function extractToken(request) {
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}

function generateId() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

function generateState() {
  return generateId();
}
