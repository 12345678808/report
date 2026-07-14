const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body (e.g. 204)
  }
  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body;
}

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  zones: () => request('/kpi/zones'),
  // from/to together describe the selected date range — a single selected
  // date is just from === to, the backend sums across the range either way.
  common: (from, to) => request(`/kpi/common?from=${from}&to=${to}`),
  zoneItems: (zoneId, from, to) => request(`/kpi/zone/${zoneId}?from=${from}&to=${to}`),
  saveEntry: (payload) => request('/kpi/entry', { method: 'PUT', body: JSON.stringify(payload) }),
  addKpiItem: (payload) => request('/kpi/items', { method: 'POST', body: JSON.stringify(payload) }),
  deleteKpiItem: (id) => request(`/kpi/items/${id}`, { method: 'DELETE' }),
  getColumns: () => request('/kpi/columns'),
  addColumn: (name) => request('/kpi/columns', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteColumn: (id) => request(`/kpi/columns/${id}`, { method: 'DELETE' }),
};
