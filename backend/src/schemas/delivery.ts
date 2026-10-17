import { z } from "zod";
import { Channel } from "./common.js";

// Schemas de entrada de envio — API_SPEC §4.7.
// A validação de formato do destinatário (E.164 para WhatsApp, e-mail para Gmail) é
// responsabilidade do DeliveryService (→ 422 RECIPIENT_INVALID); aqui validamos a forma.

const RecipientInput = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  name: z.string().optional(),
});

const ChannelOptions = z.object({
  subject: z.string().optional(),
  body_text: z.string().optional(),
  caption: z.string().optional(),
});

const DeliveryChannelInput = z.object({
  channel: Channel,
  recipient: RecipientInput,
  options: ChannelOptions.optional(),
});

export const CreateDeliverySchema = z.object({
  approval_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  channels: z.array(DeliveryChannelInput).min(1),
});

export type CreateDeliveryInput = z.infer<typeof CreateDeliverySchema>;
