import { sendSuccess, sendPaginated } from '../../utils/response.js';
import service from './whatsapp.service.js';

export async function listContacts(req, res, next) {
  try {
    const result = await service.listContacts(req.query);
    return sendPaginated(res, result.contacts, result.page, result.limit, result.total);
  } catch (error) {
    next(error);
  }
}

export async function getContact(req, res, next) {
  try {
    const contact = await service.getContactById(req.params.id);
    return sendSuccess(res, 'WhatsApp contact retrieved successfully', contact);
  } catch (error) {
    next(error);
  }
}

export async function createContact(req, res, next) {
  try {
    const contact = await service.createContact(req.body, req.user?.id);
    return sendSuccess(res, 'WhatsApp contact created successfully', contact, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateContact(req, res, next) {
  try {
    const contact = await service.updateContact(req.params.id, req.body, req.user?.id);
    return sendSuccess(res, 'WhatsApp contact updated successfully', contact);
  } catch (error) {
    next(error);
  }
}

export async function setDefaultContact(req, res, next) {
  try {
    const contact = await service.setDefaultContact(req.params.id, req.user?.id);
    return sendSuccess(res, 'WhatsApp contact designated as default successfully', contact);
  } catch (error) {
    next(error);
  }
}

export async function updateContactStatus(req, res, next) {
  try {
    const contact = await service.toggleContactStatus(req.params.id, req.body.is_active, req.user?.id);
    return sendSuccess(res, 'WhatsApp contact status updated successfully', contact);
  } catch (error) {
    next(error);
  }
}

export async function deleteContact(req, res, next) {
  try {
    await service.deleteContact(req.params.id, req.user?.id);
    return sendSuccess(res, 'WhatsApp contact deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function getPreview(req, res, next) {
  try {
    const preview = await service.generatePreview(req.params.id, {
      courseId: req.query.course_id,
      customMessage: req.query.custom_message,
    });
    return sendSuccess(res, 'WhatsApp preview generated successfully', preview);
  } catch (error) {
    next(error);
  }
}

export default {
  listContacts,
  getContact,
  createContact,
  updateContact,
  setDefaultContact,
  updateContactStatus,
  deleteContact,
  getPreview,
};
