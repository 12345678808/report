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

// Same as request(), but for multipart/form-data (file upload) bodies — no
// Content-Type header here, since the browser must set its own boundary=...
// value on FormData requests; setting it manually breaks the upload.
async function requestForm(path, formData) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body
  }
  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body;
}

export const api = {
  login: (username, password, role) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, role }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  zones: () => request('/kpi/zones'),
  // from/to together describe the selected date range — a single selected
  // date is just from === to, the backend sums across the range either way.
  common: (from, to) => request(`/kpi/common?from=${from}&to=${to}`),
  zoneItems: (zoneId, from, to) => request(`/kpi/zone/${zoneId}?from=${from}&to=${to}`),
  // Real day-by-day figures for the Analytics modal's trend chart — every
  // date actually logged within [fromDate, toDate], nothing fabricated.
  kpiHistory: ({ kpiItemId, zoneId, fromDate, toDate }) => {
    const params = new URLSearchParams({ kpiItemId, fromDate, toDate });
    if (zoneId) params.set('zoneId', zoneId);
    return request(`/kpi/history?${params.toString()}`);
  },
  saveEntry: (payload) => request('/kpi/entry', { method: 'PUT', body: JSON.stringify(payload) }),
  addKpiItem: (payload) => request('/kpi/items', { method: 'POST', body: JSON.stringify(payload) }),
  deleteKpiItem: (id) => request(`/kpi/items/${id}`, { method: 'DELETE' }),
  getColumns: () => request('/kpi/columns'),
  addColumn: (name) => request('/kpi/columns', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteColumn: (id) => request(`/kpi/columns/${id}`, { method: 'DELETE' }),
  // Admin "Sync Data" — pulls target/achievement figures from the CCMC
  // master-register spreadsheet (Google Sheet tab, or an uploaded .xlsx of
  // the same shape) into the app, matched by Department + Report name.
  syncGoogleSheet: ({ tabName, date, sheetUrl }) =>
    request('/admin/sync/google-sheet', { method: 'POST', body: JSON.stringify({ tabName, date, sheetUrl }) }),
  syncExcel: (file, date) => {
    const form = new FormData();
    form.append('file', file);
    form.append('date', date);
    return requestForm('/admin/sync/excel', form);
  },
};
