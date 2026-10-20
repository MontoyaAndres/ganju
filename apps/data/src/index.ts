// The Worker that holds every project's database: the ProjectDatabase class
// and nothing else. It has no public routes; apps/api, apps/mcp and
// apps/tool-broker reach the objects through a `script_name` binding, and a
// customer's script has no binding at all.
export { ProjectDatabase } from './projectDatabase';

export default {
  fetch: () => new Response('Not found', { status: 404 })
};
