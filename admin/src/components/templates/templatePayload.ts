import type { VisualTemplateState } from '@/types/template';
import { extractVariableIndices } from '@/types/template';

/** Build JSON body for POST /admin/v2/tenants/:id/templates (Meta message_templates). */
export function buildMetaTemplatePayload(state: VisualTemplateState): Record<string, unknown> {
  const components: Record<string, unknown>[] = [];

  if (state.header) {
    if (state.header.format === 'TEXT') {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: state.header.text,
      });
    } else if (state.header.format === 'LOCATION') {
      components.push({ type: 'HEADER', format: 'LOCATION' });
    } else {
      components.push({
        type: 'HEADER',
        format: state.header.format,
        example: state.header.example,
      });
    }
  }

  const indices = extractVariableIndices(state.body.text);
  const samples = indices.map((i) => {
    const idx = i - 1;
    return state.body.variableSamples[idx]?.trim() || `sample_${i}`;
  });
  const bodyComp: Record<string, unknown> = {
    type: 'BODY',
    text: state.body.text,
  };
  if (indices.length > 0) {
    bodyComp.example = { body_text: [samples] };
  }
  components.push(bodyComp);

  if (state.footer.trim()) {
    components.push({ type: 'FOOTER', text: state.footer.trim() });
  }

  if (state.buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: state.buttons.map((b) => {
        if (b.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text };
        if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
        return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
      }),
    });
  }

  return {
    name: state.name.trim(),
    language: state.language.trim(),
    category: state.category,
    components,
  };
}

export function normalizeTemplateName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
