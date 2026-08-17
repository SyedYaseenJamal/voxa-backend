import { Router } from 'express';
import { protect } from '../../middlewares/authenticate.js';
import { getLeads, getLeadsStats } from './leads.controller.js';

const router = Router();

router.get('/', protect, getLeads);
router.get('/stats', protect, getLeadsStats);

export default router;
