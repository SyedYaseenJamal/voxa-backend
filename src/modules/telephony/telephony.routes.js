import { Router } from 'express';
import { protect } from '../../middlewares/authenticate.js';
import {
  checkRecording,
  streamRecording,
  fetchRecordings,
  getCallAnalysis,
  processCall,
  transcribeCall,
  summarizeCall,
  getCompanyCallLogs,
  getAdminMasterLogs,
  getCallNotes,
  addCallNote,
} from './telephony.controller.js';

const router = Router();

import { requirePermission } from '../../middlewares/authorizePermission.js';

router.get('/company/logs', protect, requirePermission('calls:read'), getCompanyCallLogs);
router.get('/admin/logs', protect, requirePermission('calls:read'), getAdminMasterLogs);
router.get('/notes/:callId', protect, requirePermission('calls:read'), getCallNotes);
router.post('/notes/:callId', protect, requirePermission('calls:notes'), addCallNote);
router.post('/recordings/fetch', protect, requirePermission('calls:recordings'), fetchRecordings);

/**
 * @swagger
 * tags:
 *   name: Telephony & Call Analytics
 *   description: Audio recording streaming, search, transcription, and AI analysis endpoints
 */

/**
 * @swagger
 * /telephony/recordings/check:
 *   get:
 *     summary: Check if a call recording audio file exists on the server
 *     tags: [Telephony & Call Analytics]
 *     parameters:
 *       - in: query
 *         name: uniqueid
 *         schema:
 *           type: string
 *         description: Asterisk Call Unique ID (e.g. 1788979578.110)
 *         example: "1788979578.110"
 *       - in: query
 *         name: phone
 *         schema:
 *           type: string
 *         description: Phone number associated with the recording
 *         example: "03092836265"
 *       - in: query
 *         name: filename
 *         schema:
 *           type: string
 *         description: Exact recording filename if known
 *         example: "03092836265_1788979578.110.wav"
 *     responses:
 *       200:
 *         description: Recording status checked
 *         content:
 *           application/json:
 *             example:
 *               status: "success"
 *               message: "Recording checked"
 *               data:
 *                 exists: true
 *                 uniqueid: "1788979578.110"
 *                 filename: "03092836265_1788979578.110.wav"
 *                 stream_url: "/api/v1/telephony/recordings/stream?uniqueid=1788979578.110"
 *       400:
 *         description: Missing query parameter
 */
router.get('/recordings/check', checkRecording);

/**
 * @swagger
 * /telephony/recordings/stream:
 *   get:
 *     summary: Stream call recording audio file (WAV / MP3)
 *     tags: [Telephony & Call Analytics]
 *     parameters:
 *       - in: query
 *         name: uniqueid
 *         schema:
 *           type: string
 *         example: "1788979578.110"
 *       - in: query
 *         name: phone
 *         schema:
 *           type: string
 *         example: "03092836265"
 *       - in: query
 *         name: filename
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Audio stream binary
 *         content:
 *           audio/wav:
 *             schema:
 *               type: string
 *               format: binary
 *           audio/mpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Recording file not found
 */
router.get('/recordings/stream', streamRecording);

/**
 * @swagger
 * /telephony/calls/{callId}/analysis:
 *   get:
 *     summary: Retrieve saved call transcript & analysis record from MongoDB
 *     tags: [Telephony & Call Analytics]
 *     parameters:
 *       - in: path
 *         name: callId
 *         required: true
 *         schema:
 *           type: string
 *         description: Call ID or Asterisk Unique ID
 *         example: "1788979578.110"
 *     responses:
 *       200:
 *         description: Call Analysis record retrieved
 *       404:
 *         description: No analysis found for this call ID
 */
router.get('/calls/:callId/analysis', getCallAnalysis);

/**
 * @swagger
 * /telephony/calls/process:
 *   post:
 *     summary: Full Call Processing (Transcribe audio + Summarize intent & sentiment)
 *     tags: [Telephony & Call Analytics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               call_id:
 *                 type: string
 *                 example: "1788979578.110"
 *               uniqueid:
 *                 type: string
 *                 example: "1788979578.110"
 *               phone:
 *                 type: string
 *                 example: "03092836265"
 *               filename:
 *                 type: string
 *                 example: "03092836265_1788979578.110.wav"
 *               audio_url:
 *                 type: string
 *                 example: "https://example.com/audio.wav"
 *               script:
 *                 type: string
 *                 enum: [urdu, roman_urdu, mixed]
 *                 default: mixed
 *                 example: "mixed"
 *               force:
 *                 type: boolean
 *                 default: false
 *                 description: Force re-processing even if analysis already exists
 *     responses:
 *       200:
 *         description: Processing complete — returns transcript, summary & sentiment
 *       404:
 *         description: Audio file not found on server
 *       500:
 *         description: Processing failed
 */
router.post('/calls/process', processCall);

/**
 * @swagger
 * /telephony/calls/transcribe:
 *   post:
 *     summary: Transcribe call audio only (returns speaker diarization & text segments)
 *     tags: [Telephony & Call Analytics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               call_id:
 *                 type: string
 *                 example: "1788979578.110"
 *               uniqueid:
 *                 type: string
 *                 example: "1788979578.110"
 *               phone:
 *                 type: string
 *                 example: "03092836265"
 *               filename:
 *                 type: string
 *               audio_url:
 *                 type: string
 *               script:
 *                 type: string
 *                 enum: [urdu, roman_urdu, mixed]
 *                 default: mixed
 *     responses:
 *       200:
 *         description: Audio transcription returned
 *       404:
 *         description: Audio file not found
 */
router.post('/calls/transcribe', transcribeCall);

/**
 * @swagger
 * /telephony/calls/summarize:
 *   post:
 *     summary: Summarize call audio only (returns outcome, sentiment, key points & action items)
 *     tags: [Telephony & Call Analytics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               call_id:
 *                 type: string
 *                 example: "1788979578.110"
 *               uniqueid:
 *                 type: string
 *                 example: "1788979578.110"
 *               phone:
 *                 type: string
 *                 example: "03092836265"
 *               filename:
 *                 type: string
 *               audio_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Call summary generated
 *       404:
 *         description: Audio file not found
 */
router.post('/calls/summarize', summarizeCall);

export default router;
