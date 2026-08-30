'use client';

import { useEffect, useState } from 'react';

type BrowserModelContext = {
  registerTool?: unknown;
};

type BrowserDocument = Document & {
  modelContext?: BrowserModelContext;
};

export function WebMCPStatus() {
  const [status, setStatus] = useState({
    label: 'checking browser support…',
    state: 'checking',
  });

  useEffect(() => {
    const available =
      typeof (document as BrowserDocument).modelContext?.registerTool === 'function';
    setStatus({
      label: available ? 'available' : 'not available in this browser',
      state: available ? 'available' : 'unavailable',
    });
  }, []);

  return (
    <>
      <span data-webmcp-status data-state={status.state}>
        {status.label}
      </span>
      <noscript> JavaScript is unavailable, so browser support was not checked.</noscript>
    </>
  );
}

async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

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

export function CopyablePrompt({ prompt, index }: { prompt: string; index: number }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const promptId = `research-prompt-${index}`;

  async function handleCopy() {
    try {
      await copyText(prompt);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  const buttonLabel =
    state === 'copied' ? 'Copied' : state === 'failed' ? 'Try copying again' : 'Copy prompt';
  const feedback =
    state === 'copied'
      ? 'Prompt copied to the clipboard.'
      : state === 'failed'
        ? 'Copy failed. Select the prompt text and copy it manually.'
        : '';

  return (
    <>
      <pre id={promptId}>
        <code>{prompt}</code>
      </pre>
      <div className="prompt-actions">
        <button
          className="copy-button"
          type="button"
          aria-describedby={promptId}
          onClick={handleCopy}
        >
          {buttonLabel}
        </button>
        <span className="copy-feedback" role="status" aria-live="polite">
          {feedback}
        </span>
      </div>
    </>
  );
}
