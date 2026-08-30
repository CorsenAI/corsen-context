/* ============================================================
   Corsen Context shared navigation  - logic (v2)
   Injects nav+footer into [data-cc-nav] / [data-cc-foot].
   Mobile toggle, aria-expanded, Escape, per-stack accent.
   ============================================================ */
(function () {
  'use strict';

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function accentOf(root) {
    return root.getAttribute('data-accent') || '';
  }

  function applyAccent(root) {
    var acc = accentOf(root);
    if (acc) root.style.setProperty('--cc-accent', acc);
  }

  function buildNav(config) {
    var stack = config.stack || 'Demo';
    var flagshipUrl = 'https://webmcp.corsen.ai';
    var links = [
      { text: 'Live trace', href: '#live' },
      { text: 'How it works', href: '#how' },
      { text: 'All integrations', href: flagshipUrl + '/#integrations', external: true },
      { text: 'GitHub', href: 'https://github.com/CorsenAI/corsen-context', external: true },
    ];

    var html = '<div class="cc-nav">' +
      '<div class="cc-nav-inner">' +
        '<a class="cc-nav-logo" href="' + (config.homeHref || '#top') + '"><span class="cc-nav-mark" aria-hidden="true">C</span>Corsen Context</a>' +
        '<span class="cc-nav-stack">' + esc(stack) + '</span>' +
        '<nav class="cc-nav-links" aria-label="Primary">' +
          links.map(function (l) {
            return '<a class="cc-nav-link" href="' + esc(l.href) + '"' +
              (l.external ? ' target="_blank" rel="noopener noreferrer"' : '') +
              '>' + esc(l.text) + '</a>';
          }).join('') +
          '<a class="cc-nav-cta" href="' + esc(flagshipUrl) + '" target="_blank" rel="noopener noreferrer">Flagship</a>' +
        '</nav>' +
        '<button type="button" class="cc-nav-toggle" aria-expanded="false" aria-controls="cc-nav-mobile-' + esc(config.uid || 'm') + '" aria-label="Open menu">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
      '</div>' +
      '<nav id="cc-nav-mobile-' + esc(config.uid || 'm') + '" class="cc-nav-mobile" aria-label="Primary mobile">' +
        links.map(function (l) {
          return '<a class="cc-nav-link" href="' + esc(l.href) + '"' +
            (l.external ? ' target="_blank" rel="noopener noreferrer"' : '') +
            '>' + esc(l.text) + '</a>';
        }).join('') +
        '<a class="cc-nav-cta" href="' + esc(flagshipUrl) + '" target="_blank" rel="noopener noreferrer">Flagship</a>' +
      '</nav>' +
    '</div>';

    return html;
  }

  function mount(root) {
    if (!root || root.__ccNavMounted) return;
    root.__ccNavMounted = true;
    applyAccent(root);

    var config = {
      stack: root.getAttribute('data-stack') || 'Demo',
      uid: (root.getAttribute('data-uid') || 'm'),
      homeHref: root.getAttribute('data-home') || '#top',
    };

    root.innerHTML = buildNav(config);

    var toggle = root.querySelector('.cc-nav-toggle');
    var mobile = root.querySelector('.cc-nav-mobile');
    if (toggle && mobile) {
      toggle.addEventListener('click', function () {
        var open = mobile.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      });
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && mobile.classList.contains('is-open')) {
          mobile.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.setAttribute('aria-label', 'Open menu');
          toggle.focus();
        }
      });
    }
  }

  function buildFooter(config) {
    var stack = config.stack || 'Demo';
    return '<div class="cc-foot-common">' +
      '<div class="cc-foot-links">' +
        '<a href="https://webmcp.corsen.ai" target="_blank" rel="noopener noreferrer">Flagship demo</a>' +
        '<a href="https://github.com/CorsenAI/corsen-context" target="_blank" rel="noopener noreferrer">GitHub repository</a>' +
      '</div>' +
      '<div class="cc-foot-stack">Demonstration site &mdash; stack: ' + esc(stack) + '</div>' +
      '<div class="cc-foot-legal">' +
        '<span>Open-source demo (MIT), built for The WebMCP Challenge.</span>' +
        '<span>This page exposes read-only public content; it collects no personal data.</span>' +
      '</div>' +
      '<span class="cc-foot-mit">MIT License</span>' +
    '</div>';
  }

  function mountFooter(root) {
    if (!root || root.__ccFootMounted) return;
    root.__ccFootMounted = true;
    applyAccent(root);
    root.innerHTML = buildFooter({
      stack: root.getAttribute('data-stack') || 'Demo',
    });
  }

  function mountAll() {
    document.querySelectorAll('[data-cc-nav]').forEach(function (el) {
      if (el.querySelector('.cc-nav')) return;
      mount(el);
    });
    document.querySelectorAll('[data-cc-foot]').forEach(function (el) {
      if (el.querySelector('.cc-foot-common')) return;
      mountFooter(el);
    });
  }

  window.CcNav = { mountAll: mountAll, mountFooter: mountFooter };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();
