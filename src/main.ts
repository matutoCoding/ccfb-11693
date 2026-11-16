// ---------- 入口: 导航 + hash 路由 ----------
import './style.css';
import { renderPatternsPage } from './ui/patterns';
import { renderEditorPage } from './ui/editor';
import { renderYarnsPage } from './ui/yarns';
import { renderPreviewPage } from './ui/preview';
import { renderComparePage } from './ui/compare';
import { renderSettingsPage } from './ui/settings';
import { el } from './ui/common';

const NAV: [string, string][] = [
  ['#/patterns', '花型'],
  ['#/yarns', '纱线库'],
  ['#/compare', '对比'],
  ['#/settings', '设置'],
];

function route() {
  const app = document.getElementById('app')!;
  app.replaceChildren();

  const nav = el('nav', { class: 'topnav' }, el('span', { class: 'logo' }, '提花组织设计'));
  for (const [hash, label] of NAV) {
    const a = el('a', { href: hash }, label);
    if (location.hash.startsWith(hash)) a.className = 'active';
    nav.append(a);
  }
  const main = el('main', {});
  app.append(nav, main);

  const hash = location.hash || '#/patterns';
  const [, page, arg] = hash.split('/');
  try {
    switch (page) {
      case 'weave': renderEditorPage(main, arg ?? ''); break;
      case 'preview': renderPreviewPage(main, arg ?? ''); break;
      case 'yarns': renderYarnsPage(main); break;
      case 'compare': renderComparePage(main); break;
      case 'settings': renderSettingsPage(main); break;
      default: renderPatternsPage(main);
    }
  } catch (e) {
    main.append(el('p', { class: 'bad' }, '页面错误: ' + (e as Error).message));
    console.error(e);
  }
}

window.addEventListener('hashchange', route);
route();
