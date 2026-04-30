import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { loadFacebookSdk } from '@/lib/facebookSdk';

type Props = {
  tenantId: string;
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

export function EmbeddedSignupButton({ tenantId, onSuccess, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);

  const clearPoll = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleClick = useCallback(async () => {
    const appId = import.meta.env.VITE_META_APP_ID as string | undefined;
    if (!appId) {
      onError?.('VITE_META_APP_ID no está configurado');
      return;
    }

    setBusy(true);
    clearPoll();
    try {
      await loadFacebookSdk(appId);
      const start = await api.startOnboarding(tenantId);
      const w = 600;
      const h = 720;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      const popup = window.open(
        start.signup_url,
        'whatsapp_embedded_signup',
        `width=${w},height=${h},left=${left},top=${top},noopener,noreferrer`
      );
      if (!popup) {
        throw new Error('El navegador bloqueó la ventana emergente');
      }

      pollRef.current = window.setInterval(() => {
        void (async () => {
          try {
            const st = await api.getOnboardingStatus(start.session_id);
            if (st.status === 'completed') {
              clearPoll();
              popup.close();
              setBusy(false);
              onSuccess?.();
            } else if (st.status === 'failed') {
              clearPoll();
              popup.close();
              setBusy(false);
              onError?.(st.error_message ?? 'Onboarding falló');
            }
          } catch (e) {
            clearPoll();
            popup.close();
            setBusy(false);
            onError?.(e instanceof Error ? e.message : 'Error consultando estado');
          }
        })();
      }, 2000);
    } catch (e) {
      setBusy(false);
      onError?.(e instanceof Error ? e.message : 'No se pudo iniciar el flujo');
    }
  }, [tenantId, onSuccess, onError]);

  return (
    <Button type="button" onClick={() => void handleClick()} disabled={busy}>
      {busy ? 'Conectando…' : 'Connect WhatsApp Account'}
    </Button>
  );
}
