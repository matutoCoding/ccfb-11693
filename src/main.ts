// 应用入口:侧边导航 + 路由装配
import './styles.css';
import { store } from './core/store';
import { h } from './ui/dom';
import { currentRoute, onRouteChange, navigate, type Route } from './ui/router';
import { renderPatternsPage } from './ui/pages/patterns';
import { renderEditorPage, disposeEditor } from './ui/pages/editor';
import { renderPreviewPage, disposePreview } from './ui/pages/preview';
import { renderYarnsPage } from './ui/pages/yarns';
import { renderComparePage, disposeCompare } from './ui/pages/compare';
import { renderSettingsPage } from './ui/pages/settings';

const NAV: Array<{ route: Route; label: string; icon: string }> = [
  { route: 'patterns', label: '花型列表', icon: '▦' },
  { route: 'editor', label: '组织设计', icon: '✎' },
  { route: 'yarns', label: '纱线库', icon: '◉' },
  { route: 'preview', label: '织物预览', icon: '◈' },
  { route: 'compare', label: '对比', icon: '⇔' },
  { route: 'settings', label: '设置', icon: '⚙' },
];

function main(): void {
  store.init();
  const app = document.getElementById('app')!;

  const navItems = new Map<Route, HTMLElement>();
  const sidebar = h('div', { class: 'sidebar' },
    h('div', { class: 'brand' }, '提花工作室', h('small', {}, 'Jacquard Studio · WebGL2')),
  );
  for (const item of NAV) {
    const el = h('div', { class: 'nav-item', onclick: () => navigate(item.route) },
      h('span', { class: 'icon' }, item.icon),
      h('span', {}, item.label),
    );
    navItems.set(item.route, el);
    sidebar.append(el);
  }
  sidebar.append(h('div', { class: 'foot' }, '数据保存在本地浏览器\nTypeScript + WebGL2'));

  const mainEl = h('div', { class: 'main' });
  const pageEl = h('div', { class: 'page' });
  mainEl.append(pageEl);
  app.append(sidebar, mainEl);

  let current: Route | null = null;
  const render = (route: Route) => {
    if (route === current) return;
    // 离开 3D 页面时释放 GL 资源
    if (current === 'preview') disposePreview();
    if (current === 'compare') disposeCompare();
    if (current === 'editor') disposeEditor();

    current = route;
    for (const [r, el] of navItems) el.classList.toggle('active', r === route);
    pageEl.innerHTML = '';

    if (!store.activePattern && (route === 'editor' || route === 'preview')) {
      navigate('patterns');
      return;
    }

    switch (route) {
      case 'patterns':
        renderPatternsPage(pageEl);
        break;
      case 'editor':
        renderEditorPage(pageEl);
        break;
      case 'yarns':
        renderYarnsPage(pageEl);
        break;
      case 'preview':
        renderPreviewPage(pageEl);
        break;
      case 'compare':
        renderComparePage(pageEl);
        break;
      case 'settings':
        renderSettingsPage(pageEl);
        break;
    }
  };

  onRouteChange(render);
  render(currentRoute());

  // 全局 store 变更后刷新非 3D 页面(3D 页面通过 FabricView 自行订阅)
  store.subscribe(() => {
    const route = currentRoute();
    if (route === 'patterns' || route === 'yarns' || route === 'settings') {
      current = null as unknown as Route;
      render(route);
    }
  });
}

main();
