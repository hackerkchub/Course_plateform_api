import repo from './notification.repository.js';
import validation from './notification.validation.js';
import { logAudit } from '../../middleware/audit.js';

function getReqContext(req) {
  return {
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
  };
}

export async function getSettings(req, res, next) {
  try {
    const settings = await repo.getAllSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}

export async function updateSetting(req, res, next) {
  try {
    const eventType = req.params.eventType;
    const parsed = validation.updateNotificationSettingSchema.parse(req.body);
    const existing = await repo.getSettingByEventType(eventType);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Event type not found in settings' });
    }

    const updated = await repo.updateSetting(eventType, parsed);

    await logAudit({
      user_id: req.user?.id,
      action: 'NOTIFICATION_SETTING_UPDATE',
      resource_type: 'notification_settings',
      resource_id: existing.id,
      old_values: existing,
      new_values: parsed,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    }).catch(() => {});

    res.json({ success: true, message: 'Notification settings updated successfully', data: updated });
  } catch (error) {
    next(error);
  }
}

export async function getLogs(req, res, next) {
  try {
    const data = await repo.getNotificationLogs(req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
}

export async function retryLog(req, res, next) {
  try {
    const id = Number(req.params.id);
    const retried = await repo.retryNotification(id);
    if (!retried) {
      return res.status(400).json({ success: false, message: 'Notification could not be retried (must be in failed status)' });
    }

    await logAudit({
      user_id: req.user?.id,
      action: 'NOTIFICATION_RETRY',
      resource_type: 'notifications',
      resource_id: id,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    }).catch(() => {});

    res.json({ success: true, message: 'Notification re-queued for processing' });
  } catch (error) {
    next(error);
  }
}

export async function recordWhatsAppConsent(req, res, next) {
  try {
    const parsed = validation.recordConsentSchema.parse(req.body);
    const reqCtx = getReqContext(req);

    let result;
    if (parsed.status === 'opted_in') {
      result = await repo.recordWhatsAppConsent({
        phone: parsed.phone,
        user_id: req.user?.id || null,
        source: parsed.source || 'web_form',
        evidence: parsed.evidence || 'User explicit opt-in form submission',
        ip: reqCtx.ip,
      });

      await logAudit({
        user_id: req.user?.id || null,
        action: 'WHATSAPP_CONSENT_OPT_IN',
        resource_type: 'whatsapp_consents',
        resource_id: result.id,
        new_values: { phone: result.phone, status: 'opted_in', source: parsed.source },
        ip_address: reqCtx.ip,
        user_agent: reqCtx.userAgent,
      }).catch(() => {});
    } else {
      result = await repo.recordWhatsAppOptOut({
        phone: parsed.phone,
        source: parsed.source || 'user_action',
        reason: parsed.reason || 'User requested opt-out',
      });

      await logAudit({
        user_id: req.user?.id || null,
        action: 'WHATSAPP_CONSENT_OPT_OUT',
        resource_type: 'whatsapp_consents',
        resource_id: result.id,
        new_values: { phone: result.phone, status: 'opted_out', reason: parsed.reason },
        ip_address: reqCtx.ip,
        user_agent: reqCtx.userAgent,
      }).catch(() => {});
    }

    res.json({
      success: true,
      message: `WhatsApp consent status set to '${parsed.status}'`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getWhatsAppConsentStatus(req, res, next) {
  try {
    const phone = req.query.phone;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }
    const consent = await repo.getWhatsAppConsent(phone);
    res.json({
      success: true,
      data: consent || { phone, status: 'pending', is_opted_in: false },
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getSettings,
  updateSetting,
  getLogs,
  retryLog,
  recordWhatsAppConsent,
  getWhatsAppConsentStatus,
};
