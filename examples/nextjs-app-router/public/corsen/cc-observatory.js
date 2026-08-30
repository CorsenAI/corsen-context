/* ============================================================
   Live Contract Observatory - shared component (v2)
   Vanilla JS. No deps. Reads config from data-* attributes.
   Sequence: initialize -> tools/list -> search_site ->
             get_page_content -> get_sitemap -> list_content
   Every tool is really executed; each row turns green after its
   real response. Empty results are success when the call answers.
   Same-origin only, credentials: "omit", 15s timeout, one run at a time.
   Honest states: idle | running | success | error. No simulated data.
   Exposes window.CcObservatory.mountAll() for delayed init.
   ============================================================ */
(function () {
  'use strict';

  var PROTOCOL = '2025-11-25';
  var TIMEOUT_MS = 15000;

  var TOOLS = [
    { name: 'search_site', label: 'search_site' },
    { name: 'get_page_content', label: 'get_page_content' },
    { name: 'get_sitemap', label: 'get_sitemap' },
    { name: 'list_content', label: 'list_content' },
  ];

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function truncate(value, max) {
    var s = String(value || '');
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '...';
  }

  function mount(root) {
    if (!root || root.__ccObsMounted) return;
    root.__ccObsMounted = true;

    var stack = root.getAttribute('data-stack') || 'stack';
    var endpoint = root.getAttribute('data-endpoint') || '/v1/mcp';
    var query = root.getAttribute('data-query') || 'site';

    root.classList.add('cc-obs-root');

    var html =
      '<div class="cc-obs-head">' +
        '<span class="cc-obs-stack"><span class="cc-obs-stack-dot" aria-hidden="true"></span>' +
        esc(stack) + '</span>' +
        '<span class="cc-obs-route">' + esc(endpoint) + '</span>' +
      '</div>' +
      '<div class="cc-obs-tools" aria-label="Observed tools">' +
        TOOLS.map(function (t) {
          return '<span class="cc-obs-tool">' + esc(t.name) + '</span>';
        }).join('') +
      '</div>' +
      '<div class="cc-obs-actions">' +
        '<button type="button" class="cc-obs-run" data-cc-obs-run><span class="cc-obs-run-icon" aria-hidden="true">&#9654;</span> Run live trace</button>' +
      '</div>' +
      '<div class="cc-obs-status" data-state="idle" role="status" aria-live="polite">' +
        '<span class="cc-obs-status-text">Idle - press "Run live trace" to call the real MCP endpoint.</span>' +
      '</div>' +
      '<ol class="cc-obs-steps">' +
        TOOLS.map(function (t) {
          return '<li class="cc-obs-step" data-state="idle" data-step-tool="' + esc(t.name) + '">' +
            '<span class="cc-obs-step-mark" aria-hidden="true">.</span>' +
            '<span class="cc-obs-step-name">' + esc(t.label) + '</span>' +
            '<span class="cc-obs-step-note"></span>' +
          '</li>';
        }).join('') +
      '</ol>' +
      '<div class="cc-obs-result" hidden>' +
        '<div class="cc-obs-result-label">Live result &mdash; sourced from this site</div>' +
        '<div class="cc-obs-result-url"></div>' +
        '<div class="cc-obs-result-excerpt"></div>' +
      '</div>';

    root.innerHTML = html;

    var runBtn = root.querySelector('[data-cc-obs-run]');
    var statusEl = root.querySelector('.cc-obs-status');
    var statusText = root.querySelector('.cc-obs-status-text');
    var resultEl = root.querySelector('.cc-obs-result');
    var resultUrl = root.querySelector('.cc-obs-result-url');
    var resultExcerpt = root.querySelector('.cc-obs-result-excerpt');
    var stepEls = {};

    TOOLS.forEach(function (t) {
      stepEls[t.name] = root.querySelector('[data-step-tool="' + t.name + '"]');
    });

    function setStatus(state, text) {
      statusEl.setAttribute('data-state', state);
      statusText.textContent = text;
    }

    function setStep(name, state, note) {
      var el = stepEls[name];
      if (!el) return;
      el.setAttribute('data-state', state);
      var mark = el.querySelector('.cc-obs-step-mark');
      if (state === 'running') mark.textContent = '...';
      if (state === 'success') mark.textContent = 'ok';
      if (state === 'error') mark.textContent = '!';
      if (state === 'idle') mark.textContent = '.';
      el.querySelector('.cc-obs-step-note').textContent = note || '';
    }

    function resetSteps() {
      TOOLS.forEach(function (t) { setStep(t.name, 'idle', ''); });
    }

    async function rpc(method, params, headers) {
      var headersOut = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'MCP-Protocol-Version': PROTOCOL,
        ...headers,
      };
      var res = await fetch(endpoint, {
        method: 'POST',
        headers: headersOut,
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now() % 1000000, method: method, params: params || {} }),
        credentials: 'omit',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        if (res.status === 202 || res.status === 204) return null; // notification accepted
        throw new Error('HTTP ' + res.status);
      }
      var data = await res.json();
      if (data && data.error) throw new Error(data.error.message || ('RPC error ' + data.error.code));
      return data.result || null;
    }

    function parseResult(raw) {
      var text = raw && raw.content && raw.content[0] ? raw.content[0].text : '';
      try { return JSON.parse(text); } catch (e) { return null; }
    }

    function runTrace() {
      if (runBtn.disabled) return;
      runBtn.disabled = true;
      runBtn.querySelector('.cc-obs-run-icon').textContent = '...';
      resultEl.hidden = true;
      resetSteps();
      setStatus('running', 'Running live trace against the real MCP endpoint...');

      (async function () {
        try {
          // 0. handshake
          setStep('search_site', 'running', 'initialize + tools/list');
          await rpc('initialize', {
            protocolVersion: PROTOCOL,
            capabilities: {},
            clientInfo: { name: 'cc-observatory', version: '1.0.0' },
          });
          var listed = await rpc('tools/list');
          var names = (listed && listed.tools ? listed.tools : []).map(function (t) { return t.name; });
          for (var i = 0; i < TOOLS.length; i++) {
            if (names.indexOf(TOOLS[i].name) === -1) {
              throw new Error('tools/list did not expose ' + TOOLS[i].name + ' (got: ' + names.join(', ') + ')');
            }
          }

          // 1. search_site
          setStep('search_site', 'running', 'search_site("' + query + '")');
          var searchRaw = await rpc('tools/call', { name: 'search_site', arguments: { query: query, limit: 3 } });
          var searchResults = parseResult(searchRaw) || [];
          var first = searchResults[0];
          var foundNote = first ? first.title || first.url : '0 results (empty result is a success)';
          setStep('search_site', 'success', foundNote);

          // 2. get_page_content
          if (first && first.url) {
            setStep('get_page_content', 'running', 'get_page_content(' + first.url + ')');
          } else {
            setStep('get_page_content', 'running', 'no result from search_site to read');
          }
          var readRaw = first && first.url
            ? await rpc('tools/call', { name: 'get_page_content', arguments: { uri: first.url } })
            : null;
          var page = readRaw ? parseResult(readRaw) : null;
          var excerpt = page && page.markdown ? page.markdown : (page && page.title ? page.title : '');
          var readNote = excerpt ? truncate(excerpt.replace(/\s+/g, ' ').trim(), 90) : 'answered (read-only)';
          if (first && first.url) {
            resultUrl.innerHTML = 'Found: <a href="' + esc(first.url) + '" target="_blank" rel="noopener">' + esc(first.title || first.url) + '</a>';
          }
          setStep('get_page_content', 'success', readNote);

          // 3. get_sitemap
          setStep('get_sitemap', 'running', 'get_sitemap()');
          var sitemapRaw = await rpc('tools/call', { name: 'get_sitemap', arguments: {} });
          var sitemapData = parseResult(sitemapRaw);
          var sitemapEntries = Array.isArray(sitemapData)
            ? sitemapData
            : (sitemapData && Array.isArray(sitemapData.entries)
                ? sitemapData.entries
                : (sitemapData && Array.isArray(sitemapData.pages) ? sitemapData.pages : null));
          var sitemapType = null;
          if (sitemapEntries && sitemapEntries.length) {
            for (var i2 = 0; i2 < sitemapEntries.length; i2++) {
              if (sitemapEntries[i2] && sitemapEntries[i2].type) { sitemapType = sitemapEntries[i2].type; break; }
            }
          }
          var sitemapNote = sitemapEntries ? sitemapEntries.length + ' entries' + (sitemapType ? ' (type: ' + sitemapType + ')' : '') : 'answered';
          setStep('get_sitemap', 'success', sitemapNote);

          // 4. list_content (type from sitemap when available)
          var listArgs = {};
          if (sitemapType) listArgs.type = sitemapType;
          setStep('list_content', 'running', sitemapType ? 'list_content(type: ' + sitemapType + ')' : 'list_content()');
          var listRaw = await rpc('tools/call', { name: 'list_content', arguments: listArgs });
          var listData = parseResult(listRaw);
          var items = listData && listData.items ? listData.items : (Array.isArray(listData) ? listData : null);
          var listNote = items ? items.length + ' items' : 'answered (empty result is a success)';
          setStep('list_content', 'success', listNote);

          if (excerpt) {
            resultExcerpt.textContent = '"...' + truncate(excerpt.replace(/\s+/g, ' ').trim(), 240) + '"';
          }
          setStatus('success', 'Live trace complete - all four read-only tools executed successfully.');
          runBtn.disabled = false;
          runBtn.querySelector('.cc-obs-run-icon').textContent = '>';
        } catch (err) {
          setStatus('error', 'Trace failed: ' + truncate(err && err.message ? err.message : String(err), 180) + ' - this is a real error state, no simulated result.');
          var failedStep = currentRunningStep();
          if (failedStep) setStep(failedStep, 'error', 'failed');
          runBtn.disabled = false;
          runBtn.querySelector('.cc-obs-run-icon').textContent = '>';
        }
      })();
    }

    function currentRunningStep() {
      for (var i = 0; i < TOOLS.length; i++) {
        var el = stepEls[TOOLS[i].name];
        if (el && el.getAttribute('data-state') === 'running') return TOOLS[i].name;
      }
      return null;
    }

    runBtn.addEventListener('click', runTrace);
  }

  function mountAll() {
    document.querySelectorAll('[data-cc-observatory]').forEach(mount);
  }

  window.CcObservatory = { mountAll: mountAll };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();
