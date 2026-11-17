import { sendSuccess } from '../../utils/response.js';
import {
  provisionCounsellor as provisionCounsellorService,
  listCounsellors as listCounsellorsService,
  getCounsellorDetails as getCounsellorDetailsService,
  updateCounsellorStatus as updateCounsellorStatusService,
  promoteStudentToCounsellor as promoteStudentService,
} from './counsellor-admin.service.js';

export async function provisionCounsellor(req, res, next) {
  try {
    const counsellor = await provisionCounsellorService(
      req.body,
      req.user,
      req.ip
    );
    return sendSuccess(res, 'Counsellor provisioned successfully', { counsellor }, 201);
  } catch (error) {
    next(error);
  }
}

export async function listCounsellors(req, res, next) {
  try {
    const result = await listCounsellorsService(req.query);
    return sendSuccess(res, 'Counsellors retrieved successfully', result, 200);
  } catch (error) {
    next(error);
  }
}

export async function getCounsellor(req, res, next) {
  try {
    const result = await getCounsellorDetailsService(req.params.id);
    return sendSuccess(res, 'Counsellor details retrieved successfully', result, 200);
  } catch (error) {
    next(error);
  }
}

export async function updateCounsellorStatus(req, res, next) {
  try {
    const { status } = req.body;
    const counsellor = await updateCounsellorStatusService(
      req.params.id,
      status,
      req.user,
      req.ip
    );

    const message =
      status === 'blocked'
        ? 'Counsellor account deactivated and active sessions revoked'
        : 'Counsellor account activated successfully';

    return sendSuccess(res, message, { counsellor }, 200);
  } catch (error) {
    next(error);
  }
}

export async function promoteStudent(req, res, next) {
  try {
    const { email } = req.body;
    const counsellor = await promoteStudentService(
      email,
      req.user,
      req.ip
    );
    return sendSuccess(res, 'Student promoted to Counsellor successfully', { counsellor }, 200);
  } catch (error) {
    next(error);
  }
}

export default {
  provisionCounsellor,
  listCounsellors,
  getCounsellor,
  updateCounsellorStatus,
  promoteStudent,
};
