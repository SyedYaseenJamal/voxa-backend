// ─── Dialer Routes ────────────────────────────────────────────────────────────
// Mounted at /api/v1/dialer
// No auth guard here — can be added later (restrict to authenticated users only).

import { Router } from 'express';
import { callOut, hangup, getToken } from './dialer.controller.js';

const router = Router();

// GET  /api/v1/dialer/token      — get token to join LiveKit room as browser user
router.get('/token', getToken);

// POST /api/v1/dialer/call       — initiate outbound call via Asterisk
router.post('/call', callOut);

// POST /api/v1/dialer/hangup     — end call by deleting LiveKit room
router.post('/hangup', hangup);


export default router;
