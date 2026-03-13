/**
 * src/services/api.ts
 *
 * Centralised API service layer for NeverMiss.
 * All HTTP calls to the PHP backend live here so components stay clean.
 *
 * The Vite dev server proxies "/api/*" → "http://localhost/NeverMiss/api/*".
 * In production (XAMPP static host) the relative path resolves directly.
 */

// ── Base URL ──────────────────────────────────────────────────────────────────
// During Vite dev: proxied → http://localhost/NeverMiss/api
// In production, you can override with VITE_API_BASE (e.g. https://api.example.com/api).
const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

// ── Shared Opportunity type ───────────────────────────────────────────────────
export interface DBOpportunity {
  id: string;
  company: string;
  role: string;
  deadline: string | null; // YYYY-MM-DD or null
  link: string | null;
  source: string;
  category: 'Internship' | 'Hackathon' | 'Scholarship' | 'Job';
  status: 'Not Applied' | 'Applied' | 'Rejected' | 'Accepted';
  created_at: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

// ── Generic request helper ────────────────────────────────────────────────────
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  const raw = await res.text();
  let json: any = null;

  if (raw.trim().length > 0) {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON response from ${endpoint}. Raw: ${raw.slice(0, 200)}`);
    }
  }

  if (!res.ok || (json && json.success === false)) {
    throw new Error((json?.error ?? raw) || `HTTP ${res.status}`);
  }

  if (!json) {
    throw new Error(`Empty response from ${endpoint}`);
  }

  return json as T;
}

// ── API Functions ─────────────────────────────────────────────────────────────

/**
 * Fetch all opportunities, ordered by deadline (soonest first).
 * Optional status filter: 'Applied' | 'Not Applied'
 */
export async function fetchOpportunities(
  params?: {
    status?: DBOpportunity['status'];
    category?: DBOpportunity['category'];
    deadline_before?: string;
  }
): Promise<DBOpportunity[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.category) query.set('category', params.category);
  if (params?.deadline_before) query.set('deadline_before', params.deadline_before);
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await request<{ success: true; data: DBOpportunity[] }>(
    `getOpportunities.php${qs}`
  );
  return res.data;
}

/**
 * Add a new opportunity to the database.
 * Returns the newly created row's id.
 */
export async function addOpportunity(
  payload: Omit<DBOpportunity, 'id' | 'created_at'>
): Promise<string> {
  const res = await request<{ success: true; id: string }>(
    'addOpportunity.php',
    { method: 'POST', body: JSON.stringify(payload) }
  );
  return res.id;
}

/**
 * Send pasted text / URL to the PHP extractor.
 * Returns partially-filled opportunity fields.
 */
export async function extractOpportunity(
  text: string
): Promise<Partial<DBOpportunity>> {
  const res = await request<{ success: true; data: Partial<DBOpportunity> }>(
    'extractOpportunity.php',
    { method: 'POST', body: JSON.stringify({ text }) }
  );
  return res.data;
}

/**
 * Update the application status of an opportunity.
 */
export async function updateStatus(
  id: string,
  status: DBOpportunity['status']
): Promise<void> {
  await request('updateStatus.php', {
    method: 'PATCH',
    body: JSON.stringify({ id, status }),
  });
}

/**
 * Delete an opportunity permanently.
 */
export async function deleteOpportunity(id: string): Promise<void> {
  await request('deleteOpportunity.php', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  });
}

export async function registerUser(payload: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  const res = await request<{ success: true; user: AuthUser }>('register.php', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.user;
}

export async function loginUser(payload: {
  email: string;
  password: string;
}): Promise<AuthUser> {
  const res = await request<{ success: true; user: AuthUser }>('login.php', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.user;
}
