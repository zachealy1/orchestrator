import { dashboard, insights } from './dashboard.mjs';

// Run locally only; this administrative credential is never part of the desktop app.
const host = process.env.POSTHOG_APP_HOST ?? 'https://eu.posthog.com';
const project = process.env.POSTHOG_PROJECT_ID ?? '275534';
const dashboardId = process.env.POSTHOG_DASHBOARD_ID ?? '957136';
if (!/^\d+$/.test(project) || !/^\d+$/.test(dashboardId)) throw new Error('Project and dashboard IDs must be numeric');
const origin = new URL(host);
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('POSTHOG_APP_HOST must be an HTTPS origin');
}
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ dashboardId, dashboard, insights }, null, 2));
} else {
  const token = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!token) throw new Error('Set POSTHOG_PERSONAL_API_KEY in your local environment; never commit it or pass it to app builds');
  const base = `${origin.origin}/api/projects/${project}/`;
  async function request(path, method = 'GET', body) {
    const url = new URL(path, base);
    if (url.origin !== origin.origin || !url.pathname.startsWith(`/api/projects/${project}/`)) throw new Error('Unexpected API pagination destination');
    const response = await fetch(url, {
      method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).catch(() => { throw new Error('PostHog request failed; credentials and response details withheld'); });
    if (!response.ok) throw new Error(`PostHog returned HTTP ${response.status}; response details withheld`);
    return response.json();
  }
  // Validate every SQL query before changing saved content.
  for (const insight of insights) await request('query/', 'POST', { query: insight.query.source });
  await request(`dashboards/${dashboardId}/`, 'PATCH', dashboard);
  const existing = [];
  let next = `insights/?dashboards=${dashboardId}&limit=100`;
  while (next) {
    const page = await request(next);
    existing.push(...page.results);
    next = page.next;
  }
  for (const insight of insights) {
    const match = existing.find((item) => !item.deleted && item.name === insight.name);
    if (match) await request(`insights/${match.id}/`, 'PATCH', insight);
    else await request('insights/', 'POST', { ...insight, dashboards: [Number(dashboardId)] });
  }
  const verified = await request(`dashboards/${dashboardId}/`);
  const names = new Set((verified.tiles ?? []).map((tile) => tile.insight?.name));
  if (!insights.every((insight) => names.has(insight.name))) throw new Error('Dashboard write finished, but all four saved tiles could not be verified');
  console.log(`${origin.origin}/project/${project}/dashboard/${dashboardId}`);
}
