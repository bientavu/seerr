import type { NotificationAgentWebhook } from '@server/lib/settings';
import logger from '@server/logger';
import { Notification } from '..';
import type { NotificationPayload } from './agent';
import WebhookAgent from './webhook';

// Custom (bientavu fork): a second webhook, configured only through env vars, that
// posts to WhatsApp via an Evolution API instance. It reuses WebhookAgent's templating,
// headers and error handling, but never touches the UI webhook slot, which stays free
// for other consumers (Moonfin auto-registers there and writes its own payload).
//
//   WHATSAPP_WEBHOOK_URL      e.g. http://host:8080/message/sendMedia/<instance>
//   WHATSAPP_WEBHOOK_APIKEY   sent as the "apikey" header (Evolution API auth)
//   WHATSAPP_WEBHOOK_PAYLOAD  raw JSON template, same {{variables}} as the UI webhook
//   WHATSAPP_GROUP_APPROVED   group JID for approved + auto-approved media
//   WHATSAPP_GROUP_AVAILABLE  group JID for available media
//
// Only those three notification types are sent; the agent is off unless URL and
// payload are both set.
export const WHATSAPP_TYPES =
  Notification.MEDIA_APPROVED |
  Notification.MEDIA_AUTO_APPROVED |
  Notification.MEDIA_AVAILABLE;

class WhatsappAgent extends WebhookAgent {
  protected getSettings(): NotificationAgentWebhook {
    const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL ?? '';
    const template = process.env.WHATSAPP_WEBHOOK_PAYLOAD ?? '';
    const apiKey = process.env.WHATSAPP_WEBHOOK_APIKEY;

    return {
      enabled: !!webhookUrl && !!template,
      embedPoster: false,
      types: WHATSAPP_TYPES,
      options: {
        webhookUrl,
        // WebhookAgent expects base64 of a JSON-encoded string (it JSON.parses twice).
        jsonPayload: Buffer.from(JSON.stringify(template)).toString('base64'),
        customHeaders: apiKey ? [{ key: 'apikey', value: apiKey }] : [],
      },
    };
  }

  protected buildPayload(type: Notification, payload: NotificationPayload) {
    const finalPayload = super.buildPayload(type, payload);
    finalPayload.number =
      type === Notification.MEDIA_AVAILABLE
        ? process.env.WHATSAPP_GROUP_AVAILABLE
        : process.env.WHATSAPP_GROUP_APPROVED;
    return finalPayload;
  }

  public async send(
    type: Notification,
    payload: NotificationPayload
  ): Promise<boolean> {
    // The parent logs as "webhook"; tag WhatsApp sends so the two are distinguishable.
    if ((type & WHATSAPP_TYPES) !== 0 && payload.notifySystem) {
      logger.info('Sending WhatsApp notification', {
        label: 'Notifications',
        type: Notification[type],
        subject: payload.subject,
      });
    }
    return super.send(type, payload);
  }
}

export default WhatsappAgent;
