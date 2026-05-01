import type { TemplateRow } from '@/lib/api';
import type { VisualTemplateState } from '@/types/template';
import type { TemplateButton, TemplateHeader } from '@/types/template';

function parseHeader(parts: unknown[]): TemplateHeader | null {
  const h = parts.find((p) => typeof p === 'object' && p !== null && (p as { type?: string }).type === 'HEADER') as
    | Record<string, unknown>
    | undefined;
  if (!h) return null;
  const format = String(h.format ?? 'TEXT').toUpperCase();
  if (format === 'TEXT') {
    return { format: 'TEXT', text: String(h.text ?? '') };
  }
  if (format === 'LOCATION') {
    return { format: 'LOCATION' };
  }
  if (format === 'IMAGE' || format === 'VIDEO' || format === 'DOCUMENT') {
    const ex = h.example as { header_handle?: string[] } | undefined;
    return {
      format,
      example: { header_handle: Array.isArray(ex?.header_handle) ? ex.header_handle : [''] },
    };
  }
  return null;
}

function parseBody(parts: unknown[]): { text: string; variableSamples: string[] } {
  const b = parts.find((p) => typeof p === 'object' && p !== null && (p as { type?: string }).type === 'BODY') as
    | Record<string, unknown>
    | undefined;
  const text = b && typeof b.text === 'string' ? b.text : '';
  const ex = b?.example as { body_text?: string[][] } | undefined;
  const row = Array.isArray(ex?.body_text?.[0]) ? ex.body_text[0] : [];
  return { text, variableSamples: row.map(String) };
}

function parseFooter(parts: unknown[]): string {
  const f = parts.find((p) => typeof p === 'object' && p !== null && (p as { type?: string }).type === 'FOOTER') as
    | Record<string, unknown>
    | undefined;
  return f && typeof f.text === 'string' ? f.text : '';
}

function parseButtons(parts: unknown[]): TemplateButton[] {
  const bt = parts.find(
    (p) => typeof p === 'object' && p !== null && (p as { type?: string }).type === 'BUTTONS'
  ) as { buttons?: unknown[] } | undefined;
  const raw = Array.isArray(bt?.buttons) ? bt.buttons : [];
  const out: TemplateButton[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const t = String((item as { type?: string }).type ?? '').toUpperCase();
    if (t === 'QUICK_REPLY') {
      out.push({ type: 'QUICK_REPLY', text: String((item as { text?: string }).text ?? '') });
    } else if (t === 'URL') {
      out.push({
        type: 'URL',
        text: String((item as { text?: string }).text ?? ''),
        url: String((item as { url?: string }).url ?? 'https://example.com'),
      });
    } else if (t === 'PHONE_NUMBER') {
      out.push({
        type: 'PHONE_NUMBER',
        text: String((item as { text?: string }).text ?? ''),
        phone_number: String((item as { phone_number?: string }).phone_number ?? ''),
      });
    }
  }
  return out.slice(0, 3);
}

/** Best-effort parse API row into editor preview state (read-only view). */
export function templateRowToVisual(row: TemplateRow): VisualTemplateState {
  const parts = Array.isArray(row.components) ? row.components : [];
  const body = parseBody(parts);
  return {
    name: row.name,
    language: row.language,
    category: (row.category as VisualTemplateState['category']) ?? 'UTILITY',
    header: parseHeader(parts),
    body,
    footer: parseFooter(parts),
    buttons: parseButtons(parts),
  };
}
