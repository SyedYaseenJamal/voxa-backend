import { Router } from 'express';
import { protect } from '../../middlewares/authenticate.js';
import { getLeads, getLeadsStats, createSingleLead, importCsvLeads } from './leads.controller.js';

const router = Router();

router.get('/', protect, getLeads);
router.get('/stats', protect, getLeadsStats);

router.post('/single', protect, createSingleLead);
router.post('/csv', protect, importCsvLeads);

export default router;
