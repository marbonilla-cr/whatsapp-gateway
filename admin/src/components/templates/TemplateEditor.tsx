import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

/** JSON editor for Meta template payload (P6 baseline). */
export function TemplateEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Payload JSON</Label>
      <Textarea className="min-h-[220px] font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
