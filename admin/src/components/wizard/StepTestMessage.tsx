import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const testMessageSchema = z.object({
  to: z.string().min(8).max(32),
  body: z.string().min(1).max(4096),
});

type Props = {
  to: string;
  body: string;
  onToChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSend: () => void;
  loading: boolean;
  error?: string;
  success?: string;
};

export function StepTestMessage({
  to,
  body,
  onToChange,
  onBodyChange,
  onSend,
  loading,
  error,
  success,
}: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enviá un mensaje de texto de prueba usando la API key de la app que acabás de crear (requiere número en
        formato internacional, sin + opcional).
      </p>
      <div className="space-y-2">
        <Label htmlFor="test-to">Número destino (E.164, ej. 50688887777)</Label>
        <Input id="test-to" value={to} onChange={(e) => onToChange(e.target.value)} placeholder="50688887777" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="test-body">Mensaje</Label>
        <Textarea id="test-body" value={body} onChange={(e) => onBodyChange(e.target.value)} rows={3} />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-green-700 dark:text-green-400">{success}</p> : null}
      <Button type="button" onClick={() => onSend()} disabled={loading}>
        {loading ? 'Enviando…' : 'Enviar mensaje de prueba'}
      </Button>
    </div>
  );
}
