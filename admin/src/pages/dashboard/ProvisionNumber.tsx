import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { EmbeddedSignupButton } from '@/components/EmbeddedSignupButton';
import { useAuth } from '@/contexts/AuthContext';
import { api, type CreateAppResponse, type PhoneNumberRow } from '@/lib/api';
import { WizardStepper, type WizardStepDef, type WizardStepStatus } from '@/components/wizard/WizardStepper';
import { StepRequestOTP, type OtpMethod } from '@/components/wizard/StepRequestOTP';
import { StepVerifyOTP, verifyOtpSchema } from '@/components/wizard/StepVerifyOTP';
import { Step2FAPin } from '@/components/wizard/Step2FAPin';
import { StepDisplayName, displayNameSchema } from '@/components/wizard/StepDisplayName';
import { StepConfirmation, type ConfirmationSummary } from '@/components/wizard/StepConfirmation';
import { StepTestMessage, testMessageSchema } from '@/components/wizard/StepTestMessage';
import { toast } from 'sonner';

type WizardStep =
  | 'choose-method'
  | 'embedded-signup'
  | 'select-number'
  | 'request-otp'
  | 'verify-otp'
  | 'set-2fa-pin'
  | 'set-display-name'
  | 'confirmation'
  | 'test-message';

type MethodChoice = 'new' | 'existing' | null;

type WizardData = {
  tenantId: string;
  wabaId: string;
  phoneId: string;
  otpMethod: OtpMethod;
  otp: string;
  registerPin: string;
  twoFaPin: string;
  displayName: string;
  appName: string;
  vertical: string;
  callbackUrl: string;
  metaAccessToken: string;
  testTo: string;
  testBody: string;
};

const initialData = (tenantId: string): WizardData => ({
  tenantId,
  wabaId: '',
  phoneId: '',
  otpMethod: 'SMS',
  otp: '',
  registerPin: '',
  twoFaPin: '',
  displayName: '',
  appName: '',
  vertical: 'custom',
  callbackUrl: 'https://example.com/webhook',
  metaAccessToken: '',
  testTo: '',
  testBody: 'Hola, mensaje de prueba desde el gateway.',
});

const STEPPER_IDS_NEW = [
  'choose-method',
  'embedded-signup',
  'select-number',
  'request-otp',
  'verify-otp',
  'set-2fa-pin',
  'set-display-name',
  'confirmation',
  'test-message',
] as const;

const STEPPER_IDS_EXISTING = [
  'choose-method',
  'select-number',
  'request-otp',
  'verify-otp',
  'set-2fa-pin',
  'set-display-name',
  'confirmation',
  'test-message',
] as const;

const LABELS: Record<string, string> = {
  'choose-method': 'Método',
  'embedded-signup': 'Embedded Signup',
  'select-number': 'Número',
  'request-otp': 'Pedir código',
  'verify-otp': 'Verificar OTP',
  'set-2fa-pin': 'PIN y registro',
  'set-display-name': 'Nombre visible',
  confirmation: 'Confirmación',
  'test-message': 'Prueba',
};

function stepStatus(stepId: string, current: WizardStep, order: readonly string[]): WizardStepStatus {
  const curIdx = order.indexOf(current);
  const idx = order.indexOf(stepId);
  if (idx < 0) return 'pending';
  if (stepId === current) return 'active';
  if (idx < curIdx) return 'completed';
  return 'pending';
}

export function ProvisionNumber() {
  const { user } = useAuth();
  const tenantId = user!.tenantId;
  const qc = useQueryClient();

  const [method, setMethod] = useState<MethodChoice>(null);
  const [currentStep, setCurrentStep] = useState<WizardStep>('choose-method');
  const [data, setData] = useState<WizardData>(() => initialData(tenantId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdApp, setCreatedApp] = useState<CreateAppResponse | null>(null);

  const stepperSteps: WizardStepDef[] = useMemo(() => {
    const ids = method === 'existing' ? STEPPER_IDS_EXISTING : method === 'new' ? STEPPER_IDS_NEW : ['choose-method'];
    return ids.map((id) => ({
      id,
      label: LABELS[id] ?? id,
      status: stepStatus(id, currentStep, ids as unknown as string[]),
    }));
  }, [method, currentStep]);

  const { data: wabas = [] } = useQuery({
    queryKey: ['wabas', tenantId],
    queryFn: () => api.listWabas(tenantId),
    enabled: !!tenantId,
  });

  const effectiveWabaId = data.wabaId || wabas[0]?.id || '';

  const { data: phones = [], isLoading: phonesLoading } = useQuery({
    queryKey: ['waba-phones', tenantId, effectiveWabaId],
    queryFn: () => api.listWabaPhones(tenantId, effectiveWabaId),
    enabled: !!tenantId && !!effectiveWabaId && currentStep !== 'choose-method' && currentStep !== 'embedded-signup',
  });

  const selectedPhone = phones.find((p: PhoneNumberRow) => p.id === data.phoneId);

  const setField = <K extends keyof WizardData>(key: K, value: WizardData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const go = (step: WizardStep) => {
    setCurrentStep(step);
    setErrors({});
  };

  const requestOtpMut = useMutation({
    mutationFn: () =>
      api.requestPhoneCode(tenantId, effectiveWabaId, data.phoneId, data.otpMethod),
    onSuccess: () => {
      toast.success('Código solicitado');
      go('verify-otp');
    },
    onError: (e: Error) => setErrors({ request: e.message }),
  });

  const verifyOtpMut = useMutation({
    mutationFn: () => api.verifyPhoneCode(tenantId, effectiveWabaId, data.phoneId, data.otp),
    onSuccess: () => {
      toast.success('Número verificado');
      go('set-2fa-pin');
    },
    onError: (e: Error) => setErrors({ otp: e.message }),
  });

  const registerAnd2faMut = useMutation({
    mutationFn: async () => {
      await api.registerPhoneNumber(tenantId, effectiveWabaId, data.phoneId, data.registerPin);
      await api.setTwoFAPin(tenantId, effectiveWabaId, data.phoneId, data.twoFaPin);
    },
    onSuccess: () => {
      toast.success('Registro y 2FA configurados');
      go('set-display-name');
    },
    onError: (e: Error) => setErrors({ pin: e.message }),
  });

  const profileMut = useMutation({
    mutationFn: () =>
      api.updatePhoneProfileName(tenantId, effectiveWabaId, data.phoneId, data.displayName.trim()),
    onSuccess: () => {
      toast.success('Nombre actualizado');
      go('confirmation');
    },
    onError: (e: Error) => setErrors({ displayName: e.message }),
  });

  const createAppMut = useMutation({
    mutationFn: () =>
      api.createApp(tenantId, {
        name: data.appName.trim(),
        callbackUrl: data.callbackUrl.trim(),
        phoneNumberId: selectedPhone?.metaPhoneNumberId ?? '',
        wabaId: wabas.find((w) => w.id === effectiveWabaId)?.metaWabaId ?? '',
        metaAccessToken: data.metaAccessToken.trim(),
      }),
    onSuccess: (res) => {
      setCreatedApp(res);
      qc.invalidateQueries({ queryKey: ['apps', tenantId] });
      toast.success('App creada en el gateway');
      go('test-message');
    },
    onError: (e: Error) => setErrors({ create: e.message }),
  });

  const testMut = useMutation({
    mutationFn: () => {
      if (!createdApp?.apiKey) throw new Error('Sin API key');
      const parsed = testMessageSchema.safeParse({ to: data.testTo.trim(), body: data.testBody });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      }
      return api.sendMessage(createdApp.apiKey, {
        to: parsed.data.to.replace(/^\+/, ''),
        type: 'text',
        text: { body: parsed.data.body },
      });
    },
    onSuccess: () => toast.success('Mensaje enviado'),
    onError: (e: Error) => setErrors({ test: e.message }),
  });

  const summary: ConfirmationSummary | null =
    effectiveWabaId && data.phoneId
      ? {
          wabaLabel: `${wabas.find((w) => w.id === effectiveWabaId)?.metaWabaId ?? effectiveWabaId}`,
          phoneLabel: selectedPhone
            ? `${selectedPhone.displayPhoneNumber} (${selectedPhone.metaPhoneNumberId})`
            : data.phoneId,
          displayName: data.displayName.trim(),
          appName: data.appName.trim(),
          vertical: data.vertical,
          callbackUrl: data.callbackUrl.trim(),
        }
      : null;

  function renderStep() {
    switch (currentStep) {
      case 'choose-method':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Conectá una WABA nueva con Embedded Signup o continuá si ya tenés WABA y número en Meta.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setMethod('new');
                  go('embedded-signup');
                }}
              >
                WABA nueva (recomendado)
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setMethod('existing');
                  go('select-number');
                }}
              >
                Ya tengo WABA
              </Button>
            </div>
          </div>
        );

      case 'embedded-signup':
        return (
          <div className="space-y-4">
            <EmbeddedSignupButton
              tenantId={tenantId}
              onSuccess={() => {
                toast.success('Onboarding completado');
                void qc.invalidateQueries({ queryKey: ['wabas', tenantId] });
                setData((d) => ({ ...d, wabaId: '', phoneId: '' }));
                go('select-number');
              }}
              onError={(m) => toast.error(m)}
            />
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => go('choose-method')}>
                Volver
              </Button>
            </div>
          </div>
        );

      case 'select-number':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>WABA</Label>
              <Select
                value={effectiveWabaId}
                onValueChange={(v) => {
                  setField('wabaId', v);
                  setField('phoneId', '');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegí WABA" />
                </SelectTrigger>
                <SelectContent>
                  {wabas.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.metaWabaId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Número (fila en gateway)</Label>
              <Select
                value={data.phoneId}
                onValueChange={(v) => setField('phoneId', v)}
                disabled={!effectiveWabaId || phonesLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={phonesLoading ? 'Cargando…' : 'Elegí número'} />
                </SelectTrigger>
                <SelectContent>
                  {phones.map((p: PhoneNumberRow) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.displayPhoneNumber} · {p.metaPhoneNumberId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => go(method === 'new' ? 'embedded-signup' : 'choose-method')}>
                Atrás
              </Button>
              <Button
                disabled={!data.phoneId}
                onClick={() => {
                  if (!data.phoneId) return;
                  go('request-otp');
                }}
              >
                Siguiente
              </Button>
            </div>
          </div>
        );

      case 'request-otp':
        return (
          <div className="space-y-4">
            <StepRequestOTP
              otpMethod={data.otpMethod}
              onOtpMethodChange={(m) => setField('otpMethod', m)}
              onSend={() => {
                setErrors({});
                requestOtpMut.mutate();
              }}
              loading={requestOtpMut.isPending}
              error={errors.request}
            />
            <Button variant="outline" size="sm" onClick={() => go('select-number')}>
              Atrás
            </Button>
          </div>
        );

      case 'verify-otp':
        return (
          <div className="space-y-4">
            <StepVerifyOTP
              otp={data.otp}
              onOtpChange={(v) => setField('otp', v)}
              onVerify={() => {
                const p = verifyOtpSchema.safeParse({ otp: data.otp });
                if (!p.success) {
                  setErrors({ otp: p.error.issues[0]?.message ?? 'Código inválido' });
                  return;
                }
                setErrors({});
                verifyOtpMut.mutate();
              }}
              loading={verifyOtpMut.isPending}
              error={errors.otp}
            />
            <Button variant="outline" size="sm" onClick={() => go('request-otp')}>
              Atrás
            </Button>
          </div>
        );

      case 'set-2fa-pin':
        return (
          <div className="space-y-4">
            <Step2FAPin
              registerPin={data.registerPin}
              twoFaPin={data.twoFaPin}
              onRegisterPinChange={(v) => setField('registerPin', v)}
              onTwoFaPinChange={(v) => setField('twoFaPin', v)}
              onSubmit={() => {
                setErrors({});
                registerAnd2faMut.mutate();
              }}
              loading={registerAnd2faMut.isPending}
              error={errors.pin}
            />
            <Button variant="outline" size="sm" onClick={() => go('verify-otp')}>
              Atrás
            </Button>
          </div>
        );

      case 'set-display-name':
        return (
          <div className="space-y-4">
            <StepDisplayName
              displayName={data.displayName}
              onDisplayNameChange={(v) => setField('displayName', v)}
              onSubmit={() => {
                const p = displayNameSchema.safeParse({ displayName: data.displayName.trim() });
                if (!p.success) {
                  setErrors({ displayName: p.error.issues[0]?.message ?? 'Nombre inválido' });
                  return;
                }
                setErrors({});
                profileMut.mutate();
              }}
              loading={profileMut.isPending}
              error={errors.displayName}
            />
            <Button variant="outline" size="sm" onClick={() => go('set-2fa-pin')}>
              Atrás
            </Button>
          </div>
        );

      case 'confirmation':
        return summary ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nombre de la app</Label>
                <Input value={data.appName} onChange={(e) => setField('appName', e.target.value)} placeholder="Mi vertical" />
              </div>
              <div className="space-y-2">
                <Label>Vertical</Label>
                <Input value={data.vertical} onChange={(e) => setField('vertical', e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Callback URL</Label>
                <Input value={data.callbackUrl} onChange={(e) => setField('callbackUrl', e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Token de acceso Meta (WABA)</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  value={data.metaAccessToken}
                  onChange={(e) => setField('metaAccessToken', e.target.value)}
                  placeholder="EAAG…"
                />
                <p className="text-xs text-muted-foreground">
                  Pegá el token con permisos de la WABA desde Meta Business Suite. Se guarda cifrado en el gateway.
                </p>
              </div>
            </div>
            {errors.create ? <p className="text-sm text-destructive">{errors.create}</p> : null}
            <StepConfirmation
              summary={summary}
              onBack={() => go('set-display-name')}
              onPrimary={() => {
                if (!data.appName.trim() || !data.callbackUrl.trim() || !data.metaAccessToken.trim()) {
                  setErrors({ create: 'Completá nombre, callback y token Meta' });
                  return;
                }
                setErrors({});
                createAppMut.mutate();
              }}
              primaryLabel="Crear app en el gateway"
              primaryDisabled={
                !data.appName.trim() || !data.callbackUrl.trim() || !data.metaAccessToken.trim()
              }
              primaryLoading={createAppMut.isPending}
            />
          </div>
        ) : null;

      case 'test-message':
        return (
          <div className="space-y-4">
            {createdApp?.apiKey ? (
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                La API key quedó en memoria para este envío. Encontrala también en Apps si cerraste el modal.
              </p>
            ) : null}
            <StepTestMessage
              to={data.testTo}
              body={data.testBody}
              onToChange={(v) => setField('testTo', v)}
              onBodyChange={(v) => setField('testBody', v)}
              onSend={() => {
                setErrors({});
                testMut.mutate();
              }}
              loading={testMut.isPending}
              error={errors.test}
              success={testMut.isSuccess ? 'Enviado correctamente' : undefined}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/apps">Ir a Apps</Link>
              </Button>
              <Link href="/dashboard/diagnostics" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                Diagnóstico
              </Link>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Provisioning de número</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Flujo guiado: OTP, registro, 2FA, nombre visible y alta de app en el gateway — listo para grabación de App
          Review.
        </p>
      </div>

      {method ? <WizardStepper steps={stepperSteps} currentStepId={currentStep} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Paso</CardTitle>
          <CardDescription>
            {currentStep === 'confirmation'
              ? 'Revisá el resumen y completá los datos de la app vertical.'
              : currentStep === 'test-message'
                ? 'Probá el envío con la API key recién creada.'
                : 'Seguí las indicaciones; cada acción llama a la API de Meta vía el gateway.'}
          </CardDescription>
        </CardHeader>
        <CardContent>{renderStep()}</CardContent>
      </Card>
    </div>
  );
}
