import type { TemplateRow } from '@/lib/api';

/** Minimal preview from template components (BODY text). */
export function TemplatePreview({ template }: { template: TemplateRow }) {
  let bodyText = '(sin BODY)';
  for (const c of template.components) {
    if (typeof c === 'object' && c !== null && (c as { type?: string }).type === 'BODY') {
      const t = (c as { text?: string }).text;
      if (t) bodyText = t;
      break;
    }
  }
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <p className="text-xs font-medium text-muted-foreground">Preview</p>
      <p className="mt-2 whitespace-pre-wrap">{bodyText}</p>
    </div>
  );
}
