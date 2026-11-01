'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface EmailPreviewProps {
  html: string;
  minHeight?: number;
  maxHeight?: number;
}

/** Un fragment (text compus, fără <html>) primește marginile unui client de email. */
function asDocument(html: string): string {
  if (/<html[\s>]/i.test(html)) return html;
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:20px 24px;}</style></head><body>${html}</body></html>`;
}

/**
 * Preview-ul unui email: lățimea unui client de email (~640px), înălțimea după
 * conținut (nu un bloc alb fix). `allow-same-origin` fără `allow-scripts`:
 * pagina poate măsura documentul, dar conținutul template-ului nu rulează
 * scripturi, nu deschide ferestre și nu trimite formulare.
 */
export function EmailPreview({ html, minHeight = 120, maxHeight = 900 }: EmailPreviewProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [height, setHeight] = useState(minHeight);

  const measure = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc?.body) return;
    const content = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
    setHeight(Math.min(maxHeight, Math.max(minHeight, content + 2)));
  }, [minHeight, maxHeight]);

  // Imaginile se încarcă după `load` și schimbă înălțimea: o urmărim
  const onLoad = useCallback(() => {
    observer.current?.disconnect();
    measure();
    const body = ref.current?.contentDocument?.body;
    if (body && typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(measure);
      observer.current.observe(body);
    }
  }, [measure]);

  useEffect(() => () => observer.current?.disconnect(), []);

  return (
    <div className="rounded-lg bg-stone-950/60 p-3 sm:p-4">
      <iframe
        ref={ref}
        title="Preview email"
        sandbox="allow-same-origin"
        srcDoc={asDocument(html)}
        onLoad={onLoad}
        style={{ height }}
        className="mx-auto block w-full max-w-[640px] rounded-md bg-white shadow-[0_8px_24px_-12px_rgb(0_0_0/.6)] transition-[height] duration-150"
      />
    </div>
  );
}
