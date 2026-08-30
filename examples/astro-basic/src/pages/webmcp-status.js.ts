const script = `(() => {
  const target = document.querySelector('[data-webmcp-status]');
  if (!target) return;
  const available = typeof document.modelContext?.registerTool === 'function';
  target.textContent = available ? 'available' : 'not available in this browser';
  target.dataset.state = available ? 'available' : 'unavailable';
})();`;

export function GET() {
  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
