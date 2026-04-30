import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  registerPin: string;
  twoFaPin: string;
  onRegisterPinChange: (v: string) => void;
  onTwoFaPinChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error?: string;
};

export function Step2FAPin({
  registerPin,
  twoFaPin,
  onRegisterPinChange,
  onTwoFaPinChange,
  onSubmit,
  loading,
  error,
}: Props) {
  const valid = registerPin.length === 6 && twoFaPin.length === 6;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Primero activá la mensajería con el PIN de registro de 6 dígitos. Luego configurá el PIN de verificación en
        dos pasos (puede ser el mismo u otro, según tu política).
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="wizard-reg-pin">PIN registro (mensajería)</Label>
          <Input
            id="wizard-reg-pin"
            inputMode="numeric"
            maxLength={6}
            value={registerPin}
            onChange={(e) => onRegisterPinChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="font-mono text-lg tracking-widest"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wizard-2fa">PIN 2FA (seis dígitos)</Label>
          <Input
            id="wizard-2fa"
            inputMode="numeric"
            maxLength={6}
            value={twoFaPin}
            onChange={(e) => onTwoFaPinChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="font-mono text-lg tracking-widest"
          />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={() => onSubmit()} disabled={loading || !valid}>
        {loading ? 'Guardando…' : 'Registrar número y 2FA'}
      </Button>
    </div>
  );
}
