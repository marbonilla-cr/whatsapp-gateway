import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const verifyOtpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'Ingresá 6 dígitos'),
});

type Props = {
  otp: string;
  onOtpChange: (v: string) => void;
  onVerify: () => void;
  loading: boolean;
  error?: string;
};

export function StepVerifyOTP({ otp, onOtpChange, onVerify, loading, error }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="wizard-otp">Código de 6 dígitos</Label>
        <Input
          id="wizard-otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={otp}
          onChange={(e) => onOtpChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="max-w-[200px] font-mono text-lg tracking-widest"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={() => onVerify()} disabled={loading || otp.length !== 6}>
        {loading ? 'Verificando…' : 'Verificar'}
      </Button>
    </div>
  );
}
