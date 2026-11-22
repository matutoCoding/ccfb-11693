// hash 路由
export type Route = 'patterns' | 'editor' | 'yarns' | 'preview' | 'compare' | 'settings';

const ROUTES: Route[] = ['patterns', 'editor', 'yarns', 'preview', 'compare', 'settings'];

export function currentRoute(): Route {
  const r = location.hash.replace('#/', '') as Route;
  return ROUTES.includes(r) ? r : 'patterns';
}

export function navigate(route: Route): void {
  location.hash = '#/' + route;
}

export function onRouteChange(fn: (r: Route) => void): () => void {
  const handler = (): void => fn(currentRoute());
  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}
