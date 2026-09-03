/* ============================================================
   Corsen Context shared navigation  - logic (v4)
   Injects nav+footer into [data-cc-nav] / [data-cc-foot].
   Mobile toggle, aria-expanded, Escape, per-stack accent.
   v3: builds every node through the DOM API (createElement /
   textContent / setAttribute) — no innerHTML anywhere, so page
   attributes can never be reinterpreted as HTML (CodeQL
   js/xss-through-dom). href values pass a scheme allowlist.
   ============================================================ */
(function () {
  'use strict';

  var FLAGSHIP = 'https://webmcp.corsen.ai';
  var MAIN_REPO = 'https://github.com/CorsenAI/corsen-context';
  var REPOS = {
    WordPress: 'https://github.com/CorsenAI/corsen-context-wordpress',
    Express: 'https://github.com/CorsenAI/corsen-context-express',
    'Next.js': 'https://github.com/CorsenAI/corsen-context-nextjs',
    Astro: 'https://github.com/CorsenAI/corsen-context-astro',
    'Static HTML': 'https://github.com/CorsenAI/corsen-context-static-html',
    Ghost: 'https://github.com/CorsenAI/corsen-context-ghost',
    Strapi: 'https://github.com/CorsenAI/corsen-context-strapi',
    Directus: 'https://github.com/CorsenAI/corsen-context-directus',
    Wagtail: 'https://github.com/CorsenAI/corsen-context-wagtail',
    MediaWiki: 'https://github.com/CorsenAI/corsen-context-mediawiki',
  };

  function applyAccent(root) {
    var acc = root.getAttribute('data-accent') || '';
    if (acc) root.style.setProperty('--cc-accent', acc);
  }

  /* href allowlist: in-page anchors, root-relative paths, http(s) only. */
  function safeHref(value, fallback) {
    var s = String(value || '').trim();
    if (s.charAt(0) === '#' || s.charAt(0) === '/') return s;
    if (/^https?:\/\//i.test(s)) return s;
    return fallback;
  }

  /* id fragments: [A-Za-z0-9_-] only. */
  function safeId(value) {
    var s = String(value || '').replace(/[^A-Za-z0-9_-]/g, '');
    return s || 'm';
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function link(className, href, text, external) {
    var a = el('a', className, text);
    a.setAttribute('href', safeHref(href, '#top'));
    if (external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    return a;
  }

  var LINKS = [
    { text: 'Live trace', href: '#live' },
    { text: 'How it works', href: '#how' },
    { text: 'All integrations', href: FLAGSHIP + '/#integrations', external: true },
  ];

  function repositoryFor(root, stack) {
    return safeHref(root.getAttribute('data-repository'), REPOS[stack] || MAIN_REPO);
  }

  function appendLinks(container, repository) {
    LINKS.forEach(function (l) {
      container.appendChild(link('cc-nav-link', l.href, l.text, l.external));
    });
    container.appendChild(link('cc-nav-link', repository, 'Get this integration', true));
    container.appendChild(link('cc-nav-cta', FLAGSHIP, 'Flagship', true));
    return container;
  }

  function mount(root) {
    if (!root || root.__ccNavMounted) return;
    root.__ccNavMounted = true;
    applyAccent(root);

    var stack = root.getAttribute('data-stack') || 'Demo';
    var repository = repositoryFor(root, stack);
    var uid = safeId(root.getAttribute('data-uid'));
    var homeHref = safeHref(root.getAttribute('data-home'), '#top');

    var nav = el('div', 'cc-nav');
    var inner = el('div', 'cc-nav-inner');

    var logo = el('a', 'cc-nav-logo');
    logo.setAttribute('href', homeHref);
    var mark = el('span', 'cc-nav-mark');
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = 'C';
    logo.appendChild(mark);
    logo.appendChild(document.createTextNode('Corsen Context'));

    var navEl = el('nav', 'cc-nav-links');
    navEl.setAttribute('aria-label', 'Primary');
    appendLinks(navEl, repository);

    var toggle = el('button', 'cc-nav-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'cc-nav-mobile-' + uid);
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.appendChild(el('span'));
    toggle.appendChild(el('span'));
    toggle.appendChild(el('span'));

    inner.appendChild(logo);
    inner.appendChild(el('span', 'cc-nav-stack', stack));
    inner.appendChild(navEl);
    inner.appendChild(toggle);

    var mobile = el('nav', 'cc-nav-mobile');
    mobile.id = 'cc-nav-mobile-' + uid;
    mobile.setAttribute('aria-label', 'Primary mobile');
    appendLinks(mobile, repository);

    nav.appendChild(inner);
    nav.appendChild(mobile);

    root.textContent = '';
    root.appendChild(nav);

    var toggleBtn = root.querySelector('.cc-nav-toggle');
    var mobileNav = root.querySelector('.cc-nav-mobile');
    if (toggleBtn && mobileNav) {
      toggleBtn.addEventListener('click', function () {
        var open = mobileNav.classList.toggle('is-open');
        toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggleBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      });
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && mobileNav.classList.contains('is-open')) {
          mobileNav.classList.remove('is-open');
          toggleBtn.setAttribute('aria-expanded', 'false');
          toggleBtn.setAttribute('aria-label', 'Open menu');
          toggleBtn.focus();
        }
      });
    }
  }

  function mountFooter(root) {
    if (!root || root.__ccFootMounted) return;
    root.__ccFootMounted = true;
    applyAccent(root);

    var stack = root.getAttribute('data-stack') || 'Demo';
    var repository = repositoryFor(root, stack);

    var wrap = el('div', 'cc-foot-common');

    var linksEl = el('div', 'cc-foot-links');
    linksEl.appendChild(link('', FLAGSHIP, 'Flagship demo', true));
    linksEl.appendChild(link('', repository, 'Download this integration', true));

    wrap.appendChild(linksEl);
    wrap.appendChild(el('div', 'cc-foot-stack', 'Demonstration site — stack: ' + stack));

    var legal = el('div', 'cc-foot-legal');
    legal.appendChild(el('span', '', 'Open-source demo (MIT), built for The WebMCP Challenge.'));
    legal.appendChild(
      el('span', '', 'No form or account is required for this read-only demo; hosting logs may apply.'),
    );
    wrap.appendChild(legal);

    wrap.appendChild(el('span', 'cc-foot-mit', 'MIT License'));

    root.textContent = '';
    root.appendChild(wrap);
  }

  function mountAll() {
    document.querySelectorAll('[data-cc-nav]').forEach(function (node) {
      if (node.querySelector('.cc-nav')) return;
      mount(node);
    });
    document.querySelectorAll('[data-cc-foot]').forEach(function (node) {
      if (node.querySelector('.cc-foot-common')) return;
      mountFooter(node);
    });
  }

  window.CcNav = { mountAll: mountAll, mountFooter: mountFooter };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();
