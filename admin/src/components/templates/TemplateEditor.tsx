import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { visualTemplateFormSchema, type VisualTemplateFormValues } from '@/lib/templateSchema';
import { extractVariableIndices } from '@/types/template';
import type { VisualTemplateState } from '@/types/template';
import { buildMetaTemplatePayload } from './templatePayload';
import { ComponentBuilder } from './ComponentBuilder';
import { TemplatePreview } from './TemplatePreview';

function formToVisual(values: VisualTemplateFormValues): VisualTemplateState {
  return {
    name: values.name,
    language: values.language,
    category: values.category,
    header: values.header,
    body: values.body,
    footer: values.footer,
    buttons: values.buttons,
  };
}

const defaultValues: VisualTemplateFormValues = {
  name: 'bienvenida_cliente',
  language: 'es',
  category: 'UTILITY',
  header: null,
  body: { text: 'Hola {{1}}, gracias por contactarnos.', variableSamples: ['María'] },
  footer: '',
  buttons: [],
};

type Props = {
  initial?: Partial<VisualTemplateFormValues>;
  onCancel: () => void;
  onSubmitted: () => void;
  onSubmitPayload: (payload: Record<string, unknown>) => Promise<unknown>;
  submitting?: boolean;
};

function EditorPreviewPane({ form }: { form: ReturnType<typeof useForm<VisualTemplateFormValues>> }) {
  const watched = useWatch({ control: form.control });
  const visual = formToVisual(watched as VisualTemplateFormValues);
  return <TemplatePreview template={visual} className="mt-4" />;
}

export function TemplateEditor({ initial, onCancel, onSubmitted, onSubmitPayload, submitting }: Props) {
  const form = useForm<VisualTemplateFormValues>({
    resolver: zodResolver(visualTemplateFormSchema),
    defaultValues: { ...defaultValues, ...initial },
    mode: 'onChange',
  });

  const { register, control, handleSubmit, watch, setValue, formState } = form;
  const bodyText = watch('body.text');

  useEffect(() => {
    const indices = extractVariableIndices(bodyText);
    const max = indices.length ? Math.max(...indices) : 0;
    const current = form.getValues('body.variableSamples');
    const next = Array.from({ length: max }, (_, i) => current[i] ?? '');
    if (next.length !== current.length || next.some((v, i) => v !== current[i])) {
      setValue('body.variableSamples', next, { shouldValidate: true, shouldDirty: true });
    }
  }, [bodyText, setValue, form]);

  const onValid = async (values: VisualTemplateFormValues) => {
    const payload = buildMetaTemplatePayload(formToVisual(values));
    await onSubmitPayload(payload);
    onSubmitted();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1 overflow-y-auto pr-1">
        <form className="space-y-4" id="template-editor-form" onSubmit={handleSubmit(onValid)}>
          <ComponentBuilder register={register} control={control} errors={formState.errors} bodyText={bodyText} />
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" form="template-editor-form" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar a Meta'}
            </Button>
          </div>
        </form>
      </div>
      <div className="w-full shrink-0 border-t pt-4 lg:w-[340px] lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        <p className="mb-2 text-sm font-medium text-muted-foreground">Vista previa en vivo</p>
        <EditorPreviewPane form={form} />
      </div>
    </div>
  );
}
