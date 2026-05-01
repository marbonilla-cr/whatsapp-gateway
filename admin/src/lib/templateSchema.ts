import { z } from 'zod';

const quickReply = z.object({
  type: z.literal('QUICK_REPLY'),
  text: z.string().min(1).max(25),
});

const urlBtn = z.object({
  type: z.literal('URL'),
  text: z.string().min(1).max(25),
  url: z.string().url(),
});

const phoneBtn = z.object({
  type: z.literal('PHONE_NUMBER'),
  text: z.string().min(1).max(25),
  phone_number: z.string().min(5).max(20),
});

const buttonSchema = z.discriminatedUnion('type', [quickReply, urlBtn, phoneBtn]);

const headerSchema = z.union([
  z.object({ format: z.literal('TEXT'), text: z.string().min(1).max(60) }),
  z.object({
    format: z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']),
    example: z.object({ header_handle: z.array(z.string()).min(1) }),
  }),
  z.object({ format: z.literal('LOCATION') }),
]);

export const visualTemplateFormSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, números y guión bajo'),
    language: z.string().min(2).max(10),
    category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
    header: headerSchema.nullable(),
    body: z.object({
      text: z.string().min(1).max(1024),
      variableSamples: z.array(z.string()),
    }),
    footer: z.string().max(60),
    buttons: z.array(buttonSchema).max(3),
  })
  .superRefine((data, ctx) => {
    const re = /\{\{(\d+)\}\}/g;
    const needed = new Set<number>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(data.body.text)) !== null) {
      needed.add(Number(m[1]));
    }
    const maxVar = needed.size ? Math.max(...needed) : 0;
    for (let i = 1; i <= maxVar; i += 1) {
      const sample = data.body.variableSamples[i - 1]?.trim();
      if (needed.has(i) && !sample) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Falta ejemplo para {{${i}}}`,
          path: ['body', 'variableSamples', i - 1],
        });
      }
    }
  });

export type VisualTemplateFormValues = z.infer<typeof visualTemplateFormSchema>;
