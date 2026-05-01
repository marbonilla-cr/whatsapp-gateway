import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WizardStepStatus = 'pending' | 'active' | 'completed' | 'error';

export type WizardStepDef = {
  id: string;
  label: string;
  status: WizardStepStatus;
};

type Props = {
  steps: WizardStepDef[];
  currentStepId: string;
  className?: string;
};

export function WizardStepper({ steps, currentStepId, className }: Props) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === currentStepId)
  );

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{
            width: `${steps.length <= 1 ? 100 : (activeIndex / (steps.length - 1)) * 100}%`,
          }}
        />
      </div>
      <ol className="flex flex-wrap gap-2 sm:gap-3">
        {steps.map((step, i) => {
          const isCurrent = step.id === currentStepId;
          const icon =
            step.status === 'completed' ? (
              <Check className="h-3.5 w-3.5 text-primary-foreground" aria-hidden />
            ) : step.status === 'error' ? (
              <X className="h-3.5 w-3.5 text-destructive-foreground" aria-hidden />
            ) : (
              <span className="text-[10px] font-semibold tabular-nums">{i + 1}</span>
            );

          return (
            <li
              key={step.id}
              className={cn(
                'flex min-w-0 flex-1 basis-[120px] flex-col gap-1 rounded-lg border px-2 py-2 text-left text-xs transition-colors sm:px-3',
                step.status === 'active' && 'border-primary bg-primary/5 shadow-sm',
                step.status === 'completed' && 'border-primary/40 bg-primary/10',
                step.status === 'error' && 'border-destructive bg-destructive/10',
                step.status === 'pending' && !isCurrent && 'border-border bg-card opacity-70'
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium',
                    step.status === 'completed' && 'bg-primary text-primary-foreground',
                    step.status === 'error' && 'bg-destructive text-destructive-foreground',
                    step.status === 'active' && 'bg-primary text-primary-foreground',
                    step.status === 'pending' && 'bg-muted text-muted-foreground'
                  )}
                >
                  {icon}
                </span>
                <span
                  className={cn(
                    'truncate font-medium leading-tight',
                    step.status === 'active' && 'text-foreground',
                    step.status === 'pending' && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
