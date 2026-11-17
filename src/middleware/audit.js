import { createAuditLog } from '../utils/auditLogger.js';

/**
 * Standard logAudit adapter aligning with createAuditLog utility
 */
export async function logAudit({
  user_id = null,
  actor_id = null,
  action,
  resource_type = null,
  entity_type = null,
  resource_id = 0,
  entity_id = 0,
  old_values = null,
  old_value = null,
  new_values = null,
  new_value = null,
  ip_address = null,
  user_agent = null,
  connection = null,
}) {
  return createAuditLog({
    actor_id: user_id || actor_id,
    action,
    entity_type: resource_type || entity_type || 'system',
    entity_id: resource_id || entity_id || 0,
    old_value: old_values || old_value,
    new_value: new_values || new_value,
    ip_address,
    connection,
  });
}

export default { logAudit };
