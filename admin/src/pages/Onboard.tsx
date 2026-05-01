import { useMemo } from 'react';
import { toast } from 'sonner';
import { DEFAULT_CLIENT_TENANT_ID } from '@/lib/constants';
import { EmbeddedSignupButton } from '@/components/EmbeddedSignupButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle } from 'lucide-react';

function useQueryParams(): URLSearchParams {
  return useMemo(() => new URLSearchParams(window.location.search), []);
}

export function Onboard() {
  const params = useQueryParams();
  const onboard = params.get('onboard');
  const reason = params.get('reason');
  const wabaId = params.get('waba_id');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Embedded Signup</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Conectá la cuenta de WhatsApp Business del tenant con el flujo oficial de Meta (Tech Provider).
        </p>
      </div>

      {onboard === 'success' && (
        <div className="flex gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-100">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Conexión completada</p>
            <p className="text-sm opacity-90">
              La WABA quedó registrada en el gateway
              {wabaId ? ` (id interno: ${wabaId}).` : '.'}
            </p>
          </div>
        </div>
      )}

      {onboard === 'error' && (
        <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Error en el callback</p>
            <p className="text-sm">{reason ?? 'Error desconocido'}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Iniciar flujo</CardTitle>
          <CardDescription>
            Se abrirá una ventana de Meta para autorizar la app. Asegurate de que{' '}
            <code className="rounded bg-muted px-1 text-xs">META_REDIRECT_URI</code> coincida exactamente con la URL
            configurada en Meta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <EmbeddedSignupButton
            tenantId={DEFAULT_CLIENT_TENANT_ID}
            onSuccess={() => toast.success('Onboarding completado')}
            onError={(m) => toast.error(m)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
