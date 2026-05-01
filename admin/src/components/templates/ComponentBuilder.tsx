import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { VisualTemplateFormValues } from '@/lib/templateSchema';
import { extractVariableIndices } from '@/types/template';
import type { TemplateButton } from '@/types/template';

type Props = {
  register: UseFormRegister<VisualTemplateFormValues>;
  control: Control<VisualTemplateFormValues>;
  errors: FieldErrors<VisualTemplateFormValues>;
  bodyText: string;
};

export function ComponentBuilder({ register, control, errors, bodyText }: Props) {
  const indices = extractVariableIndices(bodyText);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Nombre, idioma y categoría</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="tpl-name">Nombre interno (snake_case)</Label>
            <Input id="tpl-name" {...register('name')} placeholder="mi_template_bienvenida" autoComplete="off" />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="space-y-2">
            <Label>Idioma</Label>
            <Input {...register('language')} placeholder="es" />
            {errors.language ? <p className="text-xs text-destructive">{errors.language.message}</p> : null}
          </div>
          <div className="space-y-2">
            <Label>Categoría</Label>
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTILITY">UTILITY</SelectItem>
                    <SelectItem value="MARKETING">MARKETING</SelectItem>
                    <SelectItem value="AUTHENTICATION">AUTHENTICATION</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Encabezado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Controller
            name="header"
            control={control}
            render={({ field }) => (
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={
                    field.value === null
                      ? 'none'
                      : field.value.format === 'TEXT'
                        ? 'TEXT'
                        : field.value.format === 'LOCATION'
                          ? 'LOCATION'
                          : field.value.format
                  }
                  onValueChange={(v) => {
                    if (v === 'none') {
                      field.onChange(null);
                      return;
                    }
                    if (v === 'TEXT') {
                      field.onChange({ format: 'TEXT', text: '' });
                      return;
                    }
                    if (v === 'LOCATION') {
                      field.onChange({ format: 'LOCATION' });
                      return;
                    }
                    field.onChange({
                      format: v as 'IMAGE' | 'VIDEO' | 'DOCUMENT',
                      example: { header_handle: [''] },
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin encabezado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin encabezado</SelectItem>
                    <SelectItem value="TEXT">Texto</SelectItem>
                    <SelectItem value="IMAGE">Imagen</SelectItem>
                    <SelectItem value="VIDEO">Video</SelectItem>
                    <SelectItem value="DOCUMENT">Documento</SelectItem>
                    <SelectItem value="LOCATION">Ubicación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          />
          <Controller
            name="header"
            control={control}
            render={({ field }) => {
              if (!field.value) {
                return <div className="hidden" aria-hidden />;
              }
              const hv = field.value;
              if (hv.format === 'TEXT') {
                return (
                  <div className="space-y-2">
                    <Label>Texto del header</Label>
                    <Input
                      value={hv.text}
                      onChange={(e) => field.onChange({ format: 'TEXT', text: e.target.value })}
                      maxLength={60}
                    />
                    {errors.header && 'message' in errors.header ? (
                      <p className="text-xs text-destructive">{String(errors.header.message)}</p>
                    ) : null}
                  </div>
                );
              }
              if (hv.format === 'LOCATION') {
                return <p className="text-xs text-muted-foreground">Meta validará el template con ubicación.</p>;
              }
              const mediaFormat = hv.format;
              return (
                <div className="space-y-2">
                  <Label>Handle de ejemplo (Graph media id o placeholder)</Label>
                  <Input
                    value={hv.example.header_handle[0] ?? ''}
                    onChange={(e) =>
                      field.onChange({
                        format: mediaFormat,
                        example: { header_handle: [e.target.value] },
                      })
                    }
                    placeholder="4::aW..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Para crear en Meta necesitás un media handle válido; podés dejar un placeholder y ajustar por
                    API.
                  </p>
                </div>
              );
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cuerpo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Texto (usá {'{{1}}'}, {'{{2}}'}, … para variables)</Label>
            <Textarea {...register('body.text')} rows={5} className="font-mono text-sm" />
            {errors.body?.text ? <p className="text-xs text-destructive">{errors.body.text.message}</p> : null}
          </div>
          {indices.length > 0 ? (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">Ejemplos para la vista previa y Meta</p>
              {indices.map((i) => (
                <div key={i} className="space-y-1">
                  <Label className="text-xs">{`{{${i}}}`}</Label>
                  <Input
                    {...register(`body.variableSamples.${i - 1}` as const)}
                    placeholder={`Valor ejemplo ${i}`}
                  />
                  {errors.body?.variableSamples?.[i - 1] ? (
                    <p className="text-xs text-destructive">
                      {(errors.body.variableSamples[i - 1] as { message?: string })?.message}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Pie (opcional)</CardTitle>
        </CardHeader>
        <CardContent>
          <Input {...register('footer')} maxLength={60} placeholder="Texto breve" />
          {errors.footer ? <p className="text-xs text-destructive">{errors.footer.message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm">Botones (máx. 3)</CardTitle>
          <Controller
            name="buttons"
            control={control}
            render={({ field }) => (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={field.value.length >= 3}
                onClick={() => {
                  const next: TemplateButton[] = [
                    ...field.value,
                    { type: 'QUICK_REPLY', text: 'Opción' },
                  ];
                  field.onChange(next);
                }}
              >
                <Plus className="mr-1 h-3 w-3" />
                Agregar
              </Button>
            )}
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <Controller
            name="buttons"
            control={control}
            render={({ field }) => (
              <>
                {field.value.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin botones.</p>
                ) : (
                  field.value.map((btn, idx) => (
                    <div key={idx} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Select
                          value={btn.type}
                          onValueChange={(t) => {
                            const copy = [...field.value];
                            if (t === 'QUICK_REPLY') copy[idx] = { type: 'QUICK_REPLY', text: 'OK' };
                            if (t === 'URL') copy[idx] = { type: 'URL', text: 'Ver más', url: 'https://example.com' };
                            if (t === 'PHONE_NUMBER')
                              copy[idx] = { type: 'PHONE_NUMBER', text: 'Llamar', phone_number: '+50600000000' };
                            field.onChange(copy);
                          }}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="QUICK_REPLY">Respuesta rápida</SelectItem>
                            <SelectItem value="URL">URL</SelectItem>
                            <SelectItem value="PHONE_NUMBER">Teléfono</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="shrink-0 text-destructive"
                          onClick={() => field.onChange(field.value.filter((_, j) => j !== idx))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {btn.type === 'QUICK_REPLY' ? (
                        <Input
                          value={btn.text}
                          onChange={(e) => {
                            const copy = [...field.value] as TemplateButton[];
                            (copy[idx] as { type: 'QUICK_REPLY'; text: string }).text = e.target.value;
                            field.onChange(copy);
                          }}
                          placeholder="Texto del botón"
                        />
                      ) : null}
                      {btn.type === 'URL' ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            value={btn.text}
                            onChange={(e) => {
                              const copy = [...field.value] as TemplateButton[];
                              (copy[idx] as { type: 'URL'; text: string }).text = e.target.value;
                              field.onChange(copy);
                            }}
                            placeholder="Texto"
                          />
                          <Input
                            value={btn.url}
                            onChange={(e) => {
                              const copy = [...field.value] as TemplateButton[];
                              (copy[idx] as { type: 'URL'; url: string }).url = e.target.value;
                              field.onChange(copy);
                            }}
                            placeholder="https://…"
                          />
                        </div>
                      ) : null}
                      {btn.type === 'PHONE_NUMBER' ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            value={btn.text}
                            onChange={(e) => {
                              const copy = [...field.value] as TemplateButton[];
                              (copy[idx] as { type: 'PHONE_NUMBER'; text: string }).text = e.target.value;
                              field.onChange(copy);
                            }}
                            placeholder="Texto"
                          />
                          <Input
                            value={btn.phone_number}
                            onChange={(e) => {
                              const copy = [...field.value] as TemplateButton[];
                              (copy[idx] as { type: 'PHONE_NUMBER'; phone_number: string }).phone_number =
                                e.target.value;
                              field.onChange(copy);
                            }}
                            placeholder="+506…"
                          />
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </>
            )}
          />
          {errors.buttons ? (
            <p className="text-xs text-destructive">{errors.buttons.root?.message ?? 'Revisá los botones'}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
