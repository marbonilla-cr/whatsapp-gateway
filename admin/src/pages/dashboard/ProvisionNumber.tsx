import { useState } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EmbeddedSignupButton } from '@/components/EmbeddedSignupButton';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';

const STEPS = [
  'Elegí si conectás una WABA nueva o usás una existente',
  'Embedded Signup (Meta) para WABA nueva',
  'Registrá la app vertical y número en Apps',
  'OTP, 2FA y display name (desde Business Manager)',
  'Mensaje de prueba desde Diagnóstico',
] as const;

export function ProvisionNumber() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Provisioning de número</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Wizard orientado al flujo de Tech Provider: conexión con Meta y luego registro de app en el gateway.
        </p>
      </div>

      <div className="space-y-2">
        {STEPS.map((label, i) => (
          <div
            key={i}
            className={`flex gap-3 rounded-lg border p-3 text-sm ${
              i === step ? 'border-primary bg-primary/5' : 'bg-card'
            }`}
          >
            {i < step ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">
                Paso {i + 1}
              </p>
              <p className="text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Paso actual</CardTitle>
          <CardDescription>
            {step === 1
              ? 'Abrí el flujo de Embedded Signup. Al terminar, revisá WABAs en el menú.'
              : 'Seguí las indicaciones de Meta para OTP / verificación en Business Manager.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setStep(1)}>Conectar WABA nueva (recomendado)</Button>
              <Button variant="outline" onClick={() => setStep(2)}>
                Ya tengo WABA — ir a Apps
              </Button>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <EmbeddedSignupButton
                tenantId={user!.tenantId}
                onSuccess={() => {
                  toast.success('Onboarding completado');
                  setStep(2);
                }}
                onError={(m) => toast.error(m)}
              />
              <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
                Volver
              </Button>
            </div>
          )}
          {step >= 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Registrá la app vertical con Phone Number ID y WABA ID desde{' '}
                <Link href="/dashboard/apps" className="text-primary underline">
                  Apps
                </Link>
                . Luego probá el envío en Diagnóstico.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/dashboard/apps" className={cn(buttonVariants({ variant: 'secondary' }))}>
                  Ir a Apps
                </Link>
                <Link href="/dashboard/diagnostics" className={cn(buttonVariants({ variant: 'outline' }))}>
                  Diagnóstico
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
