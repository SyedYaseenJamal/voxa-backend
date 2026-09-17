import { Router } from 'express';
import { protect } from '../../middlewares/authenticate.js';
import { requirePermission } from '../../middlewares/authorizePermission.js';
import { getLeads, getLeadsStats, createSingleLead, importCsvLeads } from './leads.controller.js';

const router = Router();

router.use(protect);

router.get('/', requirePermission('leads:read'), getLeads);
router.get('/stats', requirePermission('leads:read'), getLeadsStats);

router.post('/single', requirePermission('leads:create'), createSingleLead);
router.post('/csv', requirePermission('leads:create'), importCsvLeads);

export default router;
