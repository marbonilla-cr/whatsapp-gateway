import { cn } from '@/lib/utils';
import type { VisualTemplateState } from '@/types/template';
import { extractVariableIndices } from '@/types/template';

function applyBodySamples(text: string, samples: string[]): string {
  let out = text;
  const indices = extractVariableIndices(text);
  for (const i of indices) {
    const val = samples[i - 1] ?? `{{${i}}}`;
    out = out.replaceAll(`{{${i}}}`, val);
  }
  return out;
}

type Props = {
  template: VisualTemplateState;
  className?: string;
};

export function TemplatePreview({ template, className }: Props) {
  const bodyRendered = applyBodySamples(template.body.text, template.body.variableSamples);

  return (
    <div
      className={cn(
        'mx-auto flex max-w-[320px] flex-col rounded-xl border border-[#075e54] bg-[#ece5dd] p-3 shadow-lg',
        className
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4ccc4' fill-opacity='0.35'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      <div className="mb-1 text-center text-[10px] font-medium uppercase tracking-wide text-[#075e54]/80">
        Vista previa · {template.language}
      </div>
      <div className="rounded-lg bg-[#dcf8c6] px-3 py-2 shadow-sm">
        {template.header ? (
          <div className="mb-2 border-b border-black/5 pb-2 text-sm">
            {template.header.format === 'TEXT' ? (
              <p className="font-semibold text-[#111]">{template.header.text || '…'}</p>
            ) : template.header.format === 'LOCATION' ? (
              <div className="flex h-20 items-center justify-center rounded bg-black/5 text-xs text-muted-foreground">
                Ubicación (header)
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center rounded bg-black/5 text-xs text-muted-foreground">
                {template.header.format} (subí media en Meta)
              </div>
            )}
          </div>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#111]">{bodyRendered || '…'}</p>
        {template.footer.trim() ? (
          <p className="mt-2 border-t border-black/5 pt-2 text-xs text-black/50">{template.footer.trim()}</p>
        ) : null}
        {template.buttons.length > 0 ? (
          <div className="mt-2 space-y-1 border-t border-black/5 pt-2">
            {template.buttons.map((b, idx) => (
              <div
                key={`${b.type}-${idx}`}
                className="rounded border border-[#34b7f1]/40 bg-white/80 px-2 py-1.5 text-center text-xs font-medium text-[#039be5]"
              >
                {b.text}
                {b.type === 'URL' ? <span className="ml-1 text-[10px] text-black/40">↗</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-center text-[10px] text-black/40">
        {template.name ? `${template.name} · ${template.category}` : 'Sin nombre'}
      </p>
    </div>
  );
}
