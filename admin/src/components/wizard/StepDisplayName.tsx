import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const displayNameSchema = z.object({
  displayName: z.string().min(2).max(128),
});

type Props = {
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error?: string;
};

export function StepDisplayName({ displayName, onDisplayNameChange, onSubmit, loading, error }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        El nombre visible puede estar sujeto a revisión de Meta. Elegí un nombre que coincida con tu marca o
        negocio documentado.
      </div>
      <div className="space-y-2">
        <Label htmlFor="wizard-display">Nombre para mostrar</Label>
        <Input
          id="wizard-display"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder="Ej. La Antigua Lechería"
          maxLength={128}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={() => onSubmit()} disabled={loading || displayName.trim().length < 2}>
        {loading ? 'Actualizando…' : 'Guardar nombre'}
      </Button>
    </div>
  );
}
