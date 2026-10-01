import { Notification } from '@server/lib/notifications';
import type { NotificationPayload } from '@server/lib/notifications/agents/agent';
import WhatsappAgent from '@server/lib/notifications/agents/whatsapp';
import axios from 'axios';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

const ENV = {
  WHATSAPP_WEBHOOK_URL: 'http://evolution.test/message/sendMedia/inst',
  WHATSAPP_WEBHOOK_APIKEY: 'k3y',
  WHATSAPP_WEBHOOK_PAYLOAD: JSON.stringify({
    number: 'template-default',
    caption: '{{subject}}',
  }),
  WHATSAPP_GROUP_APPROVED: 'approved@g.us',
  WHATSAPP_GROUP_AVAILABLE: 'available@g.us',
};

const payload: NotificationPayload = {
  subject: 'Dune (2021)',
  notifySystem: true,
  notifyAdmin: false,
};

describe('WhatsappAgent', () => {
  let post: ReturnType<typeof mock.method>;

  beforeEach(() => {
    Object.assign(process.env, ENV);
    post = mock.method(axios, 'post', async () => ({ data: {} }));
  });

  afterEach(() => {
    for (const key of Object.keys(ENV)) delete process.env[key];
    mock.restoreAll();
  });

  it('is disabled until URL and payload are set', () => {
    delete process.env.WHATSAPP_WEBHOOK_PAYLOAD;
    assert.equal(new WhatsappAgent().shouldSend(), false);
    process.env.WHATSAPP_WEBHOOK_PAYLOAD = ENV.WHATSAPP_WEBHOOK_PAYLOAD;
    assert.equal(new WhatsappAgent().shouldSend(), true);
  });

  for (const [type, group] of [
    [Notification.MEDIA_APPROVED, 'approved@g.us'],
    [Notification.MEDIA_AUTO_APPROVED, 'approved@g.us'],
    [Notification.MEDIA_AVAILABLE, 'available@g.us'],
  ] as const) {
    it(`routes ${Notification[type]} to ${group}`, async () => {
      assert.equal(await new WhatsappAgent().send(type, payload), true);
      assert.equal(post.mock.callCount(), 1);
      const [url, body, config] = post.mock.calls[0].arguments as [
        string,
        Record<string, unknown>,
        { headers: Record<string, string> },
      ];
      assert.equal(url, ENV.WHATSAPP_WEBHOOK_URL);
      assert.equal(body.number, group);
      assert.equal(body.caption, 'Dune (2021)');
      assert.equal(config.headers.apikey, 'k3y');
    });
  }

  it('ignores other notification types', async () => {
    await new WhatsappAgent().send(Notification.MEDIA_PENDING, payload);
    await new WhatsappAgent().send(Notification.MEDIA_DECLINED, payload);
    assert.equal(post.mock.callCount(), 0);
  });
});
