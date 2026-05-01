/** WhatsApp Cloud API template shapes used by the visual editor (subset aligned with Meta). */

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';

export type QuickReplyButton = { type: 'QUICK_REPLY'; text: string };
export type UrlButton = { type: 'URL'; text: string; url: string };
export type PhoneButton = { type: 'PHONE_NUMBER'; text: string; phone_number: string };

export type TemplateButton = QuickReplyButton | UrlButton | PhoneButton;

export type TemplateHeader =
  | { format: 'TEXT'; text: string }
  | { format: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; example: { header_handle: string[] } }
  | { format: 'LOCATION' };

export type TemplateBody = {
  text: string;
  /** Sample strings for {{1}}, {{2}}, … in order */
  variableSamples: string[];
};

export type VisualTemplateState = {
  name: string;
  language: string;
  category: TemplateCategory;
  header: TemplateHeader | null;
  body: TemplateBody;
  footer: string;
  buttons: TemplateButton[];
};

export function emptyVisualTemplate(): VisualTemplateState {
  return {
    name: '',
    language: 'es',
    category: 'UTILITY',
    header: null,
    body: { text: 'Hola {{1}}, gracias por tu pedido.', variableSamples: ['María'] },
    footer: '',
    buttons: [],
  };
}

/** Detect {{1}}, {{2}}, … in body text (Meta numbering). */
export function extractVariableIndices(text: string): number[] {
  const re = /\{\{(\d+)\}\}/g;
  const seen = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) seen.add(n);
  }
  return Array.from(seen).sort((a, b) => a - b);
}
