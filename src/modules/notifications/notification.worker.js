import repo from './notification.repository.js';
import { sendEmail } from './transports/smtp.transport.js';
import { sendWhatsAppMessage } from './transports/whatsapp.transport.js';

let workerInterval = null;
let isProcessing = false;

/**
 * Process a single claimed notification
 */
async function processNotification(item) {
  try {
    const payload = typeof item.payload === 'string' ? JSON.parse(item.payload || '{}') : (item.payload || {});

    if (item.channel === 'email') {
      await sendEmail({
        to: item.recipient,
        subject: payload.subject || 'Notification from Course Platform',
        html: payload.html,
        text: payload.text,
      });
    } else if (item.channel === 'whatsapp') {
      await sendWhatsAppMessage({
        to: item.recipient,
        template: item.template_name,
        text: payload.text,
      });
    } else if (item.channel === 'inapp') {
      // In-app notifications are stored directly in notifications table
      // Successfully queued means available in database for user inbox
    } else {
      throw new Error(`Unsupported notification channel: ${item.channel}`);
    }

    await repo.markNotificationSent(item.id);
  } catch (error) {
    console.error(`[Notification Worker Error] Notification #${item.id} failed:`, error.message);
    await repo.markNotificationFailed(item.id, error.message);
  }
}

/**
 * Run a single iteration of the queue worker
 */
export async function runWorkerIteration(batchSize = 10) {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // 1. Stale processing lease recovery (e.g. crashed process)
    await repo.recoverStaleProcessing(5);

    // 2. Claim queued notifications via atomic CAS (MariaDB 10.4.32 compatible)
    const claimedItems = await repo.claimQueuedNotifications(batchSize);

    if (claimedItems.length > 0) {
      for (const item of claimedItems) {
        await processNotification(item);
      }
    }
  } catch (error) {
    console.error('[Notification Worker Iteration Error]:', error.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the background polling worker
 */
export function startNotificationWorker(pollIntervalMs = 5000) {
  if (workerInterval) return;
  console.log(`[Notification Worker] Starting background worker (poll interval: ${pollIntervalMs}ms)`);
  // Run first iteration immediately
  runWorkerIteration().catch(() => {});
  workerInterval = setInterval(() => {
    runWorkerIteration().catch(() => {});
  }, pollIntervalMs);
}

/**
 * Stop the background polling worker
 */
export function stopNotificationWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('[Notification Worker] Stopped background worker');
  }
}

export default {
  runWorkerIteration,
  startNotificationWorker,
  stopNotificationWorker,
};
