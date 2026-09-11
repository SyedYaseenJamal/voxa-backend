import { Router } from 'express';
import {
  checkRecording,
  streamRecording,
  getCallAnalysis,
  processCall,
  transcribeCall,
  summarizeCall,
} from './telephony.controller.js';

const router = Router();

// Recording routes
router.get('/recordings/check', checkRecording);
router.get('/recordings/stream', streamRecording);

// AI Pipeline Analysis routes
router.get('/calls/:callId/analysis', getCallAnalysis);
router.post('/calls/process', processCall);
router.post('/calls/transcribe', transcribeCall);
router.post('/calls/summarize', summarizeCall);

export default router;
