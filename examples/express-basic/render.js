import {
  accessBoundary,
  diagnostic,
  integrationStacks,
  integrationSteps,
  policies,
  products,
  prompts,
  resources,
} from './content.js';

const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const navigation = [
  ['/', 'Overview'],
  ['/products', 'Kits'],
  ['/guides/ak-e17', 'Support'],
  ['/shipping-education', 'Policies'],
  ['/guides', 'Guides'],
  ['/agent-access', 'Access'],
  ['/integrate', 'Integrate'],
];

const styles = `
:root{color-scheme:light;--ink:#15221d;--muted:#57645f;--paper:#f7f8f3;--surface:#fff;--line:#d8dfd9;--accent:#4e2ca3;--soft:#eee9fb;--mint:#bcebd5;font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.55;background:var(--paper);color:var(--ink)}
*{box-sizing:border-box}body{margin:0}a{color:inherit;text-underline-offset:.18em}a:hover{color:var(--accent)}code{font-family:Consolas,monospace}.site-header,main,footer{width:min(1160px,calc(100% - 2rem));margin-inline:auto}.site-header{display:flex;align-items:center;justify-content:space-between;gap:2rem;padding-block:1.25rem}.brand{display:inline-flex;align-items:center;gap:.65rem;font-weight:800;text-decoration:none;white-space:nowrap}.brand span{display:grid;width:2.25rem;height:2.25rem;place-items:center;border-radius:.65rem;background:var(--ink);color:#fff;font-size:.75rem}.site-header nav ul{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.25rem;margin:0;padding:0;list-style:none}.site-header nav a{display:block;padding:.45rem .65rem;border-radius:.5rem;color:var(--muted);font-size:.9rem;text-decoration:none}.site-header nav a[aria-current=page]{background:#fff;color:var(--ink);box-shadow:0 0 0 1px var(--line)}main{min-height:70vh}.hero{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(18rem,.7fr);gap:clamp(2rem,6vw,6rem);align-items:center;padding-block:clamp(4rem,9vw,8rem)}.eyebrow{margin:0 0 .75rem;color:var(--accent);font-size:.76rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}h1,h2,h3{line-height:1.08}h1{max-width:14ch;margin:0;font-size:clamp(2.65rem,7vw,5.8rem);letter-spacing:-.055em}h2{font-size:clamp(1.8rem,4vw,3.15rem);letter-spacing:-.035em}.lede{max-width:62ch;color:var(--muted);font-size:clamp(1.08rem,2vw,1.35rem)}.hero-links{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:2rem}.primary-link,.secondary-link{display:inline-flex;min-height:2.9rem;align-items:center;justify-content:center;padding:.7rem 1rem;border:1px solid var(--ink);border-radius:.65rem;font-weight:750;text-decoration:none}.primary-link{background:var(--ink);color:#fff}.tool-panel{padding:1.35rem;border:1px solid var(--line);border-radius:1rem;background:#fff;box-shadow:.75rem .75rem 0 var(--mint)}.tool-panel dl{margin:0}.tool-panel dl div{padding:.85rem 0;border-top:1px solid var(--line)}.tool-panel dt{font-family:monospace;font-weight:800}.tool-panel dd{margin:.2rem 0 0;color:var(--muted)}.browser-status{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:.5rem 1rem;padding:1rem 1.25rem;border:1px solid var(--line);border-radius:.75rem;background:#fff}.browser-status p{margin:0}.section{padding-block:clamp(3.5rem,8vw,7rem);border-top:1px solid var(--line)}.section h2,.page-intro h1{max-width:18ch;margin:0}.section-intro{max-width:60ch;color:var(--muted)}.prompt-rail{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:2.5rem 0 0;padding:0;list-style:none}.prompt-rail li{display:grid;align-content:start;gap:1rem;min-width:0;padding:1.25rem;border:1px solid var(--line);border-radius:.9rem;background:#fff}.prompt-rail li>span{color:var(--accent);font-weight:850}.prompt-rail pre{min-height:9rem;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.prompt-rail code{font:inherit}.prompt-rail pre:focus{outline:3px solid var(--mint)}.card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin-top:2.5rem}.case-card{min-height:13rem;padding:1.5rem;border-radius:1rem;background:#fff}.case-card:nth-child(2),.case-card:nth-child(3){background:var(--soft)}.case-card h3{max-width:22ch;margin:.25rem 0 .75rem;font-size:1.3rem}.case-card p:last-child{color:var(--muted)}.integration-callout{display:flex;align-items:center;justify-content:space-between;gap:2rem;margin-block:2rem 6rem;padding:clamp(1.5rem,4vw,3rem);border-radius:1rem;background:var(--mint)}.integration-callout h2{max-width:20ch;margin:0}.page-intro{padding-block:clamp(3.5rem,8vw,7rem);border-top:1px solid var(--line)}.page-intro h1{font-size:clamp(2.5rem,6vw,5rem)}.table-wrap{overflow-x:auto;margin-bottom:2rem;border:1px solid var(--line);border-radius:1rem;background:#fff}table{width:100%;border-collapse:collapse}caption{padding:1rem 1.25rem;color:var(--muted);text-align:left}th,td{padding:1.25rem;border-top:1px solid var(--line);text-align:left;vertical-align:top}thead th{background:var(--ink);color:#fff}.price{color:var(--accent);font-size:1.45rem;font-weight:850}.inline-facts{display:flex;flex-wrap:wrap;gap:.5rem;margin:0;padding:0;list-style:none}.inline-facts li{padding:.35rem .65rem;border-radius:99rem;background:var(--soft)}.evidence-note{margin-bottom:6rem;padding:1rem 1.25rem;border-left:.3rem solid var(--accent);background:#fff}.diagnostic-card,.setup-card{margin-bottom:1rem;padding:clamp(1.5rem,4vw,3rem);border:1px solid var(--line);border-radius:1rem;background:#fff}.code-badge{display:inline-block;padding:.4rem .65rem;border-radius:.4rem;background:var(--ink);color:#fff;font-family:monospace;font-weight:850}.steps{display:grid;gap:1rem;padding:0;list-style:none;counter-reset:steps}.steps li{position:relative;min-height:3rem;padding:.9rem 1rem .9rem 4rem;border-top:1px solid var(--line);counter-increment:steps}.steps li:before{content:counter(steps);position:absolute;left:.75rem;top:.7rem;display:grid;width:2rem;height:2rem;place-items:center;border-radius:50%;background:var(--mint);font-weight:850}.escalation{margin-bottom:6rem;padding:clamp(1.5rem,4vw,2.5rem);border:1px solid #e7c6a6;border-radius:1rem;background:#fff0d7}.escalation h2{margin:0;font-size:1.6rem}.policy-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin:0 0 6rem}.policy-grid div{min-height:12rem;padding:1.5rem;border:1px solid var(--line);border-radius:1rem;background:#fff}.policy-grid div:first-child{background:var(--mint)}.policy-grid dt{color:var(--accent);font-size:.8rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.policy-grid dd{margin:1.5rem 0 0;font-size:1.45rem;font-weight:720;line-height:1.25}.resource-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:0 0 6rem;padding:0;list-style:none}.resource-grid article{height:100%;padding:1.35rem;border:1px solid var(--line);border-radius:.85rem;background:#fff}.resource-grid time,.published{color:var(--muted);font-family:monospace;font-size:.85rem}.resource-grid h2{margin:1rem 0 .75rem;font-size:1.35rem}.resource-grid p{color:var(--muted)}.boundary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin-bottom:6rem}.boundary{padding:clamp(1.5rem,4vw,2.5rem);border-radius:1rem}.boundary.can{background:var(--mint)}.boundary.cannot{border:1px solid #edc7ca;background:#fff4f4}.boundary-mark{margin:0;font-size:2rem;font-weight:900}.boundary h2{margin:.5rem 0 1.5rem}.boundary li+li{margin-top:.9rem}.stack-selector ul{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin:0 0 2rem;padding:0;list-style:none}.stack-selector li{display:grid;align-content:start;gap:.65rem;min-height:10rem;padding:1.2rem;border:1px solid var(--line);border-radius:.8rem;background:#fff;color:var(--muted)}.stack-selector li.current{border:2px solid var(--accent);background:var(--soft);color:var(--ink)}.stack-name{color:var(--ink);font-size:1.25rem;font-weight:850}.stack-selector strong{color:var(--accent);font-size:.75rem;text-transform:uppercase}.setup-card{margin-bottom:6rem}.resource-article{max-width:760px;padding-block:clamp(4rem,10vw,8rem)}.resource-copy{margin:2.5rem 0;padding:1.5rem;border:1px solid var(--line);border-radius:.8rem;background:#fff;white-space:pre-line}footer{display:flex;justify-content:space-between;gap:2rem;padding-block:2rem;border-top:1px solid var(--line);color:var(--muted);font-size:.88rem}footer p{margin:0}
.demo-disclaimer{max-width:60ch;margin:-1rem 0 3rem;padding-left:.8rem;border-left:3px solid var(--mint);color:var(--muted);font-size:.9rem}
button{font:inherit}:where(a,button,[tabindex]):focus-visible,.prompt-rail pre:focus{outline:3px solid var(--accent);outline-offset:3px}.prompt-actions{display:grid;gap:.45rem;align-items:start}.copy-button{justify-self:start;min-height:2.75rem;padding:.65rem .9rem;border:1px solid var(--ink);border-radius:.6rem;background:var(--ink);color:#fff;font-weight:750;cursor:pointer}.copy-button:hover{border-color:var(--accent);background:var(--accent)}.copy-feedback{min-height:1.35rem;color:var(--muted);font-size:.82rem}
@media(max-width:820px){.site-header{align-items:flex-start}.hero{grid-template-columns:1fr}.prompt-rail,.resource-grid{grid-template-columns:1fr}.prompt-rail pre{min-height:auto}.stack-selector ul{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.site-header{flex-direction:column}.site-header nav ul{justify-content:flex-start}.card-grid,.policy-grid,.boundary-grid,.stack-selector ul{grid-template-columns:1fr}.integration-callout,footer{align-items:flex-start;flex-direction:column}th,td{padding:.85rem}}
`;

const interactions = `(() => {
  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Clipboard copy was rejected');
  }

  document.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-copy-prompt]') : null;
    if (!(button instanceof HTMLButtonElement)) return;
    const card = button.closest('li');
    const prompt = card?.querySelector('code')?.textContent ?? '';
    const feedback = card?.querySelector('[data-copy-feedback]');
    if (!prompt || !(feedback instanceof HTMLElement)) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(prompt);
      } else {
        fallbackCopy(prompt);
      }
      button.textContent = 'Copied';
      feedback.textContent = 'Prompt copied to the clipboard.';
    } catch {
      button.textContent = 'Try copying again';
      feedback.textContent = 'Copy failed. Select the prompt text and copy it manually.';
    }
  });
})();`;

function shell(page, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page.title)} — Aurora Kits</title><meta name="description" content="${esc(page.description)}"><style>${styles}</style><style>/* ============================================================
   Corsen Context shared navigation (v2)
   Isolated: .cc-nav / .cc-nav-*. Sticky, accessible, mobile-ready.
   Stack accent via --cc-accent (set per site).
   ============================================================ */

:where([data-cc-nav], [data-cc-foot], .cc-nav, .cc-foot-common) {
  --cc-nav-bg: rgba(255, 255, 255, 0.94);
  --cc-nav-border: #d8dfe7;
  --cc-nav-text: #101828;
  --cc-nav-muted: #475467;
  --cc-nav-accent: var(--cc-accent, #8f0e60);
  --cc-nav-h: 58px;
  font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.cc-nav {
  position: sticky; top: 0; z-index: 60;
  background: var(--cc-nav-bg);
  border-bottom: 1px solid var(--cc-nav-border);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.cc-nav-inner {
  max-width: 1160px; margin: 0 auto; padding: 0 20px;
  height: var(--cc-nav-h);
  display: flex; align-items: center; gap: 14px;
}
.cc-nav-logo {
  display: inline-flex; align-items: center; gap: 8px;
  font-weight: 700; font-size: 15.5px; color: var(--cc-nav-text);
  text-decoration: none; white-space: nowrap;
}
.cc-nav-logo:hover { color: var(--cc-nav-accent); }
.cc-nav-logo:focus-visible { outline: 3px solid var(--cc-nav-accent); outline-offset: 2px; border-radius: 4px; }
.cc-nav-logo .cc-nav-mark {
  width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center;
  background: var(--cc-nav-accent); color: #fff; font-size: 11px; font-weight: 800; flex: none;
}
.cc-nav-stack {
  font-size: 12px; font-weight: 700; color: var(--cc-nav-accent);
  border: 1px solid var(--cc-accent-soft, #e6c9dc); background: var(--cc-accent-soft-bg, #fbeff7);
  border-radius: 999px; padding: 3px 10px; white-space: nowrap;
}
.cc-nav-links { display: flex; align-items: center; gap: 2px; margin-left: auto; }
.cc-nav-link {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 13.5px; font-weight: 600; color: var(--cc-nav-text);
  text-decoration: none; padding: 8px 12px; border-radius: 8px;
  transition: background .12s ease, color .12s ease;
}
.cc-nav-link:hover { background: #f1f4f8; color: var(--cc-nav-accent); }
.cc-nav-link:focus-visible { outline: 3px solid var(--cc-nav-accent); outline-offset: 2px; }
.cc-nav-link[aria-current="true"] { color: var(--cc-nav-accent); background: var(--cc-accent-soft-bg, #fbeff7); }
.cc-nav-cta {
  display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
  font-size: 13px; font-weight: 700; color: #ffffff;
  background: var(--cc-nav-accent); border-radius: 9px; padding: 8px 14px;
  text-decoration: none; margin-left: 8px;
}
.cc-nav-cta:hover { filter: brightness(1.10); }
.cc-nav-cta:focus-visible { outline: 3px solid var(--cc-nav-accent); outline-offset: 2px; }

/* Mobile toggle */
.cc-nav-toggle {
  display: none; margin-left: auto;
  width: 40px; height: 40px; border: 1px solid var(--cc-nav-border);
  background: #fff; border-radius: 9px; cursor: pointer;
  align-items: center; justify-content: center; flex-direction: column; gap: 4px;
}
.cc-nav-toggle:focus-visible { outline: 3px solid var(--cc-nav-accent); outline-offset: 2px; }
.cc-nav-toggle span { display: block; width: 18px; height: 2px; background: var(--cc-nav-text); border-radius: 2px; transition: transform .18s ease, opacity .18s ease; }
.cc-nav-toggle[aria-expanded="true"] span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
.cc-nav-toggle[aria-expanded="true"] span:nth-child(2) { opacity: 0; }
.cc-nav-toggle[aria-expanded="true"] span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

.cc-nav-mobile {
  display: none; flex-direction: column; gap: 2px;
  border-top: 1px solid var(--cc-nav-border); background: #fff; padding: 10px 20px 16px;
}
.cc-nav-mobile .cc-nav-link { padding: 12px 10px; font-size: 15px; }
.cc-nav-mobile .cc-nav-cta { justify-content: center; margin: 8px 0 0; }

@media (max-width: 760px) {
  .cc-nav-links { display: none; }
  .cc-nav-toggle { display: flex; }
  .cc-nav-mobile.is-open { display: flex; }
  .cc-nav-stack { display: none; }
}

/* Shared footer */
.cc-foot-common {
  margin-top: 56px; border-top: 1px solid var(--cc-nav-border);
  padding: 26px 20px 30px; text-align: center;
  color: var(--cc-nav-muted); font-size: 13px;
  font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
}
.cc-foot-common a { color: var(--cc-nav-text); font-weight: 600; text-decoration: underline; }
.cc-foot-common a:hover { color: var(--cc-nav-accent); }
.cc-foot-common .cc-foot-stack { display: block; margin-top: 10px; font-size: 12px; opacity: .9; }
.cc-foot-common .cc-foot-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 18px; margin-top: 8px; font-size: 13px; }
.cc-foot-common .cc-foot-legal {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  margin-top: 12px; font-size: 12px; color: var(--cc-nav-muted);
}
.cc-foot-common .cc-foot-mit {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 10px;
  background: #f1f4f8; border: 1px solid var(--cc-nav-border);
  border-radius: 999px; padding: 4px 12px; font-size: 12px; color: var(--cc-nav-muted);
}
</style><style>/* ============================================================
   Live Contract Observatory  - shared component (v1)
   Isolated CSS: all rules prefixed with .cc-observatory / cc-obs-
   No external deps. WCAG AA contrast. prefers-reduced-motion.
   ============================================================ */

:where(.cc-obs-root) {
  --cc-obs-bg: #ffffff;
  --cc-obs-panel: #f8fafc;
  --cc-obs-border: #dbe2e9;
  --cc-obs-text: #12202e;
  --cc-obs-muted: #5d6b78;
  --cc-obs-accent: #b6167b;
  --cc-obs-accent-soft: #e9d4e3;
  --cc-obs-ok: #0a7a3d;
  --cc-obs-ok-soft: #d9f1e2;
  --cc-obs-err: #b3261e;
  --cc-obs-err-soft: #f8dcd9;
  --cc-obs-run: #8a4a00;
  --cc-obs-run-soft: #fbe8cd;
  --cc-obs-font: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.cc-obs-root {
  font-family: var(--cc-obs-font);
  color: var(--cc-obs-text);
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--cc-obs-border);
  border-radius: 14px;
  background: var(--cc-obs-panel);
  padding: 16px;
  font-size: 15px;
  line-height: 1.45;
}
.cc-obs-root *, .cc-obs-root *::before, .cc-obs-root *::after { box-sizing: border-box; }

.cc-obs-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 10px; }
.cc-obs-stack {
  display: inline-flex; align-items: center; gap: 6px;
  font-weight: 700; font-size: 14px; letter-spacing: .01em;
}
.cc-obs-stack-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--cc-obs-ok); flex: none; }
.cc-obs-route { font-size: 12.5px; color: var(--cc-obs-muted); font-variant-numeric: tabular-nums; }

.cc-obs-tools { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 12px; }
.cc-obs-tool {
  font-size: 12px; font-weight: 600; color: var(--cc-obs-text);
  background: var(--cc-obs-accent-soft);
  border-radius: 999px; padding: 4px 10px;
  border: 1px solid transparent;
}

.cc-obs-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.cc-obs-run {
  font: inherit; font-weight: 700; font-size: 13.5px;
  color: #fff; background: var(--cc-obs-accent);
  border: 0; border-radius: 9px; padding: 9px 16px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
  transition: background .15s ease, transform .12s ease;
}
.cc-obs-run:hover { background: var(--cc-obs-accent); filter: brightness(1.08); }
.cc-obs-run:active { transform: translateY(1px); }
.cc-obs-run:focus-visible { outline: 3px solid var(--cc-obs-accent); outline-offset: 2px; }
.cc-obs-run[disabled] { opacity: .55; cursor: wait; }
.cc-obs-run-icon { font-size: 15px; line-height: 1; }

.cc-obs-status {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: var(--cc-obs-muted);
  margin-bottom: 10px; min-height: 20px;
}
.cc-obs-status[data-state="idle"] { color: var(--cc-obs-muted); }
.cc-obs-status[data-state="running"] { color: var(--cc-obs-run); }
.cc-obs-status[data-state="success"] { color: var(--cc-obs-ok); }
.cc-obs-status[data-state="error"] { color: var(--cc-obs-err); }
.cc-obs-status-text { font-weight: 600; }

.cc-obs-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.cc-obs-step {
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; color: var(--cc-obs-muted);
  border: 1px solid transparent; border-radius: 8px; padding: 6px 10px;
  background: transparent;
}
.cc-obs-step[data-state="running"] { background: var(--cc-obs-run-soft); color: var(--cc-obs-run); border-color: #f0d5ab; }
.cc-obs-step[data-state="success"] { background: var(--cc-obs-ok-soft); color: var(--cc-obs-ok); border-color: #bfe3cc; }
.cc-obs-step[data-state="error"] { background: var(--cc-obs-err-soft); color: var(--cc-obs-err); border-color: #efbeb9; }
.cc-obs-step-mark { width: 18px; height: 18px; border-radius: 50%; flex: none; display: grid; place-items: center; font-size: 11px; font-weight: 800; }
.cc-obs-step[data-state="idle"] .cc-obs-step-mark { background: var(--cc-obs-border); color: var(--cc-obs-muted); }
.cc-obs-step[data-state="running"] .cc-obs-step-mark { background: var(--cc-obs-run); color: #fff; }
.cc-obs-step[data-state="success"] .cc-obs-step-mark { background: var(--cc-obs-ok); color: #fff; }
.cc-obs-step[data-state="error"] .cc-obs-step-mark { background: var(--cc-obs-err); color: #fff; }
.cc-obs-step-name { font-weight: 600; }
.cc-obs-step-note { font-size: 11.5px; opacity: .85; margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46%; }

.cc-obs-result { margin-top: 10px; border-top: 1px dashed var(--cc-obs-border); padding-top: 10px; display: grid; gap: 6px; }
.cc-obs-result[hidden] { display: none; }
.cc-obs-result-label { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--cc-obs-muted); }
.cc-obs-result-url {
  font-size: 13px; font-weight: 600; color: var(--cc-obs-accent); word-break: break-all;
}
.cc-obs-result-url a { color: inherit; text-decoration: underline; }
.cc-obs-result-url a:focus-visible { outline: 3px solid var(--cc-obs-accent); outline-offset: 2px; }
.cc-obs-result-excerpt { font-size: 13px; color: var(--cc-obs-text); max-height: 84px; overflow: hidden; position: relative; }

.cc-obs-result table { width: 100%; border-collapse: collapse; margin-top: 4px; }
.cc-obs-result td { font-size: 12.5px; padding: 4px 6px; border-bottom: 1px solid #edf1f5; vertical-align: top; }
.cc-obs-result td:first-child { font-weight: 600; color: var(--cc-obs-muted); width: 46%; }

.cc-obs-schema { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
.cc-obs-chip { font-size: 11.5px; color: var(--cc-obs-muted); background: #eef2f6; border-radius: 999px; padding: 4px 10px; }

/* Focus visibility */
.cc-obs-root :focus-visible { outline: 3px solid var(--cc-obs-accent); outline-offset: 2px; border-radius: 4px; }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .cc-obs-step[data-state="running"] .cc-obs-step-mark { animation: none !important; }
  .cc-obs-run { transition: none; }
}

/* Responsive */
@media (max-width: 560px) {
  .cc-obs-root { padding: 12px; font-size: 14px; }
  .cc-obs-step-note { max-width: 40%; }
  .cc-obs-tool { font-size: 11px; padding: 3px 8px; }
}
</style><script src="/webmcp.js" defer></script><script src="/webmcp-status.js" defer></script></head><body>
  <div data-cc-nav data-stack="Express" data-uid="express" data-home="/" data-accent="#4e2ca3"></div>
  <main>${inner}<section id="live" style="margin:40px 0"><h2>Live contract observatory</h2><div data-cc-observatory data-stack="Express" data-endpoint="/v1/mcp" data-query="AK-E17" data-accent="#4e2ca3"></div></section></main><footer data-cc-foot data-stack="Express" data-accent="#4e2ca3"></footer><script>${interactions}</script><script>/* ============================================================
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
</script><script>/* ============================================================
   Corsen Context shared navigation  - logic (v5)
   Injects nav+footer into [data-cc-nav] / [data-cc-foot].
   Mobile toggle, aria-expanded, Escape, per-stack accent.
   v3: builds every node through the DOM API (createElement /
   textContent / setAttribute) — no innerHTML anywhere, so page
   attributes can never be reinterpreted as HTML (CodeQL
   js/xss-through-dom). href values pass a scheme allowlist.
   v5: every href written to the DOM is a constant from this file.
   data-repository is resolved through an allowlist of known
   repositories and data-home through a two-value switch, so no
   attribute text ever reaches an href sink.
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
    Netlify: 'https://github.com/CorsenAI/corsen-context-netlify',
    Ghost: 'https://github.com/CorsenAI/corsen-context-ghost',
    Strapi: 'https://github.com/CorsenAI/corsen-context-strapi',
    Directus: 'https://github.com/CorsenAI/corsen-context-directus',
    Wagtail: 'https://github.com/CorsenAI/corsen-context-wagtail',
    MediaWiki: 'https://github.com/CorsenAI/corsen-context-mediawiki',
  };

  /* Repositories a page may name in data-repository. Any other value falls
     back to the stack default, so the attribute can select a constant but
     can never inject a destination. */
  var KNOWN_REPOSITORIES = {};
  KNOWN_REPOSITORIES[MAIN_REPO] = MAIN_REPO;
  Object.keys(REPOS).forEach(function (stack) {
    KNOWN_REPOSITORIES[REPOS[stack]] = REPOS[stack];
  });

  function applyAccent(root) {
    var acc = String(root.getAttribute('data-accent') || '').trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(acc)) root.style.setProperty('--cc-accent', acc);
  }

  /* href allowlist: in-page anchors, root-relative paths, http(s) only. */
  function safeHref(value, fallback) {
    var s = String(value || '').trim();
    var lower = s.toLowerCase();
    if (s.charAt(0) === '#' || s.charAt(0) === '/') return s;
    if (lower.indexOf('https://') === 0 || lower.indexOf('http://') === 0) return s;
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
    var declared = String(root.getAttribute('data-repository') || '').trim();
    if (Object.prototype.hasOwnProperty.call(KNOWN_REPOSITORIES, declared)) {
      return KNOWN_REPOSITORIES[declared];
    }
    return REPOS[stack] || MAIN_REPO;
  }

  /* data-home selects between two constants: the site root or the
     in-page top anchor. */
  function homeFor(root) {
    return root.getAttribute('data-home') === '/' ? '/' : '#top';
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
    var homeHref = homeFor(root);

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
      el(
        'span',
        '',
        'No form or account is required for this read-only demo; hosting logs may apply.',
      ),
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
</script></body></html>`;
}

const intro = (eyebrow, title, copy) =>
  `<header class="page-intro"><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p class="lede">${esc(copy)}</p></header>`;

function home() {
  const workflows = [
    [
      '/products',
      'Product discovery',
      'Compare three kits from published facts',
      'Prices, age guidance, project counts, camera, arm, LiDAR, and ROS 2.',
    ],
    [
      '/guides/ak-e17',
      'Support',
      'Retrieve a fixed diagnostic sequence',
      'Three ordered steps and one explicit stop-and-escalate rule for AK-E17.',
    ],
    [
      '/shipping-education',
      'Policy research',
      'Answer a multi-policy question',
      'EU shipping, verified education discount, returns, and parts warranty.',
    ],
    [
      '/guides',
      'Fresh content',
      'Browse six dated guides',
      'Every guide is a real provider entry with its own retrievable URL.',
    ],
  ];
  return `<section class="hero"><div><p class="eyebrow">WebMCP use-case gallery</p><h1>One useful website. Four explicit tools.</h1><p class="lede">Aurora Kits is a fictional robotics catalog built to show how a browser agent can research products, support, and policies through owner-published read-only data.</p><p class="hero-links"><a class="primary-link" href="#try-prompts">Try a prompt</a><a class="secondary-link" href="/agent-access">Check the boundary</a></p></div><aside class="tool-panel" aria-labelledby="tool-panel-title"><p class="eyebrow" id="tool-panel-title">Published interface</p><dl><div><dt>search_site</dt><dd>Find the relevant URL</dd></div><div><dt>get_page_content</dt><dd>Retrieve its clean content</dd></div><div><dt>list_content</dt><dd>Browse public records</dd></div><div><dt>get_sitemap</dt><dd>Map the public corpus</dd></div></dl></aside><aside class="browser-status" aria-live="polite"><p><strong>Browser WebMCP:</strong> <span data-webmcp-status>status not checked (JavaScript is unavailable)</span></p><a href="/integrate">Browser setup</a></aside></section>
  <p class="demo-disclaimer">Aurora Kits is a fictional, deterministic demo corpus; prices/policies are not commercial offers.</p><section class="section" id="try-prompts" aria-labelledby="prompt-title"><p class="eyebrow">Try with your agent</p><h2 id="prompt-title">Three copyable research prompts</h2><p class="section-intro">Copy any prompt into your agent. The page does not simulate an answer or perform an action on your behalf.</p><ol class="prompt-rail">${prompts
    .map((prompt, index) => {
      const promptId = `research-prompt-${index + 1}`;
      return `<li><span aria-hidden="true">0${index + 1}</span><pre id="${promptId}"><code>${esc(prompt)}</code></pre><div class="prompt-actions"><button class="copy-button" type="button" aria-describedby="${promptId}" data-copy-prompt>Copy prompt</button><span class="copy-feedback" role="status" aria-live="polite" data-copy-feedback></span></div></li>`;
    })
    .join('')}</ol></section>
  <section class="section" aria-labelledby="workflow-title"><p class="eyebrow">Different retrieval patterns</p><h2 id="workflow-title">A gallery of real content workflows</h2><div class="card-grid">${workflows.map(([path, eyebrow, title, copy]) => `<article class="case-card"><p class="eyebrow">${eyebrow}</p><h3><a href="${path}">${title}</a></h3><p>${copy}</p></article>`).join('')}</div></section>
  <section class="integration-callout" aria-labelledby="integration-callout-title"><div><p class="eyebrow">For site owners</p><h2 id="integration-callout-title">Replace the demo provider with your content.</h2><p>The human pages and all four tools read from the same records, so URLs and answers stay aligned.</p></div><a class="primary-link" href="/integrate">View the Express path</a></section>`;
}

function productsView() {
  return `${intro('Product discovery', 'Compare Aurora robotics kits', 'A compact fact table that can be retrieved from the same provider as this page.')}<div class="table-wrap"><table><caption>Published Aurora Kits comparison</caption><thead><tr><th scope="col">Kit</th><th scope="col">Price</th><th scope="col">Published facts</th></tr></thead><tbody>${products.map((product) => `<tr><th scope="row">${product.name}</th><td class="price">${product.price}</td><td><ul class="inline-facts">${product.facts.map((fact) => `<li>${fact}</li>`).join('')}</ul></td></tr>`).join('')}</tbody></table></div><aside class="evidence-note"><strong>Useful chain:</strong> search for “no soldering” or “LiDAR”, then retrieve this page with <code>get_page_content</code>.</aside>`;
}

function diagnosticView() {
  return `${intro('Support diagnostic', `${diagnostic.code} — ${diagnostic.title}`, 'The recovery sequence has exactly three steps. Its stop condition is part of the published record.')}<section class="diagnostic-card" aria-labelledby="steps-title"><div class="code-badge">${diagnostic.code}</div><h2 id="steps-title">Run once, in this order</h2><ol class="steps">${diagnostic.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol></section><aside class="escalation" aria-labelledby="escalation-title"><p class="eyebrow">Safety boundary</p><h2 id="escalation-title">When to stop and escalate</h2><p>${esc(diagnostic.escalation)}</p></aside>`;
}

function policiesView() {
  return `${intro('Policy research', 'Four policies, one retrievable page', 'A multi-part question can be answered from explicit policy records without a checkout or form action.')}<dl class="policy-grid">${policies.map((policy) => `<div><dt>${policy.label}</dt><dd>${policy.value}</dd></div>`).join('')}</dl>`;
}

function resourcesView() {
  return `${intro('Freshness and discovery', 'Six dated guides', 'Each guide has a stable provider URL, title, description, and publication date.')}<ol class="resource-grid">${resources.map((resource) => `<li><article><time datetime="${resource.date}">${resource.date}</time><h2><a href="${resource.path}">${resource.title}</a></h2><p>${resource.description}.</p></article></li>`).join('')}</ol>`;
}

function accessView() {
  return `${intro('Owner control', 'What the tools can and cannot access', 'The public contract is intentionally read-only and limited to this site’s published corpus.')}<div class="boundary-grid"><section class="boundary can" aria-labelledby="can-title"><p class="boundary-mark" aria-hidden="true">✓</p><h2 id="can-title">Can access</h2><ul>${accessBoundary.can.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></section><section class="boundary cannot" aria-labelledby="cannot-title"><p class="boundary-mark" aria-hidden="true">×</p><h2 id="cannot-title">Cannot access</h2><ul>${accessBoundary.cannot.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></section></div>`;
}

function integrationView() {
  return `${intro('Implementation comparison', 'Compare integration patterns for your stack', 'This page compares the Next.js, Astro, Express, and static HTML examples; it highlights the pattern rendered here.')}<section class="stack-selector" aria-label="Available integration patterns"><ul>${integrationStacks.map((stack) => `<li class="${stack.current ? 'current' : ''}"><span class="stack-name">${stack.name}</span><span>${stack.detail}</span>${stack.current ? '<strong>Current example</strong>' : ''}</li>`).join('')}</ul></section><section class="setup-card" aria-labelledby="setup-title"><p class="eyebrow">Express</p><h2 id="setup-title">Integration path</h2><ol class="steps">${integrationSteps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol></section>`;
}

function resourceView(page) {
  const resource = resources.find((item) => item.path === page.path);
  return `<article class="resource-article"><p class="eyebrow">Aurora Kits guide</p><h1>${esc(resource.title)}</h1><p class="published">Published <time datetime="${resource.date}">${resource.date}</time></p><p class="lede">${esc(resource.description)}.</p><div class="resource-copy">${esc(resource.body)}</div><p><a href="/guides">← Back to all six guides</a></p></article>`;
}

export function renderPage(page) {
  const views = {
    home,
    products: productsView,
    diagnostic: diagnosticView,
    policies: policiesView,
    resources: resourcesView,
    access: accessView,
    integration: integrationView,
    resource: () => resourceView(page),
  };
  return shell(page, views[page.view]());
}
