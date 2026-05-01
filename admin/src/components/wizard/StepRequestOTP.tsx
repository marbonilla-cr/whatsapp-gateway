import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type OtpMethod = 'SMS' | 'VOICE';

type Props = {
  otpMethod: OtpMethod;
  onOtpMethodChange: (m: OtpMethod) => void;
  onSend: () => void;
  loading: boolean;
  error?: string;
};

export function StepRequestOTP({ otpMethod, onOtpMethodChange, onSend, loading, error }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Elegí cómo recibir el código de verificación de Meta para este número.
      </p>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Método de código">
        {(['SMS', 'VOICE'] as const).map((method) => (
          <label
            key={method}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
              otpMethod === method ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
            )}
          >
            <input
              type="radio"
              name="otp-method"
              value={method}
              checked={otpMethod === method}
              onChange={() => onOtpMethodChange(method)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm font-medium">{method === 'SMS' ? 'SMS' : 'Llamada de voz'}</span>
          </label>
        ))}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={() => onSend()} disabled={loading}>
        {loading ? 'Enviando…' : 'Enviar código'}
      </Button>
    </div>
  );
}
