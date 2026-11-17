import * as service from './contact.service.js';
import validation from './contact.validation.js';

function getReqContext(req) {
  return {
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
  };
}

export async function submitContact(req, res, next) {
  try {
    const parsed = validation.submitContactSchema.parse(req.body);
    const result = await service.submitContact(parsed, getReqContext(req));
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listContacts(req, res, next) {
  try {
    const data = await service.listContacts(req.query);
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
}

export async function getContactById(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = await service.getContactById(id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateContactStatus(req, res, next) {
  try {
    const id = Number(req.params.id);
    const parsed = validation.updateContactStatusSchema.parse(req.body);
    const data = await service.updateContactStatus(id, parsed, req.user.id, getReqContext(req));
    res.json({ success: true, message: 'Status updated successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function assignContact(req, res, next) {
  try {
    const id = Number(req.params.id);
    const parsed = validation.assignContactSchema.parse(req.body);
    const data = await service.assignContact(id, parsed.assigned_to, req.user.id, getReqContext(req));
    res.json({ success: true, message: 'Contact assigned successfully', data });
  } catch (error) {
    next(error);
  }
}

export default {
  submitContact,
  listContacts,
  getContactById,
  updateContactStatus,
  assignContact,
};
