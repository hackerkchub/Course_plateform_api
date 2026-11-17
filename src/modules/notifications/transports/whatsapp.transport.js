import { getWhatsAppConsent } from '../notification.repository.js';

/**
 * Meta WhatsApp Cloud API Transport with mandatory consent enforcement.
 */
export async function sendWhatsAppMessage({ to, template, parameters, text }) {
  const cleanPhone = to.replace(/[^0-9+]/g, '');

  // 1. Mandatory Consent Check: Must be 'opted_in'
  const consent = await getWhatsAppConsent(cleanPhone);
  if (!consent || consent.status !== 'opted_in') {
    const errorMsg = `WhatsApp message suppressed: phone ${cleanPhone} has no opted_in consent (status: ${consent?.status || 'none'})`;
    console.warn(`[WhatsApp Guard] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // 2. Mock mode if not configured or in test environment
  if (!token || !phoneNumberId || process.env.NODE_ENV === 'test' || process.env.MOCK_NOTIFICATIONS === 'true') {
    const mockId = `mock-wamid-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    console.log(`[WhatsApp MOCK] To: ${cleanPhone} | Template: ${template || 'text'} | MockID: ${mockId}`);
    return { success: true, messageId: mockId, mock: true };
  }

  // 3. Dispatch to Meta WhatsApp Cloud API
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  let bodyPayload;
  if (template) {
    bodyPayload = {
      messaging_product: 'whatsapp',
      to: cleanPhone.replace('+', ''),
      type: 'template',
      template: {
        name: template,
        language: { code: 'en_US' },
        components: parameters ? [{ type: 'body', parameters }] : undefined,
      },
    };
  } else {
    bodyPayload = {
      messaging_product: 'whatsapp',
      to: cleanPhone.replace('+', ''),
      type: 'text',
      text: { body: text || '' },
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyPayload),
  });

  const data = await response.json();
  if (!response.ok) {
    const errMsg = data?.error?.message || `WhatsApp API error ${response.status}`;
    throw new Error(errMsg);
  }

  return {
    success: true,
    messageId: data.messages?.[0]?.id,
  };
}

export default { sendWhatsAppMessage };
