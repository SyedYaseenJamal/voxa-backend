// // ─── Dialer Routes ────────────────────────────────────────────────────────────
// // Mounted at /api/v1/dialer
// // Full ARI + AMI + JsSIP Asterisk routing — replaces the LiveKit-based routes.

// import { Router } from 'express';
// import {
//   // Health & status
//   healthCheck,
//   getWssStatus,
//   getStasisChannels,
//   getSipCredentials,
//   diagPstn,
//   sseEvents,

//   // Call origination
//   postCallAgent,
//   postCallAi,
//   postCallPstn,

//   // Channel control
//   getCallsList,
//   answerCall,
//   hangupCall,
//   holdCall,
//   unholdCall,
//   muteCall,
//   unmuteCall,
//   transferCall,

//   // Two-leg PSTN call introspection
//   getPstnCalls,
//   getPstnCall,
//   deletePstnCall,

//   // Queue management (AMI)
//   addToQueue,
//   pauseQueue,
//   queueStatus,

//   // Callbacks (AMI Originate)
//   postCallCallback,

//   // Recordings
//   getRecording,
//   deleteRecording,

//   // Error handler
//   dialerErrorHandler,
// } from './dialer.controller.js';

// const router = Router();

// // ── Health & status ──────────────────────────────────────────────────────────
// router.get('/health',          healthCheck);
// router.get('/wss/status',      getWssStatus);
// router.get('/stasis/channels', getStasisChannels);
// router.get('/sip/credentials', getSipCredentials);
// router.get('/diag/pstn',       diagPstn);

// // ── Server-Sent Events stream (call state updates) ───────────────────────────
// // GET /api/v1/dialer/events
// // Returns a text/event-stream. The browser dialer subscribes to this for
// // real-time call state: PstnCallStarted, AgentAnswered, PstnCallBridged, etc.
// router.get('/events', sseEvents);

// // ── Call origination ─────────────────────────────────────────────────────────
// // POST /api/v1/dialer/calls/agent   { endpoint, callerId }
// router.post('/calls/agent', ...postCallAgent);

// // POST /api/v1/dialer/calls/ai      { to, flowId, flowVersion }
// router.post('/calls/ai', ...postCallAi);

// // POST /api/v1/dialer/calls/pstn    { to, agentExtension?, callerId?, pstnCallerId?, agentLeg? }
// // This is the primary outbound call endpoint used by the browser dialer.
// router.post('/calls/pstn', ...postCallPstn);

// // ── Channel list ─────────────────────────────────────────────────────────────
// router.get('/calls', getCallsList);

// // ── Per-channel operations ───────────────────────────────────────────────────
// router.post(  '/calls/:channelId/answer',   answerCall);
// router.delete('/calls/:channelId',          hangupCall);
// router.post(  '/calls/:channelId/hold',     holdCall);
// router.delete('/calls/:channelId/hold',     unholdCall);
// router.post(  '/calls/:channelId/mute',     muteCall);
// router.delete('/calls/:channelId/mute',     unmuteCall);
// router.post(  '/calls/:channelId/transfer', ...transferCall);

// // ── Two-leg PSTN call introspection ──────────────────────────────────────────
// router.get(   '/pstn/calls',          getPstnCalls);
// router.get(   '/pstn/calls/:callId',  getPstnCall);
// router.delete('/pstn/calls/:callId',  deletePstnCall);

// // ── Queue management (AMI) ───────────────────────────────────────────────────
// router.post('/queue/add',   addToQueue);
// router.post('/queue/pause', pauseQueue);
// router.get( '/queue/status', queueStatus);

// // ── Scheduled callbacks (AMI Originate) ──────────────────────────────────────
// router.post('/calls/callback', postCallCallback);

// // ── Call recordings ──────────────────────────────────────────────────────────
// router.get(   '/recordings/:name', getRecording);
// router.delete('/recordings/:name', deleteRecording);

// // ── Dialer-scoped error handler ───────────────────────────────────────────────
// router.use(dialerErrorHandler);

// export default router;
// ─── Dialer Routes ────────────────────────────────────────────────────────────
// Mounted at /api/v1/dialer
// Full ARI + AMI + JsSIP Asterisk routing — replaces the LiveKit-based routes.

import { Router } from 'express';
import {
  // Health & status
  healthCheck,
  getWssStatus,
  getStasisChannels,
  getSipCredentials,
  diagPstn,
  sseEvents,

  // Call origination
  postCallAgent,
  postCallAi,
  postCallPstn,

  // Channel control
  getCallsList,
  answerCall,
  hangupCall,
  holdCall,
  unholdCall,
  muteCall,
  unmuteCall,
  transferCall,

  // Two-leg PSTN call introspection
  getPstnCalls,
  getPstnCall,
  deletePstnCall,

  // Queue management (AMI)
  addToQueue,
  pauseQueue,
  queueStatus,

  // Callbacks (AMI Originate)
  postCallCallback,

  // Recordings
  getRecording,
  deleteRecording,

  // Error handler
  dialerErrorHandler,
} from './dialer.controller.js';

const router = Router();

// ── Health & status ──────────────────────────────────────────────────────────
router.get('/health',          healthCheck);
router.get('/wss/status',      getWssStatus);
router.get('/stasis/channels', getStasisChannels);
router.get('/sip/credentials', getSipCredentials);
router.get('/diag/pstn',       diagPstn);

// ── Server-Sent Events stream (call state updates) ───────────────────────────
// GET /api/v1/dialer/events
// Returns a text/event-stream. The browser dialer subscribes to this for
// real-time call state: PstnCallStarted, AgentAnswered, PstnCallBridged, etc.
router.get('/events', sseEvents);

// ── Call origination ─────────────────────────────────────────────────────────
// POST /api/v1/dialer/calls/agent   { endpoint, callerId }
router.post('/calls/agent', ...postCallAgent);

// POST /api/v1/dialer/calls/ai      { to, flowId, flowVersion }
router.post('/calls/ai', ...postCallAi);

// POST /api/v1/dialer/calls/pstn    { to, agentExtension?, callerId?, pstnCallerId?, agentLeg? }
// This is the primary outbound call endpoint used by the browser dialer.
router.post('/calls/pstn', ...postCallPstn);

// ── Channel list ─────────────────────────────────────────────────────────────
router.get('/calls', getCallsList);

// ── Per-channel operations ───────────────────────────────────────────────────
router.post(  '/calls/:channelId/answer',   answerCall);
router.delete('/calls/:channelId',          hangupCall);
router.post(  '/calls/:channelId/hold',     holdCall);
router.delete('/calls/:channelId/hold',     unholdCall);
router.post(  '/calls/:channelId/mute',     muteCall);
router.delete('/calls/:channelId/mute',     unmuteCall);
router.post(  '/calls/:channelId/transfer', ...transferCall);

// ── Two-leg PSTN call introspection ──────────────────────────────────────────
router.get(   '/pstn/calls',          getPstnCalls);
router.get(   '/pstn/calls/:callId',  getPstnCall);
router.delete('/pstn/calls/:callId',  deletePstnCall);

// ── Queue management (AMI) ───────────────────────────────────────────────────
router.post('/queue/add',   addToQueue);
router.post('/queue/pause', pauseQueue);
router.get( '/queue/status', queueStatus);

// ── Scheduled callbacks (AMI Originate) ──────────────────────────────────────
router.post('/calls/callback', postCallCallback);

// ── Call recordings ──────────────────────────────────────────────────────────
router.get(   '/recordings/:name', getRecording);
router.delete('/recordings/:name', deleteRecording);

// ── Dialer-scoped error handler ───────────────────────────────────────────────
router.use(dialerErrorHandler);

export default router;