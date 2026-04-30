import { describe, expect, it } from 'vitest';
import { MetaApiClient } from '../services/meta';

const shouldRunIntegration = process.env.META_INTEGRATION_TEST === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('MetaApiClient integration', () => {
  it('sends a real message when integration env is configured', async () => {
    const accessToken = process.env.META_TEST_ACCESS_TOKEN;
    const wabaId = process.env.META_TEST_WABA_ID;
    const phoneNumberId = process.env.META_TEST_PHONE_NUMBER_ID;
    const recipientNumber = process.env.META_TEST_TO_NUMBER;

    if (!accessToken || !wabaId || !phoneNumberId || !recipientNumber) {
      throw new Error(
        'Missing integration env vars: META_TEST_ACCESS_TOKEN, META_TEST_WABA_ID, META_TEST_PHONE_NUMBER_ID, META_TEST_TO_NUMBER'
      );
    }

    const client = new MetaApiClient(wabaId, accessToken);
    const result = await client.sendMessage(phoneNumberId, {
      messaging_product: 'whatsapp',
      to: recipientNumber,
      type: 'text',
      text: { body: 'integration test message' },
    });

    expect(result.messageId).toBeTruthy();
  });
});
