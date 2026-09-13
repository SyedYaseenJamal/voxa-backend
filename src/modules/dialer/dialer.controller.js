// // ─── Dialer Controller ────────────────────────────────────────────────────────
// // Full ARI (Asterisk REST Interface) + AMI (Asterisk Manager Interface) bridge.
// // Replaces the previous LiveKit-based implementation.
// //
// // PSTN flow:
// //   POST /calls/pstn { to: "03092836265" }
// //     -> ARI rings PJSIP/AGENT_EXTENSION (the browser softphone = leg A)
// //     -> ARI originates Local/<number>@outgoing-ptcl/n  (middle channel = leg B)
// //     -> dialplan does Dial(PJSIP/<number>@PTCL, 60)
// //     -> both legs join an ARI mixing bridge
// //
// // The browser (JsSIP) registers as AGENT_EXTENSION over wss:// and answers
// // leg A — that is what carries the agent's audio.

// import net from 'net';
// import https from 'https';
// import crypto from 'crypto';
// import { EventEmitter } from 'events';
// import WebSocket, { WebSocket as WS } from 'ws';

// // ── Config ──────────────────────────────────────────────────────────────────

// const env = (key, fallback) => {
//   const v = process.env[key];
//   return v === undefined || v === '' ? fallback : v;
// };
// const envBool = (key, fallback) => {
//   const v = process.env[key];
//   if (v === undefined || v === '') return fallback;
//   return /^(1|true|yes|on)$/i.test(v);
// };
// const envInt = (key, fallback) => {
//   const n = Number.parseInt(process.env[key] ?? '', 10);
//   return Number.isFinite(n) ? n : fallback;
// };

// export const CONFIG = {
//   ASTERISK_HOST:    env('ASTERISK_HOST',    '172.16.17.127'),
//   ARI_PORT:         envInt('ARI_PORT',       8089),
//   ARI_USER:         env('ARI_USER',          'voxa_ari_user'),
//   ARI_PASS:         env('ARI_PASS',          'ChooseSecurePassword123!'),
//   ARI_APP:          env('ARI_APP',           'voxa-ai-stasis'),
//   ARI_TIMEOUT_MS:   envInt('ARI_TIMEOUT_MS', 10000),

//   AMI_PORT:         envInt('AMI_PORT',       5038),
//   AMI_USER:         env('AMI_USER',          'voxa_ami_user'),
//   AMI_PASS:         env('AMI_PASS',          'ChooseSecurePassword123!'),
//   AMI_TIMEOUT_MS:   envInt('AMI_TIMEOUT_MS', 10000),

//   PTCL_TRUNK:       env('PTCL_TRUNK',        'PTCL'),
//   AGENT_EXTENSION:  env('AGENT_EXTENSION',   '1002'),
//   PSTN_CALLER_ID:   env('PSTN_CALLER_ID',    '1002'),
//   OUTBOUND_CONTEXT: env('OUTBOUND_CONTEXT',  'outgoing-ptcl'),
//   CALLBACK_CONTEXT: env('CALLBACK_CONTEXT',  'voxa-stasis'),
//   PSTN_ROUTE:       env('PSTN_ROUTE',        'local'),
//   LOCAL_DIAL_FORMAT:env('LOCAL_DIAL_FORMAT', 'national'),
//   LOCAL_NO_OPTIMIZE:envBool('LOCAL_NO_OPTIMIZE', true),
//   PSTN_FLOW:        env('PSTN_FLOW',         'direct'),
//   AGENT_RING_TIMEOUT: envInt('AGENT_RING_TIMEOUT', 30),
//   PSTN_RING_TIMEOUT:  envInt('PSTN_RING_TIMEOUT',  60),
//   COUNTRY_CODE:     env('COUNTRY_CODE',      '92'),

//   TLS_VERIFY:       envBool('ASTERISK_TLS_VERIFY', false),
//   TLS_CA_FILE:      env('ASTERISK_TLS_CA_FILE', ''),

//   WEBRTC_AGENT:     envBool('WEBRTC_AGENT', true),
//   SIP_WS_HOST:      env('SIP_WS_HOST',      ''),
//   SIP_EXTENSION:    env('SIP_EXTENSION',     '1002'),
//   SIP_PASSWORD:     env('SIP_PASSWORD',      'WebRtc1002@Secure2026'),
//   SIP_DISPLAY_NAME: env('SIP_DISPLAY_NAME', 'Agent 1002'),

//   CORS_ORIGIN:      env('CORS_ORIGIN',       ''),
// };

// CONFIG.ARI_BASE    = `https://${CONFIG.ASTERISK_HOST}:${CONFIG.ARI_PORT}`;
// CONFIG.ARI_WS_URL  = env('ARI_WS_URL',  `wss://${CONFIG.ASTERISK_HOST}:${CONFIG.ARI_PORT}/ari/events`);
// CONFIG.WSS_URL     = env('WSS_URL',     `wss://${CONFIG.ASTERISK_HOST}:${CONFIG.ARI_PORT}/ws`);
// CONFIG.BROWSER_WSS_URL = env(
//   'BROWSER_WSS_URL',
//   `wss://${CONFIG.SIP_WS_HOST || CONFIG.ASTERISK_HOST}:${CONFIG.ARI_PORT}/ws`
// );
// CONFIG.SIP_DOMAIN  = env('SIP_DOMAIN', CONFIG.SIP_WS_HOST || CONFIG.ASTERISK_HOST);

// const log = {
//   info:  (...a) => console.log( new Date().toISOString(), '[DIALER]', ...a),
//   warn:  (...a) => console.warn( new Date().toISOString(), '[DIALER]', ...a),
//   error: (...a) => console.error(new Date().toISOString(), '[DIALER]', ...a),
// };

// // ── TLS ─────────────────────────────────────────────────────────────────────

// const tlsOptions = { rejectUnauthorized: CONFIG.TLS_VERIFY };
// if (CONFIG.TLS_CA_FILE) {
//   try {
//     const { readFileSync } = await import('fs');
//     tlsOptions.ca = readFileSync(CONFIG.TLS_CA_FILE);
//     tlsOptions.rejectUnauthorized = true;
//   } catch (err) {
//     log.warn('[TLS] Could not read CA file:', err.message);
//   }
// }
// const ariAgent = new https.Agent({ ...tlsOptions, keepAlive: true, maxSockets: 20 });

// // ── Errors ───────────────────────────────────────────────────────────────────

// class HttpError extends Error {
//   constructor(status, message, detail) {
//     super(message);
//     this.status = status;
//     this.detail = detail;
//   }
// }
// const badRequest = (msg, detail) => new HttpError(400, msg, detail);

// // ── Validation ───────────────────────────────────────────────────────────────

// const RE_CHANNEL_ID  = /^[A-Za-z0-9._:@-]{1,128}$/;
// const RE_ENDPOINT    = /^[A-Za-z0-9._+-]{1,64}$/;
// const RE_RECORDING   = /^[A-Za-z0-9._/-]{1,128}$/;
// const MUTE_DIRECTIONS = new Set(['in', 'out', 'both']);

// function requireChannelId(value) {
//   const v = String(value ?? '');
//   if (!RE_CHANNEL_ID.test(v)) throw badRequest('Invalid channelId');
//   return v;
// }
// function requireEndpoint(value, field = 'endpoint') {
//   const v = String(value ?? '').trim();
//   if (!RE_ENDPOINT.test(v)) throw badRequest(`Invalid ${field}: use letters, digits, . _ + -`);
//   return v;
// }
// function requireRecordingName(value) {
//   const v = String(value ?? '');
//   if (!RE_RECORDING.test(v) || v.includes('..')) throw badRequest('Invalid recording name');
//   return v;
// }
// function cleanCallerId(value) {
//   const v = String(value ?? '').replace(/[\r\n]/g, ' ').trim();
//   if (v.length > 128) throw badRequest('callerId too long');
//   return v;
// }
// function cleanTag(value, field) {
//   const v = String(value ?? '').replace(/[\r\n,]/g, '').trim();
//   if (v.length > 128) throw badRequest(`${field} too long`);
//   return v;
// }

// // ── Number normalisation ─────────────────────────────────────────────────────

// export function toE164(input) {
//   const raw = String(input ?? '').trim();
//   if (!raw) throw badRequest('Destination number is empty');

//   let digits = raw.replace(/\D/g, '');
//   let plus = raw.startsWith('+');

//   if (!plus && digits.startsWith('00')) { digits = digits.slice(2); plus = true; }
//   if (!plus) {
//     const cc = CONFIG.COUNTRY_CODE;
//     if (/^0\d{9,10}$/.test(digits)) digits = cc + digits.slice(1);
//     else if (/^3\d{9}$/.test(digits)) digits = cc + digits;
//     else if (!digits.startsWith(cc) && digits.length <= 6) {
//       throw badRequest(
//         `"${raw}" looks like an internal extension. Use /calls/agent for extensions.`
//       );
//     }
//   }
//   const e164 = '+' + digits;
//   if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
//     throw badRequest(`"${raw}" is not a valid E.164 number (normalised to "${e164}")`);
//   }
//   return e164;
// }

// export function localDialTarget(e164) {
//   const digits = e164.replace(/^\+/, '');
//   const cc = CONFIG.COUNTRY_CODE;
//   switch (String(CONFIG.LOCAL_DIAL_FORMAT).toLowerCase()) {
//     case 'digits': return digits;
//     case 'national': return digits.startsWith(cc) ? '0' + digits.slice(cc.length) : digits;
//     default: return e164;
//   }
// }

// export function pstnDialString(e164) {
//   if (String(CONFIG.PSTN_ROUTE).toLowerCase() === 'trunk') {
//     return `PJSIP/${e164}@${CONFIG.PTCL_TRUNK}`;
//   }
//   const suffix = CONFIG.LOCAL_NO_OPTIMIZE ? '/n' : '';
//   return `Local/${localDialTarget(e164)}@${CONFIG.OUTBOUND_CONTEXT}${suffix}`;
// }

// function describeRoute(e164, agentExtension) {
//   const out = pstnDialString(e164);
//   return agentExtension
//     ? `PJSIP/${agentExtension} <-> ${out} -> ${CONFIG.PTCL_TRUNK} (${e164})`
//     : `${out} -> ${CONFIG.PTCL_TRUNK} (${e164})`;
// }

// function compactVars(obj) {
//   const out = {};
//   for (const [k, v] of Object.entries(obj)) {
//     if (v !== undefined && v !== null && String(v) !== '') out[k] = String(v);
//   }
//   return out;
// }

// // ── ARI HTTP ─────────────────────────────────────────────────────────────────

// const ariAuthHeader = 'Basic ' + Buffer.from(`${CONFIG.ARI_USER}:${CONFIG.ARI_PASS}`).toString('base64');

// function ariRequest(method, pathname, query = {}, body = null) {
//   return new Promise((resolve, reject) => {
//     const qs = new URLSearchParams();
//     for (const [k, v] of Object.entries(query)) {
//       if (v !== undefined && v !== null && String(v) !== '') qs.append(k, String(v));
//     }
//     const search = qs.toString();
//     const fullPath = pathname + (search ? `?${search}` : '');
//     const bodyStr = body ? JSON.stringify(body) : null;

//     const req = https.request(
//       {
//         hostname: CONFIG.ASTERISK_HOST,
//         port: CONFIG.ARI_PORT,
//         path: fullPath,
//         method,
//         agent: ariAgent,
//         headers: {
//           Authorization: ariAuthHeader,
//           Accept: 'application/json',
//           ...(bodyStr
//             ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
//             : {})
//         }
//       },
//       (res) => {
//         let data = '';
//         res.setEncoding('utf8');
//         res.on('data', (chunk) => { data += chunk; });
//         res.on('end', () => {
//           let parsed = null;
//           if (data) { try { parsed = JSON.parse(data); } catch { parsed = data; } }
//           log.info(`[ARI] ${method} ${fullPath} -> ${res.statusCode}`);
//           resolve({ status: res.statusCode, body: parsed });
//         });
//       }
//     );

//     req.setTimeout(CONFIG.ARI_TIMEOUT_MS, () => {
//       req.destroy(new Error(`ARI request timed out after ${CONFIG.ARI_TIMEOUT_MS}ms`));
//     });
//     req.on('error', (err) => reject(new HttpError(502, `ARI unreachable: ${err.message}`)));
//     if (bodyStr) req.write(bodyStr);
//     req.end();
//   });
// }

// async function ari(method, pathname, query, body) {
//   const res = await ariRequest(method, pathname, query, body);
//   if (res.status >= 400) {
//     const msg = (res.body && (res.body.message || res.body.error)) || `Asterisk returned ${res.status}`;
//     throw new HttpError(res.status, msg, res.body);
//   }
//   return res;
// }

// function sendAri(res, result) {
//   if (result.status === 204 || result.body === null) return res.status(result.status).end();
//   return res.status(result.status).json(result.body);
// }

// const hangupChannel = (channelId) =>
//   ariRequest('DELETE', `/ari/channels/${encodeURIComponent(channelId)}`).catch(() => {});

// // ── AMI client ───────────────────────────────────────────────────────────────

// function amiValue(value) {
//   const s = String(value ?? '');
//   if (/[\r\n]/.test(s)) throw badRequest('Illegal newline in AMI parameter');
//   return s;
// }

// class AmiClient extends EventEmitter {
//   constructor() {
//     super();
//     this.socket = null;
//     this.buffer = '';
//     this.greeted = false;
//     this.loggedIn = false;
//     this.pending = new Map();
//     this.seq = 0;
//     this.backoff = 1000;
//     this.closing = false;
//     this.reconnectTimer = null;
//   }

//   get ready() { return this.loggedIn; }

//   start() { this.closing = false; this._connect(); }

//   _connect() {
//     this.buffer = '';
//     this.greeted = false;
//     this.loggedIn = false;

//     const socket = net.createConnection({ host: CONFIG.ASTERISK_HOST, port: CONFIG.AMI_PORT });
//     this.socket = socket;
//     socket.setEncoding('utf8');
//     socket.setKeepAlive(true, 30000);

//     socket.on('connect', () => {
//       log.info(`[AMI] Connected to ${CONFIG.ASTERISK_HOST}:${CONFIG.AMI_PORT}`);
//       this.backoff = 1000;
//     });
//     socket.on('data', (chunk) => this._onData(chunk));
//     socket.on('error', (err) => log.warn('[AMI] Socket error:', err.message));
//     socket.on('close', () => {
//       this.loggedIn = false;
//       this._failPending('AMI connection closed');
//       this.emit('state', false);
//       if (!this.closing) this._scheduleReconnect();
//     });
//   }

//   _scheduleReconnect() {
//     if (this.reconnectTimer) return;
//     const delay = this.backoff;
//     this.backoff = Math.min(this.backoff * 2, 30000);
//     log.warn(`[AMI] Disconnected — reconnecting in ${delay}ms`);
//     this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this._connect(); }, delay);
//   }

//   _onData(chunk) {
//     this.buffer += chunk;
//     if (!this.greeted) {
//       const nl = this.buffer.indexOf('\r\n');
//       if (nl === -1) return;
//       const greeting = this.buffer.slice(0, nl);
//       this.buffer = this.buffer.slice(nl + 2);
//       this.greeted = true;
//       log.info('[AMI]', greeting.trim());
//       this._login();
//     }
//     let idx;
//     while ((idx = this.buffer.indexOf('\r\n\r\n')) !== -1) {
//       const raw = this.buffer.slice(0, idx);
//       this.buffer = this.buffer.slice(idx + 4);
//       if (raw.trim()) this._handlePacket(AmiClient.parse(raw));
//     }
//   }

//   static parse(raw) {
//     const pkt = Object.create(null);
//     for (const line of raw.split('\r\n')) {
//       const i = line.indexOf(':');
//       if (i === -1) continue;
//       const k = line.slice(0, i).trim();
//       const v = line.slice(i + 1).trim();
//       if (Object.prototype.hasOwnProperty.call(pkt, k)) {
//         pkt[k] = Array.isArray(pkt[k]) ? [...pkt[k], v] : [pkt[k], v];
//       } else { pkt[k] = v; }
//     }
//     return pkt;
//   }

//   _handlePacket(pkt) {
//     const entry = pkt.ActionID ? this.pending.get(pkt.ActionID) : null;
//     if (entry) {
//       if (pkt.Response !== undefined) {
//         entry.response = pkt;
//         const list = String(pkt.EventList || '').toLowerCase();
//         if (pkt.Response === 'Error' || list !== 'start') this._settle(pkt.ActionID);
//         return;
//       }
//       if (pkt.Event !== undefined) {
//         entry.events.push(pkt);
//         if (String(pkt.EventList || '').toLowerCase() === 'complete') this._settle(pkt.ActionID);
//       }
//       return;
//     }
//     if (pkt.Event !== undefined) this.emit('event', pkt);
//   }

//   _settle(actionId) {
//     const entry = this.pending.get(actionId);
//     if (!entry) return;
//     this.pending.delete(actionId);
//     clearTimeout(entry.timer);
//     const res = entry.response || {};
//     if (res.Response === 'Error') {
//       entry.reject(new HttpError(502, res.Message || 'AMI action failed', res));
//       return;
//     }
//     entry.resolve({ ...res, events: entry.events });
//   }

//   _failPending(reason) {
//     for (const [id, entry] of [...this.pending]) {
//       clearTimeout(entry.timer);
//       this.pending.delete(id);
//       entry.reject(new HttpError(503, reason));
//     }
//   }

//   _login() {
//     this._write('Login', { Username: CONFIG.AMI_USER, Secret: CONFIG.AMI_PASS })
//       .then(() => { this.loggedIn = true; log.info('[AMI] Authenticated'); this.emit('state', true); })
//       .catch((err) => { log.error('[AMI] Login failed:', err.message); this.socket?.destroy(); });
//   }

//   send(action, params = {}) {
//     if (!this.loggedIn) return Promise.reject(new HttpError(503, 'AMI not connected'));
//     return this._write(action, params);
//   }

//   _write(action, params) {
//     return new Promise((resolve, reject) => {
//       if (!this.socket || this.socket.destroyed) { reject(new HttpError(503, 'AMI socket not open')); return; }
//       let actionId, frame;
//       try {
//         actionId = params.ActionID ? amiValue(params.ActionID) : `voxa-${Date.now()}-${++this.seq}`;
//         frame = `Action: ${amiValue(action)}\r\nActionID: ${actionId}\r\n`;
//         for (const [key, value] of Object.entries(params)) {
//           if (key === 'ActionID' || value === undefined || value === null) continue;
//           for (const one of Array.isArray(value) ? value : [value]) {
//             if (String(one) === '') continue;
//             frame += `${amiValue(key)}: ${amiValue(one)}\r\n`;
//           }
//         }
//         frame += '\r\n';
//       } catch (err) { reject(err); return; }
//       const timer = setTimeout(() => {
//         this.pending.delete(actionId);
//         reject(new HttpError(504, `AMI action ${action} timed out`));
//       }, CONFIG.AMI_TIMEOUT_MS);
//       this.pending.set(actionId, { resolve, reject, timer, events: [], response: null });
//       this.socket.write(frame);
//     });
//   }

//   close() {
//     this.closing = true;
//     if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
//     this.reconnectTimer = null;
//     this._failPending('Server shutting down');
//     if (this.socket && !this.socket.destroyed) {
//       try { this.socket.write('Action: Logoff\r\n\r\n'); } catch { /* ignore */ }
//       this.socket.destroy();
//     }
//   }
// }

// export const ami = new AmiClient();

// // ── SSE fan-out ───────────────────────────────────────────────────────────────

// export const sseClients = new Set();

// export function broadcastEvent(payload) {
//   const data = `data: ${JSON.stringify(payload)}\n\n`;
//   for (const client of [...sseClients]) {
//     try { client.write(data); } catch { sseClients.delete(client); }
//   }
// }

// setInterval(() => {
//   for (const client of [...sseClients]) {
//     try { client.write(': heartbeat\n\n'); } catch { sseClients.delete(client); }
//   }
// }, 25000);

// // ── Call state ────────────────────────────────────────────────────────────────

// const stasisChannels   = new Map();
// const pendingBridgeJoins = new Map();
// const managedBridges   = new Set();
// const pstnCalls        = new Map();
// const channelToCall    = new Map();

// let ariWs        = null;
// let ariWsReady   = false;
// let ariWsBackoff = 1000;
// let ariWsAlive   = false;
// let shuttingDown = false;

// function callSnapshot(call) {
//   return {
//     callId:         call.callId,
//     bridgeId:       call.bridgeId,
//     state:          call.state,
//     destination:    call.destination,
//     agentExtension: call.agentExtension,
//     agentChannelId: call.agentChannelId,
//     pstnChannelId:  call.pstnChannelId,
//     route:          call.route,
//     createdAt:      call.createdAt,
//     answeredAt:     call.answeredAt || null
//   };
// }

// // ── Bridges ──────────────────────────────────────────────────────────────────

// async function createMixingBridge(name) {
//   const res = await ari('POST', '/ari/bridges', { type: 'mixing', name });
//   const bridgeId = res.body?.id;
//   if (!bridgeId) throw new HttpError(502, 'Asterisk did not return a bridge id', res.body);
//   managedBridges.add(bridgeId);
//   return bridgeId;
// }

// async function joinBridge(bridgeId, channelId) {
//   await ari('POST', `/ari/bridges/${encodeURIComponent(bridgeId)}/addChannel`, {
//     channel: channelId,
//     role: 'participant'
//   });
//   log.info(`[ARI] Channel ${channelId} joined bridge ${bridgeId}`);
// }

// async function destroyBridgeIfEmpty(bridgeId) {
//   if (!bridgeId || !managedBridges.has(bridgeId)) return;
//   try {
//     const res = await ariRequest('GET', `/ari/bridges/${encodeURIComponent(bridgeId)}`);
//     if (res.status === 404) { managedBridges.delete(bridgeId); return; }
//     const channels = res.body?.channels || [];
//     if (channels.length === 0) {
//       managedBridges.delete(bridgeId);
//       await ariRequest('DELETE', `/ari/bridges/${encodeURIComponent(bridgeId)}`);
//       log.info(`[ARI] Destroyed empty bridge ${bridgeId}`);
//     }
//   } catch (err) { log.warn('[ARI] Bridge cleanup failed:', err.message); }
// }

// // ── Two-leg PSTN ──────────────────────────────────────────────────────────────

// async function endpointStatus(resource) {
//   const r = await ariRequest('GET', `/ari/endpoints/PJSIP/${encodeURIComponent(resource)}`);
//   if (r.status === 404) return { exists: false, state: null };
//   if (r.status >= 400) return { exists: null, state: null, status: r.status };
//   return {
//     exists: true,
//     state:  r.body?.state ?? null,
//     activeChannels: Array.isArray(r.body?.channel_ids) ? r.body.channel_ids.length : null
//   };
// }

// const isOnline = (st) => st.exists === true && String(st.state).toLowerCase() !== 'offline';

// async function resolveFlow(agentExtension, override) {
//   if (override === true)  return { agentLeg: true,  reason: 'requested per call' };
//   if (override === false) return { agentLeg: false, reason: 'declined per call' };

//   const mode = String(CONFIG.PSTN_FLOW).toLowerCase();
//   if (mode === 'agent')  return { agentLeg: true,  reason: 'PSTN_FLOW=agent' };
//   if (mode === 'direct') return { agentLeg: false, reason: 'PSTN_FLOW=direct' };

//   const st = await endpointStatus(agentExtension).catch(() => ({ exists: null, state: null }));
//   if (isOnline(st)) return { agentLeg: true, reason: `${agentExtension} is registered` };
//   return {
//     agentLeg: false,
//     reason: st.exists === false
//       ? `PJSIP/${agentExtension} does not exist`
//       : `PJSIP/${agentExtension} is not registered`,
//     silent: true
//   };
// }

// async function assertAgentEndpointDialable(agentExtension) {
//   const st = await endpointStatus(agentExtension);
//   if (st.exists === false) {
//     throw new HttpError(503,
//       `PJSIP endpoint "${agentExtension}" does not exist on Asterisk. ` +
//       'Create it as a WebRTC endpoint first, or run with PSTN_FLOW=direct.'
//     );
//   }
//   if (st.exists === null) return; // can't tell — let originate decide
//   if (st.state && String(st.state).toLowerCase() === 'offline') {
//     throw new HttpError(503,
//       `PJSIP endpoint "${agentExtension}" exists but nothing is registered to it. ` +
//       'Open the dialer page and wait for it to reach "Registered" status.'
//     );
//   }
// }

// async function startPstnCall(opts) {
//   const { e164, agentExtension, callerId, pstnCallerId, vars } = opts;
//   await assertAgentEndpointDialable(agentExtension);
//   const bridgeId = await createMixingBridge(`voxa_pstn_${Date.now()}`);

//   const call = {
//     callId: bridgeId, bridgeId, state: 'ringing-agent',
//     destination: e164, agentExtension,
//     agentChannelId: null, pstnChannelId: null,
//     pstnCallerId, route: describeRoute(e164, agentExtension),
//     vars, createdAt: new Date().toISOString(), answeredAt: null, tearingDown: false
//   };
//   pstnCalls.set(call.callId, call);

//   log.info(`[CALL/PSTN] leg A -> PJSIP/${agentExtension} (bridge ${bridgeId}) for ${e164}`);

//   let agentRes;
//   try {
//     agentRes = await ari('POST', '/ari/channels',
//       {
//         endpoint: `PJSIP/${agentExtension}`,
//         app: CONFIG.ARI_APP,
//         appArgs: `pstn-agent,${call.callId}`,
//         callerId: callerId || e164,
//         timeout: CONFIG.AGENT_RING_TIMEOUT
//       },
//       { variables: compactVars({ ...vars, voxa_leg: 'agent', voxa_call_id: call.callId }) }
//     );
//   } catch (err) {
//     pstnCalls.delete(call.callId);
//     managedBridges.delete(bridgeId);
//     await ariRequest('DELETE', `/ari/bridges/${encodeURIComponent(bridgeId)}`).catch(() => {});
//     if (/allocation failed/i.test(err.message || '')) {
//       throw new HttpError(503,
//         `Asterisk could not allocate a channel to PJSIP/${agentExtension} (Allocation failed). ` +
//         'The endpoint is missing from pjsip.conf or has no registered contact.'
//       );
//     }
//     throw err;
//   }

//   call.agentChannelId = agentRes.body?.id || null;
//   if (call.agentChannelId) channelToCall.set(call.agentChannelId, call.callId);
//   broadcastEvent({ event: 'PstnCallStarted', ...callSnapshot(call) });
//   return call;
// }

// async function originatePstnLeg(call) {
//   const dialString = pstnDialString(call.destination);
//   log.info(`[CALL/PSTN] leg B -> ${dialString} callerId=${call.pstnCallerId}`);

//   const query = {
//     endpoint: dialString,
//     app: CONFIG.ARI_APP,
//     appArgs: `pstn-out,${call.callId}`,
//     callerId: call.pstnCallerId,
//     timeout: CONFIG.PSTN_RING_TIMEOUT
//   };
//   if (call.agentChannelId) query.originator = call.agentChannelId;

//   const res = await ari('POST', '/ari/channels', query, {
//     variables: compactVars({
//       ...call.vars,
//       voxa_leg: 'pstn',
//       voxa_call_id: call.callId,
//       destination: call.destination
//     })
//   });

//   call.pstnChannelId = res.body?.id || null;
//   if (call.pstnChannelId) channelToCall.set(call.pstnChannelId, call.callId);
//   call.state = 'dialing-pstn';
//   broadcastEvent({ event: 'PstnDialing', ...callSnapshot(call), dialString });
// }

// async function onAgentLegAnswered(channelId, callId) {
//   const call = pstnCalls.get(callId);
//   if (!call) { log.warn(`[CALL/PSTN] Agent leg ${channelId} has no call ${callId}`); await hangupChannel(channelId); return; }
//   call.agentChannelId = channelId;
//   channelToCall.set(channelId, callId);
//   call.state = 'agent-answered';
//   broadcastEvent({ event: 'AgentAnswered', ...callSnapshot(call) });

//   try {
//     await joinBridge(call.bridgeId, channelId);
//     await originatePstnLeg(call);
//   } catch (err) {
//     log.error('[CALL/PSTN] Outbound leg failed:', err.message);
//     call.endReason = `outbound leg failed: ${err.message}`;
//     broadcastEvent({ event: 'PstnCallFailed', ...callSnapshot(call), error: err.message, detail: err.detail });
//     await teardownCall(callId, call.endReason);
//   }
// }

// async function onPstnLegAnswered(channelId, callId) {
//   const call = pstnCalls.get(callId);
//   if (!call) { log.warn(`[CALL/PSTN] Outbound leg ${channelId} has no call ${callId}`); await hangupChannel(channelId); return; }
//   call.pstnChannelId = channelId;
//   channelToCall.set(channelId, callId);

//   try {
//     await joinBridge(call.bridgeId, channelId);
//     call.state = 'bridged';
//     call.answeredAt = new Date().toISOString();
//     broadcastEvent({ event: 'PstnCallBridged', ...callSnapshot(call) });
//   } catch (err) {
//     log.error(`[CALL/PSTN] Could not bridge outbound leg ${channelId}:`, err.message);
//     call.endReason = `bridge failed: ${err.message}`;
//     broadcastEvent({ event: 'PstnCallFailed', ...callSnapshot(call), error: err.message });
//     await teardownCall(callId, call.endReason);
//   }
// }

// async function teardownCall(callId, reason) {
//   const call = pstnCalls.get(callId);
//   if (!call || call.tearingDown) return;
//   call.tearingDown = true;
//   call.endReason = reason || call.endReason || 'teardown';
//   log.info(`[CALL/PSTN] Tearing down ${callId} (${call.endReason})`);
//   const legs = [call.agentChannelId, call.pstnChannelId].filter(Boolean);
//   await Promise.all(legs.map(hangupChannel));
//   if (legs.length === 0) finalizeCall(callId, call.endReason);
// }

// function finalizeCall(callId, reason) {
//   const call = pstnCalls.get(callId);
//   if (!call) return;
//   if (call.agentChannelId) channelToCall.delete(call.agentChannelId);
//   if (call.pstnChannelId) channelToCall.delete(call.pstnChannelId);
//   pstnCalls.delete(callId);
//   const snapshot = callSnapshot(call);
//   snapshot.state = 'ended';
//   broadcastEvent({ event: 'PstnCallEnded', ...snapshot, lastState: call.state, reason: reason || call.endReason || '' });
//   log.info(`[CALL/PSTN] Call ${callId} ended (${reason || call.endReason || 'normal'})`);
//   destroyBridgeIfEmpty(call.bridgeId).catch(() => {});
// }

// function handleLegGone(channelId, cause) {
//   const callId = channelToCall.get(channelId);
//   if (!callId) return;
//   channelToCall.delete(channelId);
//   const call = pstnCalls.get(callId);
//   if (!call) return;

//   const leg = call.agentChannelId === channelId ? 'agent' : 'pstn';
//   if (leg === 'agent') call.agentChannelId = null; else call.pstnChannelId = null;
//   broadcastEvent({ event: 'PstnLegEnded', callId, leg, channelId, cause: cause || '' });

//   const survivor = call.agentChannelId || call.pstnChannelId;
//   if (survivor) {
//     if (!call.endReason) call.endReason = `${leg} leg hung up${cause ? ` (${cause})` : ''}`;
//     call.tearingDown = true;
//     hangupChannel(survivor);
//     return;
//   }
//   finalizeCall(callId, call.endReason || cause);
// }

// // ── ARI WebSocket ─────────────────────────────────────────────────────────────

// async function handleStasisStart(evt) {
//   const channelId = evt.channel?.id;
//   if (!channelId) return;
//   const args  = evt.args || [];
//   const vars  = evt.channel?.channelvars || {};
//   const state = evt.channel?.state;
//   const role  = args[0] || '';

//   log.info(`[ARI-WS] StasisStart channel=${channelId} state=${state} args=${args.join(',')}`);
//   stasisChannels.set(channelId, { answered: state === 'Up', role, args, vars, startedAt: new Date().toISOString() });

//   if (state !== 'Up') {
//     try {
//       const ans = await ariRequest('POST', `/ari/channels/${encodeURIComponent(channelId)}/answer`);
//       const entry = stasisChannels.get(channelId);
//       if (ans.status < 400) { if (entry) entry.answered = true; log.info(`[ARI-WS] Answered channel ${channelId}`); }
//       else log.warn(`[ARI-WS] Answer returned ${ans.status}:`, ans.body);
//     } catch (err) { log.error('[ARI-WS] Failed to answer channel:', err.message); }
//   }

//   broadcastEvent({ event: 'StasisStart', channelId, role, args, vars, state });

//   if (role === 'pstn-agent') { await onAgentLegAnswered(channelId, args[1]); return; }
//   if (role === 'pstn-out')   { await onPstnLegAnswered(channelId, args[1]);  return; }

//   const bridgeId = pendingBridgeJoins.get(channelId) || (role === 'transfer' ? args[1] : null);
//   if (bridgeId) {
//     pendingBridgeJoins.delete(channelId);
//     try {
//       await joinBridge(bridgeId, channelId);
//       broadcastEvent({ event: 'TransferBridged', channelId, bridgeId });
//     } catch (err) {
//       log.error(`[ARI-WS] Could not bridge ${channelId} into ${bridgeId}:`, err.message);
//       broadcastEvent({ event: 'TransferFailed', channelId, bridgeId, error: err.message });
//     }
//   }
// }

// async function handleAriEvent(evt) {
//   const channelId = evt.channel?.id;

//   switch (evt.type) {
//     case 'StasisStart':
//       await handleStasisStart(evt);
//       break;

//     case 'StasisEnd':
//       log.info(`[ARI-WS] StasisEnd channel=${channelId}`);
//       stasisChannels.delete(channelId);
//       pendingBridgeJoins.delete(channelId);
//       broadcastEvent({ event: 'StasisEnd', channelId });
//       break;

//     case 'ChannelStateChange': {
//       const chState = evt.channel?.state;
//       const entry = stasisChannels.get(channelId);
//       if (entry) entry.state = chState;
//       broadcastEvent({ event: 'ChannelStateChange', channelId, state: chState, callId: channelToCall.get(channelId) || null });
//       break;
//     }

//     case 'ChannelHangupRequest':
//       broadcastEvent({ event: 'ChannelHangupRequest', channelId });
//       break;

//     case 'ChannelDestroyed':
//       stasisChannels.delete(channelId);
//       pendingBridgeJoins.delete(channelId);
//       broadcastEvent({
//         event: 'ChannelDestroyed', channelId,
//         cause: evt.cause, causeText: evt.cause_txt,
//         callId: channelToCall.get(channelId) || null
//       });
//       handleLegGone(channelId, evt.cause_txt || (evt.cause != null ? `cause ${evt.cause}` : ''));
//       break;

//     case 'ChannelDtmfReceived':
//       broadcastEvent({ event: 'ChannelDtmfReceived', channelId, digit: evt.digit });
//       break;

//     case 'ChannelEnteredBridge':
//       broadcastEvent({ event: 'ChannelEnteredBridge', channelId, bridgeId: evt.bridge?.id, callId: channelToCall.get(channelId) || null });
//       break;

//     case 'ChannelLeftBridge': {
//       const bId = evt.bridge?.id;
//       broadcastEvent({ event: 'ChannelLeftBridge', channelId, bridgeId: bId });
//       if (bId && !pstnCalls.has(bId)) await destroyBridgeIfEmpty(bId);
//       break;
//     }

//     case 'BridgeDestroyed':
//       managedBridges.delete(evt.bridge?.id);
//       break;

//     default:
//       break;
//   }
// }

// function connectAriWebSocket() {
//   if (shuttingDown) return;

//   const qs = new URLSearchParams({
//     app: CONFIG.ARI_APP,
//     subscribeAll: 'false',
//     api_key: `${CONFIG.ARI_USER}:${CONFIG.ARI_PASS}`
//   });
//   const url = `${CONFIG.ARI_WS_URL}?${qs.toString()}`;
//   log.info(`[ARI-WS] Connecting to ${CONFIG.ARI_WS_URL} (app=${CONFIG.ARI_APP})`);

//   ariWs = new WS(url, { ...tlsOptions, headers: { Authorization: ariAuthHeader }, handshakeTimeout: 10000 });

//   ariWs.on('open', () => {
//     log.info('[ARI-WS] Connected — Stasis app registered');
//     ariWsReady = true;
//     ariWsAlive = true;
//     ariWsBackoff = 1000;
//     stasisChannels.clear();
//     pendingBridgeJoins.clear();
//     pstnCalls.clear();
//     channelToCall.clear();
//     broadcastEvent({ event: 'AriConnected' });
//   });

//   ariWs.on('pong', () => { ariWsAlive = true; });

//   ariWs.on('message', (raw) => {
//     let evt;
//     try { evt = JSON.parse(raw); } catch { return; }
//     handleAriEvent(evt).catch((err) => log.error('[ARI-WS] Handler error:', err.message));
//   });

//   ariWs.on('unexpected-response', (_req, res) => {
//     log.error(`[ARI-WS] Handshake rejected with HTTP ${res.statusCode} — check ARI user/password`);
//   });

//   ariWs.on('error', (err) => log.error('[ARI-WS] Error:', err.message));

//   ariWs.on('close', (code) => {
//     ariWsReady = false;
//     ariWs = null;
//     broadcastEvent({ event: 'AriDisconnected', code });
//     if (shuttingDown) return;
//     const delay = ariWsBackoff;
//     ariWsBackoff = Math.min(ariWsBackoff * 2, 30000);
//     log.warn(`[ARI-WS] Closed (${code}) — reconnecting in ${delay}ms`);
//     setTimeout(connectAriWebSocket, delay);
//   });
// }

// // ARI WebSocket heartbeat
// setInterval(() => {
//   if (!ariWs || ariWs.readyState !== WS.OPEN) return;
//   if (!ariWsAlive) { log.warn('[ARI-WS] No pong — terminating socket'); ariWs.terminate(); return; }
//   ariWsAlive = false;
//   ariWs.ping();
// }, 20000);

// // ── Route helpers ─────────────────────────────────────────────────────────────

// const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// function requireAri(_req, res, next) {
//   if (!ariWsReady) {
//     return res.status(503).json({
//       error: `ARI event socket not connected — Stasis app "${CONFIG.ARI_APP}" is not registered yet`
//     });
//   }
//   return next();
// }

// function muteDirection(req) {
//   const raw = req.body?.direction ?? req.query?.direction ?? 'out';
//   const dir = String(raw);
//   if (!MUTE_DIRECTIONS.has(dir)) throw badRequest('direction must be in, out or both');
//   return dir;
// }

// const RE_QUEUE = /^[A-Za-z0-9._-]{1,80}$/;
// const RE_IFACE = /^[A-Za-z0-9._/@+-]{1,80}$/;
// function requireQueue(v) {
//   const s = String(v ?? '').trim();
//   if (!RE_QUEUE.test(s)) throw badRequest('Invalid queue name');
//   return s;
// }
// function requireInterface(v) {
//   const s = String(v ?? '').trim();
//   if (!RE_IFACE.test(s)) throw badRequest('Invalid interface');
//   return s;
// }

// // ── Exported route handlers ───────────────────────────────────────────────────

// export const healthCheck = (req, res) => {
//   res.json({
//     status: ariWsReady ? 'ok' : 'degraded',
//     ariWsReady,
//     amiReady: ami.ready,
//     activeStasisChannels: stasisChannels.size,
//     activePstnCalls: pstnCalls.size,
//     sseClients: sseClients.size,
//     timestamp: new Date().toISOString()
//   });
// };

// export const getWssStatus = (req, res) => {
//   res.json({
//     ariWsReady,
//     amiReady: ami.ready,
//     webrtcAgent: CONFIG.WEBRTC_AGENT,
//     browserWssUrl: CONFIG.BROWSER_WSS_URL,
//     sipDomain: CONFIG.SIP_DOMAIN,
//     ariApp: CONFIG.ARI_APP,
//     asteriskHost: CONFIG.ASTERISK_HOST,
//     ptclTrunk: CONFIG.PTCL_TRUNK,
//     pstnCallerId: CONFIG.PSTN_CALLER_ID,
//     agentExtension: CONFIG.AGENT_EXTENSION,
//     pstnFlow: CONFIG.PSTN_FLOW,
//     pstnRoute: CONFIG.PSTN_ROUTE,
//     outboundContext: CONFIG.OUTBOUND_CONTEXT,
//     localDialFormat: CONFIG.LOCAL_DIAL_FORMAT,
//     sampleDialString: pstnDialString(`+${CONFIG.COUNTRY_CODE}3001234567`),
//     stasisChannels: [...stasisChannels.keys()],
//     pstnCalls: [...pstnCalls.values()].map(callSnapshot)
//   });
// };

// export const getSipCredentials = (req, res) => {
//   if (!CONFIG.WEBRTC_AGENT) {
//     return res.json({ enabled: false, reason: 'WEBRTC_AGENT is disabled' });
//   }
//   res.json({
//     enabled: true,
//     wsUrl: CONFIG.BROWSER_WSS_URL,
//     uri: `sip:${CONFIG.SIP_EXTENSION}@${CONFIG.SIP_DOMAIN}`,
//     authUser: CONFIG.SIP_EXTENSION,
//     password: CONFIG.SIP_PASSWORD,
//     displayName: CONFIG.SIP_DISPLAY_NAME,
//     realm: CONFIG.SIP_DOMAIN,
//     agentExtension: CONFIG.AGENT_EXTENSION
//   });
// };

// export const diagPstn = wrap(async (req, res) => {
//   const sample = `+${CONFIG.COUNTRY_CODE}3001234567`;
//   const [trunk, agent] = await Promise.all([
//     endpointStatus(CONFIG.PTCL_TRUNK),
//     endpointStatus(CONFIG.AGENT_EXTENSION)
//   ]);
//   const notes = [];
//   if (trunk.exists === false) notes.push(`Trunk endpoint PJSIP/${CONFIG.PTCL_TRUNK} not found.`);
//   if (agent.exists === false) notes.push(`PJSIP/${CONFIG.AGENT_EXTENSION} does not exist.`);
//   else if (!isOnline(agent)) notes.push(`PJSIP/${CONFIG.AGENT_EXTENSION} exists but nothing is registered.`);
//   const flow = await resolveFlow(CONFIG.AGENT_EXTENSION);
//   res.json({
//     configuredFlow: CONFIG.PSTN_FLOW,
//     effectiveFlow: flow.agentLeg ? 'agent' : 'direct',
//     effectiveFlowReason: flow.reason,
//     audioPath: flow.agentLeg ? `PJSIP/${CONFIG.AGENT_EXTENSION} <-> bridge <-> ${CONFIG.PTCL_TRUNK}` : 'none — calls will be silent',
//     route: CONFIG.PSTN_ROUTE,
//     outboundContext: CONFIG.OUTBOUND_CONTEXT,
//     sampleDialString: pstnDialString(sample),
//     trunk: { name: CONFIG.PTCL_TRUNK, ...trunk },
//     agentExtension: { name: CONFIG.AGENT_EXTENSION, ...agent },
//     webrtc: { enabled: CONFIG.WEBRTC_AGENT, wsUrl: CONFIG.BROWSER_WSS_URL, sipUri: `sip:${CONFIG.SIP_EXTENSION}@${CONFIG.SIP_DOMAIN}` },
//     ok: notes.length === 0,
//     notes
//   });
// });

// export const getStasisChannels = (req, res) => {
//   res.json([...stasisChannels.entries()].map(([id, info]) => ({ id, ...info })));
// };

// export const sseEvents = (req, res) => {
//   res.writeHead(200, {
//     'Content-Type': 'text/event-stream',
//     'Cache-Control': 'no-cache, no-transform',
//     'Connection': 'keep-alive',
//     'X-Accel-Buffering': 'no'
//   });
//   res.write(`data: ${JSON.stringify({
//     event: 'Connected',
//     ariWsReady,
//     activeChannels: [...stasisChannels.keys()],
//     pstnCalls: [...pstnCalls.values()].map(callSnapshot)
//   })}\n\n`);
//   sseClients.add(res);
//   log.info(`[SSE] Client connected (total: ${sseClients.size})`);
//   req.on('close', () => {
//     sseClients.delete(res);
//     log.info(`[SSE] Client disconnected (total: ${sseClients.size})`);
//   });
// };

// // ── Call origination ──────────────────────────────────────────────────────────

// export const postCallAgent = [
//   requireAri,
//   wrap(async (req, res) => {
//     const endpoint = requireEndpoint(req.body?.endpoint);
//     const callerId = cleanCallerId(req.body?.callerId);
//     const result = await ari('POST', '/ari/channels',
//       { endpoint: `PJSIP/${endpoint}`, app: CONFIG.ARI_APP, appArgs: 'agent', callerId },
//       { variables: compactVars({
//           company_id: cleanTag(req.body?.companyId, 'companyId'),
//           agent_id:   cleanTag(req.body?.agentId,   'agentId'),
//           lead_id:    cleanTag(req.body?.leadId,     'leadId'),
//           caller_id:  callerId
//         })
//       }
//     );
//     sendAri(res, result);
//   })
// ];

// export const postCallAi = [
//   requireAri,
//   wrap(async (req, res) => {
//     const { to, flowId = 'flow_001', flowVersion = 'v2' } = req.body || {};
//     if (!to) throw badRequest('to (destination number) is required');
//     const e164 = toE164(to);
//     const dialString = pstnDialString(e164);
//     const callerId = cleanCallerId(req.body?.callerId) || CONFIG.PSTN_CALLER_ID;
//     const result = await ari('POST', '/ari/channels',
//       { endpoint: dialString, app: CONFIG.ARI_APP, appArgs: `${cleanTag(flowId, 'flowId')},${cleanTag(flowVersion, 'flowVersion')}`, callerId, timeout: CONFIG.PSTN_RING_TIMEOUT },
//       { variables: compactVars({ company_id: cleanTag(req.body?.companyId, 'companyId'), campaign_id: cleanTag(req.body?.campaignId, 'campaignId'), destination: e164 }) }
//     );
//     sendAri(res, result);
//   })
// ];

// export const postCallPstn = [
//   requireAri,
//   wrap(async (req, res) => {
//     if (!req.body?.to) throw badRequest('to (destination number) is required');
//     const e164 = toE164(req.body.to);
//     const vars = compactVars({
//       company_id:  cleanTag(req.body?.companyId,  'companyId'),
//       lead_id:     cleanTag(req.body?.leadId,      'leadId'),
//       campaign_id: cleanTag(req.body?.campaignId,  'campaignId'),
//       destination: e164
//     });
//     // caller_id (from DID dropdown) takes precedence, then pstnCallerId, then global default
//     const pstnCallerId =
//       cleanCallerId(req.body?.caller_id) ||
//       cleanCallerId(req.body?.pstnCallerId) ||
//       CONFIG.PSTN_CALLER_ID;
//     const agentExtension = requireEndpoint(req.body?.agentExtension || CONFIG.AGENT_EXTENSION, 'agentExtension');
//     const flow = await resolveFlow(
//       agentExtension,
//       typeof req.body.agentLeg === 'boolean' ? req.body.agentLeg : undefined
//     );

//     if (!flow.agentLeg) {
//       const dialString = pstnDialString(e164);
//       log.info(`[CALL/PSTN] ${e164} -> ${dialString} callerId=${pstnCallerId} (${flow.reason})`);
//       if (flow.silent) log.warn(`[CALL/PSTN] no agent leg — this call will connect with NO AUDIO`);
//       const result = await ari('POST', '/ari/channels',
//         { endpoint: dialString, app: CONFIG.ARI_APP, appArgs: 'pstn', callerId: pstnCallerId, timeout: CONFIG.PSTN_RING_TIMEOUT },
//         { variables: vars }
//       );
//       return res.status(result.status).json({
//         ...(result.body || {}),
//         destination: e164,
//         dialString,
//         route: describeRoute(e164, null),
//         flow: 'direct',
//         flowReason: flow.reason,
//         ...(flow.silent ? { warning: `No agent leg: call has no media path. Nothing is registered on PJSIP/${agentExtension}.` } : {})
//       });
//     }

//     const call = await startPstnCall({
//       e164, agentExtension,
//       callerId: cleanCallerId(req.body?.callerId),
//       pstnCallerId, vars
//     });
//     return res.status(202).json({
//       id: call.agentChannelId,
//       ...callSnapshot(call),
//       flow: 'agent-bridge',
//       message: `Ringing extension ${agentExtension}; ${e164} is dialled over ${CONFIG.PTCL_TRUNK} once it answers`
//     });
//   })
// ];

// export const getPstnCalls = (req, res) => {
//   res.json([...pstnCalls.values()].map(callSnapshot));
// };

// export const getPstnCall = wrap(async (req, res) => {
//   const callId = requireChannelId(req.params.callId);
//   const call = pstnCalls.get(callId);
//   if (!call) throw new HttpError(404, 'No such PSTN call');
//   res.json(callSnapshot(call));
// });

// export const deletePstnCall = wrap(async (req, res) => {
//   const callId = requireChannelId(req.params.callId);
//   if (!pstnCalls.has(callId)) throw new HttpError(404, 'No such PSTN call');
//   await teardownCall(callId, 'client-hangup');
//   res.status(204).end();
// });

// export const getCallsList = wrap(async (req, res) => sendAri(res, await ari('GET', '/ari/channels')));

// export const answerCall = wrap(async (req, res) => {
//   const id = requireChannelId(req.params.channelId);
//   sendAri(res, await ari('POST', `/ari/channels/${encodeURIComponent(id)}/answer`));
// });

// export const hangupCall = wrap(async (req, res) => {
//   const id = requireChannelId(req.params.channelId);
//   const callId = channelToCall.get(id);
//   if (callId) { await teardownCall(callId, 'client-hangup'); return res.status(204).end(); }
//   return sendAri(res, await ari('DELETE', `/ari/channels/${encodeURIComponent(id)}`));
// });

// export const holdCall = wrap(async (req, res) => {
//   const id = requireChannelId(req.params.channelId);
//   sendAri(res, await ari('POST', `/ari/channels/${encodeURIComponent(id)}/hold`));
// });

// export const unholdCall = wrap(async (req, res) => {
//   const id = requireChannelId(req.params.channelId);
//   sendAri(res, await ari('DELETE', `/ari/channels/${encodeURIComponent(id)}/hold`));
// });

// export const muteCall = wrap(async (req, res) => {
//   const id = requireChannelId(req.params.channelId);
//   sendAri(res, await ari('POST', `/ari/channels/${encodeURIComponent(id)}/mute`, { direction: muteDirection(req) }));
// });

// export const unmuteCall = wrap(async (req, res) => {
//   const id = requireChannelId(req.params.channelId);
//   sendAri(res, await ari('DELETE', `/ari/channels/${encodeURIComponent(id)}/mute`, { direction: muteDirection(req) }));
// });

// export const transferCall = [
//   requireAri,
//   wrap(async (req, res) => {
//     const channelId = requireChannelId(req.params.channelId);
//     const agentEndpoint = requireEndpoint(req.body?.agentEndpoint, 'agentEndpoint');
//     const bridgeName = cleanTag(req.body?.bridgeName || `transfer_${Date.now()}`, 'bridgeName');
//     if (!stasisChannels.has(channelId)) throw badRequest(`Channel ${channelId} is not in the Stasis app`);

//     const bridgeId = await createMixingBridge(bridgeName);
//     try { await joinBridge(bridgeId, channelId); }
//     catch (err) {
//       managedBridges.delete(bridgeId);
//       await ariRequest('DELETE', `/ari/bridges/${encodeURIComponent(bridgeId)}`).catch(() => {});
//       throw err;
//     }

//     let agentChannelId;
//     try {
//       const agentRes = await ari('POST', '/ari/channels', {
//         endpoint: `PJSIP/${agentEndpoint}`,
//         app: CONFIG.ARI_APP,
//         appArgs: `transfer,${bridgeId}`,
//         timeout: CONFIG.AGENT_RING_TIMEOUT
//       });
//       agentChannelId = agentRes.body?.id;
//     } catch (err) {
//       managedBridges.delete(bridgeId);
//       await ariRequest('DELETE', `/ari/bridges/${encodeURIComponent(bridgeId)}`).catch(() => {});
//       throw err;
//     }

//     if (agentChannelId) pendingBridgeJoins.set(agentChannelId, bridgeId);
//     res.status(202).json({ message: 'Transfer initiated', bridgeId, originalChannelId: channelId, agentChannelId });
//   })
// ];

// export const postCallCallback = wrap(async (req, res) => {
//   if (!req.body?.to) throw badRequest('to is required');
//   const e164 = toE164(req.body.to);
//   const channel = pstnDialString(e164);
//   const variables = Object.entries(compactVars({
//     company_id:  cleanTag(req.body?.companyId,  'companyId'),
//     lead_id:     cleanTag(req.body?.leadId,      'leadId'),
//     campaign_id: cleanTag(req.body?.campaignId,  'campaignId'),
//     destination: e164
//   })).map(([k, v]) => `${k}=${v}`);
//   log.info(`[CALLBACK] ${req.body.to} -> ${channel}`);
//   const result = await ami.send('Originate', {
//     Channel:   channel,
//     Context:   CONFIG.CALLBACK_CONTEXT,
//     Exten:     cleanTag(req.body?.exten || 's', 'exten'),
//     Priority:  '1',
//     CallerID:  cleanCallerId(req.body?.callerId) || CONFIG.PSTN_CALLER_ID,
//     Async:     'true',
//     ActionID:  cleanTag(req.body?.callbackId || `callback_${Date.now()}`, 'callbackId'),
//     Variable:  variables
//   });
//   res.json(result);
// });

// export const addToQueue = wrap(async (req, res) => {
//   const queue = requireQueue(req.body?.queue);
//   const iface = requireInterface(req.body?.interface);
//   const penalty = Number.parseInt(req.body?.penalty ?? 0, 10);
//   if (!Number.isFinite(penalty) || penalty < 0) throw badRequest('penalty must be >= 0');
//   const result = await ami.send('QueueAdd', {
//     Queue:      queue,
//     Interface:  iface,
//     Penalty:    penalty,
//     Paused:     'false',
//     MemberName: cleanTag(req.body?.memberName || iface, 'memberName')
//   });
//   res.json(result);
// });

// export const pauseQueue = wrap(async (req, res) => {
//   const queue = requireQueue(req.body?.queue);
//   const iface = requireInterface(req.body?.interface);
//   if (req.body?.paused === undefined) throw badRequest('paused is required');
//   const result = await ami.send('QueuePause', {
//     Queue:     queue,
//     Interface: iface,
//     Paused:    req.body.paused ? 'true' : 'false',
//     Reason:    cleanTag(req.body?.reason, 'reason')
//   });
//   res.json(result);
// });

// export const queueStatus = wrap(async (req, res) => {
//   const params = {};
//   if (req.query?.queue) params.Queue = requireQueue(req.query.queue);
//   const result = await ami.send('QueueStatus', params);
//   res.json(result);
// });

// export const getRecording = wrap(async (req, res) => {
//   const name = requireRecordingName(req.params.name);
//   sendAri(res, await ari('GET', `/ari/recordings/stored/${encodeURIComponent(name)}`));
// });

// export const deleteRecording = wrap(async (req, res) => {
//   const name = requireRecordingName(req.params.name);
//   sendAri(res, await ari('DELETE', `/ari/recordings/stored/${encodeURIComponent(name)}`));
// });

// // ── Error handler ──────────────────────────────────────────────────────────────

// export function dialerErrorHandler(err, req, res, _next) {
//   const status = err instanceof HttpError ? err.status : err?.type === 'entity.parse.failed' ? 400 : 500;
//   if (status >= 500) log.error(`[HTTP] ${req.method} ${req.originalUrl}:`, err.message);
//   else log.warn(`[HTTP] ${req.method} ${req.originalUrl}: ${err.message}`);
//   res.status(status).json({ error: err.message || 'Internal server error', ...(err.detail ? { detail: err.detail } : {}) });
// }

// // ── Startup: connect ARI WebSocket + AMI at module load ────────────────────

// log.info('[DIALER] Starting ARI WebSocket and AMI connections…');
// connectAriWebSocket();
// ami.start();

// // ── Graceful shutdown helpers (called from process signals if needed) ────────

// export function dialerShutdown() {
//   shuttingDown = true;
//   ami.close();
//   if (ariWs) { try { ariWs.close(); } catch { /* ignore */ } }
//   ariAgent.destroy();
// }
// ─── Dialer Controller ────────────────────────────────────────────────────────
// Full ARI (Asterisk REST Interface) + AMI (Asterisk Manager Interface) bridge.
// Replaces the previous LiveKit-based implementation.
//
// PSTN flow:
//   POST /calls/pstn { to: "03092836265" }
//     -> ARI rings PJSIP/AGENT_EXTENSION (the browser softphone = leg A)
//     -> ARI originates Local/<number>@outgoing-ptcl/n  (middle channel = leg B)
//     -> dialplan does Dial(PJSIP/<number>@PTCL, 60)
//     -> both legs join an ARI mixing bridge
//
// The browser (JsSIP) registers as AGENT_EXTENSION over wss:// and answers
// leg A — that is what carries the agent's audio.

import net from 'net';
import https from 'https';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import WebSocket, { WebSocket as WS } from 'ws';

// ── Config ──────────────────────────────────────────────────────────────────

const env = (key, fallback) => {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
};
const envBool = (key, fallback) => {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return /^(1|true|yes|on)$/i.test(v);
};
const envInt = (key, fallback) => {
  const n = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const CONFIG = {
  ASTERISK_HOST:    env('ASTERISK_HOST',    '172.16.17.127'),
  ARI_PORT:         envInt('ARI_PORT',       8089),
  ARI_USER:         env('ARI_USER',          'voxa_ari_user'),
  ARI_PASS:         env('ARI_PASS',          'ChooseSecurePassword123!'),
  ARI_APP:          env('ARI_APP',           'voxa-ai-stasis'),
  ARI_TIMEOUT_MS:   envInt('ARI_TIMEOUT_MS', 10000),

  AMI_PORT:         envInt('AMI_PORT',       5038),
  AMI_USER:         env('AMI_USER',          'voxa_ami_user'),
  AMI_PASS:         env('AMI_PASS',          'ChooseSecurePassword123!'),
  AMI_TIMEOUT_MS:   envInt('AMI_TIMEOUT_MS', 10000),

  PTCL_TRUNK:       env('PTCL_TRUNK',        'PTCL'),
  AGENT_EXTENSION:  env('AGENT_EXTENSION',   '1002'),
  PSTN_CALLER_ID:   env('PSTN_CALLER_ID',    '1002'),
  OUTBOUND_CONTEXT: env('OUTBOUND_CONTEXT',  'outgoing-ptcl'),
  CALLBACK_CONTEXT: env('CALLBACK_CONTEXT',  'voxa-stasis'),
  PSTN_ROUTE:       env('PSTN_ROUTE',        'local'),
  LOCAL_DIAL_FORMAT:env('LOCAL_DIAL_FORMAT', 'national'),
  LOCAL_NO_OPTIMIZE:envBool('LOCAL_NO_OPTIMIZE', true),
  PSTN_FLOW:        env('PSTN_FLOW',         'auto'),
  AGENT_RING_TIMEOUT: envInt('AGENT_RING_TIMEOUT', 30),
  PSTN_RING_TIMEOUT:  envInt('PSTN_RING_TIMEOUT',  60),
  COUNTRY_CODE:     env('COUNTRY_CODE',      '92'),

  TLS_VERIFY:       envBool('ASTERISK_TLS_VERIFY', false),
  TLS_CA_FILE:      env('ASTERISK_TLS_CA_FILE', ''),

  WEBRTC_AGENT:     envBool('WEBRTC_AGENT', true),
  SIP_WS_HOST:      env('SIP_WS_HOST',      ''),
  SIP_EXTENSION:    env('SIP_EXTENSION',     '1002'),
  SIP_PASSWORD:     env('SIP_PASSWORD',      'WebRtc1002@Secure2026'),
  SIP_DISPLAY_NAME: env('SIP_DISPLAY_NAME', 'Agent 1002'),

  CORS_ORIGIN:      env('CORS_ORIGIN',       ''),
};

CONFIG.ARI_BASE    = `https://${CONFIG.ASTERISK_HOST}:${CONFIG.ARI_PORT}`;
CONFIG.ARI_WS_URL  = env('ARI_WS_URL',  `wss://${CONFIG.ASTERISK_HOST}:${CONFIG.ARI_PORT}/ari/events`);
CONFIG.WSS_URL     = env('WSS_URL',     `wss://${CONFIG.ASTERISK_HOST}:${CONFIG.ARI_PORT}/ws`);
CONFIG.BROWSER_WSS_URL = env(
  'BROWSER_WSS_URL',
  `wss://${CONFIG.SIP_WS_HOST || CONFIG.ASTERISK_HOST}:${CONFIG.ARI_PORT}/ws`
);
CONFIG.SIP_DOMAIN  = env('SIP_DOMAIN', CONFIG.SIP_WS_HOST || CONFIG.ASTERISK_HOST);

const log = {
  info:  (...a) => console.log( new Date().toISOString(), '[DIALER]', ...a),
  warn:  (...a) => console.warn( new Date().toISOString(), '[DIALER]', ...a),
  error: (...a) => console.error(new Date().toISOString(), '[DIALER]', ...a),
};

// ── TLS ─────────────────────────────────────────────────────────────────────

const tlsOptions = { rejectUnauthorized: CONFIG.TLS_VERIFY };
if (CONFIG.TLS_CA_FILE) {
  try {
    const { readFileSync } = await import('fs');
    tlsOptions.ca = readFileSync(CONFIG.TLS_CA_FILE);
    tlsOptions.rejectUnauthorized = true;
  } catch (err) {
    log.warn('[TLS] Could not read CA file:', err.message);
  }
}
const ariAgent = new https.Agent({ ...tlsOptions, keepAlive: true, maxSockets: 20 });

// ── Errors ───────────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}
const badRequest = (msg, detail) => new HttpError(400, msg, detail);

// ── Validation ───────────────────────────────────────────────────────────────

const RE_CHANNEL_ID  = /^[A-Za-z0-9._:@-]{1,128}$/;
const RE_ENDPOINT    = /^[A-Za-z0-9._+-]{1,64}$/;
const RE_RECORDING   = /^[A-Za-z0-9._/-]{1,128}$/;
const MUTE_DIRECTIONS = new Set(['in', 'out', 'both']);

function requireChannelId(value) {
  const v = String(value ?? '');
  if (!RE_CHANNEL_ID.test(v)) throw badRequest('Invalid channelId');
  return v;
}
function requireEndpoint(value, field = 'endpoint') {
  const v = String(value ?? '').trim();
  if (!RE_ENDPOINT.test(v)) throw badRequest(`Invalid ${field}: use letters, digits, . _ + -`);
  return v;
}
function requireRecordingName(value) {
  const v = String(value ?? '');
  if (!RE_RECORDING.test(v) || v.includes('..')) throw badRequest('Invalid recording name');
  return v;
}
function cleanCallerId(value) {
  const v = String(value ?? '').replace(/[\r\n]/g, ' ').trim();
  if (v.length > 128) throw badRequest('callerId too long');
  return v;
}
function cleanTag(value, field) {
  const v = String(value ?? '').replace(/[\r\n,]/g, '').trim();
  if (v.length > 128) throw badRequest(`${field} too long`);
  return v;
}

// ── Number normalisation ─────────────────────────────────────────────────────

export function toE164(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw badRequest('Destination number is empty');

  let digits = raw.replace(/\D/g, '');
  let plus = raw.startsWith('+');

  if (!plus && digits.startsWith('00')) { digits = digits.slice(2); plus = true; }
  if (!plus) {
    const cc = CONFIG.COUNTRY_CODE;
    if (/^0\d{9,10}$/.test(digits)) digits = cc + digits.slice(1);
    else if (/^3\d{9}$/.test(digits)) digits = cc + digits;
    else if (!digits.startsWith(cc) && digits.length <= 6) {
      throw badRequest(
        `"${raw}" looks like an internal extension. Use /calls/agent for extensions.`
      );
    }
  }
  const e164 = '+' + digits;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    throw badRequest(`"${raw}" is not a valid E.164 number (normalised to "${e164}")`);
  }
  return e164;
}

export function localDialTarget(e164) {
  const digits = e164.replace(/^\+/, '');
  const cc = CONFIG.COUNTRY_CODE;
  switch (String(CONFIG.LOCAL_DIAL_FORMAT).toLowerCase()) {
    case 'digits': return digits;
    case 'national': return digits.startsWith(cc) ? '0' + digits.slice(cc.length) : digits;
    default: return e164;
  }
}

export function pstnDialString(e164) {
  if (String(CONFIG.PSTN_ROUTE).toLowerCase() === 'trunk') {
    return `PJSIP/${e164}@${CONFIG.PTCL_TRUNK}`;
  }
  const suffix = CONFIG.LOCAL_NO_OPTIMIZE ? '/n' : '';
  return `Local/${localDialTarget(e164)}@${CONFIG.OUTBOUND_CONTEXT}${suffix}`;
}

function describeRoute(e164, agentExtension) {
  const out = pstnDialString(e164);
  return agentExtension
    ? `PJSIP/${agentExtension} <-> ${out} -> ${CONFIG.PTCL_TRUNK} (${e164})`
    : `${out} -> ${CONFIG.PTCL_TRUNK} (${e164})`;
}

function compactVars(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && String(v) !== '') out[k] = String(v);
  }
  return out;
}

// ── ARI HTTP ─────────────────────────────────────────────────────────────────

const ariAuthHeader = 'Basic ' + Buffer.from(`${CONFIG.ARI_USER}:${CONFIG.ARI_PASS}`).toString('base64');

function ariRequest(method, pathname, query = {}, body = null) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && String(v) !== '') qs.append(k, String(v));
    }
    const search = qs.toString();
    const fullPath = pathname + (search ? `?${search}` : '');
    const bodyStr = body ? JSON.stringify(body) : null;

    const req = https.request(
      {
        hostname: CONFIG.ASTERISK_HOST,
        port: CONFIG.ARI_PORT,
        path: fullPath,
        method,
        agent: ariAgent,
        headers: {
          Authorization: ariAuthHeader,
          Accept: 'application/json',
          ...(bodyStr
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
            : {})
        }
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed = null;
          if (data) { try { parsed = JSON.parse(data); } catch { parsed = data; } }
          log.info(`[ARI] ${method} ${fullPath} -> ${res.statusCode}`);
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.setTimeout(CONFIG.ARI_TIMEOUT_MS, () => {
      req.destroy(new Error(`ARI request timed out after ${CONFIG.ARI_TIMEOUT_MS}ms`));
    });
    req.on('error', (err) => reject(new HttpError(502, `ARI unreachable: ${err.message}`)));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function ari(method, pathname, query, body) {
  const res = await ariRequest(method, pathname, query, body);
  if (res.status >= 400) {
    const msg = (res.body && (res.body.message || res.body.error)) || `Asterisk returned ${res.status}`;
    throw new HttpError(res.status, msg, res.body);
  }
  return res;
}

function sendAri(res, result) {
  if (result.status === 204 || result.body === null) return res.status(result.status).end();
  return res.status(result.status).json(result.body);
}

const hangupChannel = (channelId) =>
  ariRequest('DELETE', `/ari/channels/${encodeURIComponent(channelId)}`).catch(() => {});

// ── AMI client ───────────────────────────────────────────────────────────────

function amiValue(value) {
  const s = String(value ?? '');
  if (/[\r\n]/.test(s)) throw badRequest('Illegal newline in AMI parameter');
  return s;
}

class AmiClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.buffer = '';
    this.greeted = false;
    this.loggedIn = false;
    this.pending = new Map();
    this.seq = 0;
    this.backoff = 1000;
    this.closing = false;
    this.reconnectTimer = null;
  }

  get ready() { return this.loggedIn; }

  start() { this.closing = false; this._connect(); }

  _connect() {
    this.buffer = '';
    this.greeted = false;
    this.loggedIn = false;

    const socket = net.createConnection({ host: CONFIG.ASTERISK_HOST, port: CONFIG.AMI_PORT });
    this.socket = socket;
    socket.setEncoding('utf8');
    socket.setKeepAlive(true, 30000);

    socket.on('connect', () => {
      log.info(`[AMI] Connected to ${CONFIG.ASTERISK_HOST}:${CONFIG.AMI_PORT}`);
      this.backoff = 1000;
    });
    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('error', (err) => log.warn('[AMI] Socket error:', err.message));
    socket.on('close', () => {
      this.loggedIn = false;
      this._failPending('AMI connection closed');
      this.emit('state', false);
      if (!this.closing) this._scheduleReconnect();
    });
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 30000);
    log.warn(`[AMI] Disconnected — reconnecting in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this._connect(); }, delay);
  }

  _onData(chunk) {
    this.buffer += chunk;
    if (!this.greeted) {
      const nl = this.buffer.indexOf('\r\n');
      if (nl === -1) return;
      const greeting = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 2);
      this.greeted = true;
      log.info('[AMI]', greeting.trim());
      this._login();
    }
    let idx;
    while ((idx = this.buffer.indexOf('\r\n\r\n')) !== -1) {
      const raw = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 4);
      if (raw.trim()) this._handlePacket(AmiClient.parse(raw));
    }
  }

  static parse(raw) {
    const pkt = Object.create(null);
    for (const line of raw.split('\r\n')) {
      const i = line.indexOf(':');
      if (i === -1) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (Object.prototype.hasOwnProperty.call(pkt, k)) {
        pkt[k] = Array.isArray(pkt[k]) ? [...pkt[k], v] : [pkt[k], v];
      } else { pkt[k] = v; }
    }
    return pkt;
  }

  _handlePacket(pkt) {
    const entry = pkt.ActionID ? this.pending.get(pkt.ActionID) : null;
    if (entry) {
      if (pkt.Response !== undefined) {
        entry.response = pkt;
        const list = String(pkt.EventList || '').toLowerCase();
        if (pkt.Response === 'Error' || list !== 'start') this._settle(pkt.ActionID);
        return;
      }
      if (pkt.Event !== undefined) {
        entry.events.push(pkt);
        if (String(pkt.EventList || '').toLowerCase() === 'complete') this._settle(pkt.ActionID);
      }
      return;
    }
    if (pkt.Event !== undefined) this.emit('event', pkt);
  }

  _settle(actionId) {
    const entry = this.pending.get(actionId);
    if (!entry) return;
    this.pending.delete(actionId);
    clearTimeout(entry.timer);
    const res = entry.response || {};
    if (res.Response === 'Error') {
      entry.reject(new HttpError(502, res.Message || 'AMI action failed', res));
      return;
    }
    entry.resolve({ ...res, events: entry.events });
  }

  _failPending(reason) {
    for (const [id, entry] of [...this.pending]) {
      clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.reject(new HttpError(503, reason));
    }
  }

  _login() {
    this._write('Login', { Username: CONFIG.AMI_USER, Secret: CONFIG.AMI_PASS })
      .then(() => { this.loggedIn = true; log.info('[AMI] Authenticated'); this.emit('state', true); })
      .catch((err) => { log.error('[AMI] Login failed:', err.message); this.socket?.destroy(); });
  }

  send(action, params = {}) {
    if (!this.loggedIn) return Promise.reject(new HttpError(503, 'AMI not connected'));
    return this._write(action, params);
  }

  _write(action, params) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) { reject(new HttpError(503, 'AMI socket not open')); return; }
      let actionId, frame;
      try {
        actionId = params.ActionID ? amiValue(params.ActionID) : `voxa-${Date.now()}-${++this.seq}`;
        frame = `Action: ${amiValue(action)}\r\nActionID: ${actionId}\r\n`;
        for (const [key, value] of Object.entries(params)) {
          if (key === 'ActionID' || value === undefined || value === null) continue;
          for (const one of Array.isArray(value) ? value : [value]) {
            if (String(one) === '') continue;
            frame += `${amiValue(key)}: ${amiValue(one)}\r\n`;
          }
        }
        frame += '\r\n';
      } catch (err) { reject(err); return; }
      const timer = setTimeout(() => {
        this.pending.delete(actionId);
        reject(new HttpError(504, `AMI action ${action} timed out`));
      }, CONFIG.AMI_TIMEOUT_MS);
      this.pending.set(actionId, { resolve, reject, timer, events: [], response: null });
      this.socket.write(frame);
    });
  }

  close() {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this._failPending('Server shutting down');
    if (this.socket && !this.socket.destroyed) {
      try { this.socket.write('Action: Logoff\r\n\r\n'); } catch { /* ignore */ }
      this.socket.destroy();
    }
  }
}

export const ami = new AmiClient();

// ── SSE fan-out ───────────────────────────────────────────────────────────────

export const sseClients = new Set();

export function broadcastEvent(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of [...sseClients]) {
    try { client.write(data); } catch { sseClients.delete(client); }
  }
}

setInterval(() => {
  for (const client of [...sseClients]) {
    try { client.write(': heartbeat\n\n'); } catch { sseClients.delete(client); }
  }
}, 25000);

// ── Call state ────────────────────────────────────────────────────────────────

const stasisChannels   = new Map();
const pendingBridgeJoins = new Map();
const managedBridges   = new Set();
const pstnCalls        = new Map();
const channelToCall    = new Map();

let ariWs        = null;
let ariWsReady   = false;
let ariWsBackoff = 1000;
let ariWsAlive   = false;
let shuttingDown = false;

function callSnapshot(call) {
  return {
    callId:         call.callId,
    bridgeId:       call.bridgeId,
    state:          call.state,
    destination:    call.destination,
    agentExtension: call.agentExtension,
    agentChannelId: call.agentChannelId,
    pstnChannelId:  call.pstnChannelId,
    route:          call.route,
    createdAt:      call.createdAt,
    answeredAt:     call.answeredAt || null
  };
}

// ── Bridges ──────────────────────────────────────────────────────────────────

async function createMixingBridge(name) {
  const res = await ari('POST', '/ari/bridges', { type: 'mixing', name });
  const bridgeId = res.body?.id;
  if (!bridgeId) throw new HttpError(502, 'Asterisk did not return a bridge id', res.body);
  managedBridges.add(bridgeId);
  return bridgeId;
}

async function joinBridge(bridgeId, channelId) {
  await ari('POST', `/ari/bridges/${encodeURIComponent(bridgeId)}/addChannel`, {
    channel: channelId,
    role: 'participant'
  });
  log.info(`[ARI] Channel ${channelId} joined bridge ${bridgeId}`);
}

async function destroyBridgeIfEmpty(bridgeId) {
  if (!bridgeId || !managedBridges.has(bridgeId)) return;
  try {
    const res = await ariRequest('GET', `/ari/bridges/${encodeURIComponent(bridgeId)}`);
    if (res.status === 404) { managedBridges.delete(bridgeId); return; }
    const channels = res.body?.channels || [];
    if (channels.length === 0) {
      managedBridges.delete(bridgeId);
      await ariRequest('DELETE', `/ari/bridges/${encodeURIComponent(bridgeId)}`);
      log.info(`[ARI] Destroyed empty bridge ${bridgeId}`);
    }
  } catch (err) { log.warn('[ARI] Bridge cleanup failed:', err.message); }
}

// ── Two-leg PSTN ──────────────────────────────────────────────────────────────

async function endpointStatus(resource) {
  const r = await ariRequest('GET', `/ari/endpoints/PJSIP/${encodeURIComponent(resource)}`);
  if (r.status === 404) return { exists: false, state: null };
  if (r.status >= 400) return { exists: null, state: null, status: r.status };
  return {
    exists: true,
    state:  r.body?.state ?? null,
    activeChannels: Array.isArray(r.body?.channel_ids) ? r.body.channel_ids.length : null
  };
}

const isOnline = (st) => st.exists === true && String(st.state).toLowerCase() !== 'offline';

async function resolveFlow(agentExtension, override) {
  if (override === true)  return { agentLeg: true,  reason: 'requested per call' };
  if (override === false) return { agentLeg: false, reason: 'declined per call' };

  const mode = String(CONFIG.PSTN_FLOW).toLowerCase();
  if (mode === 'agent')  return { agentLeg: true,  reason: 'PSTN_FLOW=agent' };
  if (mode === 'direct') return { agentLeg: false, reason: 'PSTN_FLOW=direct' };

  const st = await endpointStatus(agentExtension).catch(() => ({ exists: null, state: null }));
  if (isOnline(st)) return { agentLeg: true, reason: `${agentExtension} is registered` };
  return {
    agentLeg: false,
    reason: st.exists === false
      ? `PJSIP/${agentExtension} does not exist`
      : `PJSIP/${agentExtension} is not registered`,
    silent: true
  };
}

async function assertAgentEndpointDialable(agentExtension) {
  const st = await endpointStatus(agentExtension);
  if (st.exists === false) {
    throw new HttpError(503,
      `PJSIP endpoint "${agentExtension}" does not exist on Asterisk. ` +
      'Create it as a WebRTC endpoint first, or run with PSTN_FLOW=direct.'
    );
  }
  if (st.exists === null) return; // can't tell — let originate decide
  if (st.state && String(st.state).toLowerCase() === 'offline') {
    throw new HttpError(503,
      `PJSIP endpoint "${agentExtension}" exists but nothing is registered to it. ` +
      'Open the dialer page and wait for it to reach "Registered" status.'
    );
  }
}

async function startPstnCall(opts) {
  const { e164, agentExtension, callerId, pstnCallerId, vars } = opts;
  await assertAgentEndpointDialable(agentExtension);
  const bridgeId = await createMixingBridge(`voxa_pstn_${Date.now()}`);

  const call = {
    callId: bridgeId, bridgeId, state: 'ringing-agent',
    destination: e164, agentExtension,
    agentChannelId: null, pstnChannelId: null,
    pstnCallerId, route: describeRoute(e164, agentExtension),
    vars, createdAt: new Date().toISOString(), answeredAt: null, tearingDown: false
  };
  pstnCalls.set(call.callId, call);

  log.info(`[CALL/PSTN] leg A -> PJSIP/${agentExtension} (bridge ${bridgeId}) for ${e164}`);

  let agentRes;
  try {
    agentRes = await ari('POST', '/ari/channels',
      {
        endpoint: `PJSIP/${agentExtension}`,
        app: CONFIG.ARI_APP,
        appArgs: `pstn-agent,${call.callId}`,
        callerId: callerId || e164,
        timeout: CONFIG.AGENT_RING_TIMEOUT
      },
      { variables: compactVars({ ...vars, voxa_leg: 'agent', voxa_call_id: call.callId }) }
    );
  } catch (err) {
    pstnCalls.delete(call.callId);
    managedBridges.delete(bridgeId);
    await ariRequest('DELETE', `/ari/bridges/${encodeURIComponent(bridgeId)}`).catch(() => {});
    if (/allocation failed/i.test(err.message || '')) {
      throw new HttpError(503,
        `Asterisk could not allocate a channel to PJSIP/${agentExtension} (Allocation failed). ` +
        'The endpoint is missing from pjsip.conf or has no registered contact.'
      );
    }
    throw err;
  }

  call.agentChannelId = agentRes.body?.id || null;
  if (call.agentChannelId) channelToCall.set(call.agentChannelId, call.callId);
  broadcastEvent({ event: 'PstnCallStarted', ...callSnapshot(call) });
  return call;
}

async function originatePstnLeg(call) {
  const dialString = pstnDialString(call.destination);
  log.info(`[CALL/PSTN] leg B -> ${dialString} callerId=${call.pstnCallerId}`);

  const query = {
    endpoint: dialString,
    app: CONFIG.ARI_APP,
    appArgs: `pstn-out,${call.callId}`,
    callerId: call.pstnCallerId,
    timeout: CONFIG.PSTN_RING_TIMEOUT
  };
  if (call.agentChannelId) query.originator = call.agentChannelId;

  const res = await ari('POST', '/ari/channels', query, {
    variables: compactVars({
      ...call.vars,
      voxa_leg: 'pstn',
      voxa_call_id: call.callId,
      destination: call.destination
    })
  });

  call.pstnChannelId = res.body?.id || null;
  if (call.pstnChannelId) channelToCall.set(call.pstnChannelId, call.callId);
  call.state = 'dialing-pstn';
  broadcastEvent({ event: 'PstnDialing', ...callSnapshot(call), dialString });
}

async function onAgentLegAnswered(channelId, callId) {
  const call = pstnCalls.get(callId);
  if (!call) { log.warn(`[CALL/PSTN] Agent leg ${channelId} has no call ${callId}`); await hangupChannel(channelId); return; }
  call.agentChannelId = channelId;
  channelToCall.set(channelId, callId);
  call.state = 'agent-answered';
  broadcastEvent({ event: 'AgentAnswered', ...callSnapshot(call) });

  try {
    await joinBridge(call.bridgeId, channelId);
    await originatePstnLeg(call);
  } catch (err) {
    log.error('[CALL/PSTN] Outbound leg failed:', err.message);
    call.endReason = `outbound leg failed: ${err.message}`;
    broadcastEvent({ event: 'PstnCallFailed', ...callSnapshot(call), error: err.message, detail: err.detail });
    await teardownCall(callId, call.endReason);
  }
}

async function onPstnLegAnswered(channelId, callId) {
  const call = pstnCalls.get(callId);
  if (!call) { log.warn(`[CALL/PSTN] Outbound leg ${channelId} has no call ${callId}`); await hangupChannel(channelId); return; }
  call.pstnChannelId = channelId;
  channelToCall.set(channelId, callId);

  try {
    await joinBridge(call.bridgeId, channelId);
    call.state = 'bridged';
    call.answeredAt = new Date().toISOString();
    broadcastEvent({ event: 'PstnCallBridged', ...callSnapshot(call) });
  } catch (err) {
    log.error(`[CALL/PSTN] Could not bridge outbound leg ${channelId}:`, err.message);
    call.endReason = `bridge failed: ${err.message}`;
    broadcastEvent({ event: 'PstnCallFailed', ...callSnapshot(call), error: err.message });
    await teardownCall(callId, call.endReason);
  }
}

async function teardownCall(callId, reason) {
  const call = pstnCalls.get(callId);
  if (!call || call.tearingDown) return;
  call.tearingDown = true;
  call.endReason = reason || call.endReason || 'teardown';
  log.info(`[CALL/PSTN] Tearing down ${callId} (${call.endReason})`);
  const legs = [call.agentChannelId, call.pstnChannelId].filter(Boolean);
  await Promise.all(legs.map(hangupChannel));
  if (legs.length === 0) finalizeCall(callId, call.endReason);
}

function finalizeCall(callId, reason) {
  const call = pstnCalls.get(callId);
  if (!call) return;
  if (call.agentChannelId) channelToCall.delete(call.agentChannelId);
  if (call.pstnChannelId) channelToCall.delete(call.pstnChannelId);
  pstnCalls.delete(callId);
  const snapshot = callSnapshot(call);
  snapshot.state = 'ended';
  broadcastEvent({ event: 'PstnCallEnded', ...snapshot, lastState: call.state, reason: reason || call.endReason || '' });
  log.info(`[CALL/PSTN] Call ${callId} ended (${reason || call.endReason || 'normal'})`);
  destroyBridgeIfEmpty(call.bridgeId).catch(() => {});
}

function handleLegGone(channelId, cause) {
  const callId = channelToCall.get(channelId);
  if (!callId) return;
  channelToCall.delete(channelId);
  const call = pstnCalls.get(callId);
  if (!call) return;

  const leg = call.agentChannelId === channelId ? 'agent' : 'pstn';
  if (leg === 'agent') call.agentChannelId = null; else call.pstnChannelId = null;
  broadcastEvent({ event: 'PstnLegEnded', callId, leg, channelId, cause: cause || '' });

  const survivor = call.agentChannelId || call.pstnChannelId;
  if (survivor) {
    if (!call.endReason) call.endReason = `${leg} leg hung up${cause ? ` (${cause})` : ''}`;
    call.tearingDown = true;
    hangupChannel(survivor);
    return;
  }
  finalizeCall(callId, call.endReason || cause);
}

// ── ARI WebSocket ─────────────────────────────────────────────────────────────

async function handleStasisStart(evt) {
  const channelId = evt.channel?.id;
  if (!channelId) return;
  const args  = evt.args || [];
  const vars  = evt.channel?.channelvars || {};
  const state = evt.channel?.state;
  const role  = args[0] || '';

  log.info(`[ARI-WS] StasisStart channel=${channelId} state=${state} args=${args.join(',')}`);
  stasisChannels.set(channelId, { answered: state === 'Up', role, args, vars, startedAt: new Date().toISOString() });

  if (state !== 'Up') {
    try {
      const ans = await ariRequest('POST', `/ari/channels/${encodeURIComponent(channelId)}/answer`);
      const entry = stasisChannels.get(channelId);
      if (ans.status < 400) { if (entry) entry.answered = true; log.info(`[ARI-WS] Answered channel ${channelId}`); }
      else log.warn(`[ARI-WS] Answer returned ${ans.status}:`, ans.body);
    } catch (err) { log.error('[ARI-WS] Failed to answer channel:', err.message); }
  }

  broadcastEvent({ event: 'StasisStart', channelId, role, args, vars, state });

  if (role === 'pstn-agent') { await onAgentLegAnswered(channelId, args[1]); return; }
  if (role === 'pstn-out')   { await onPstnLegAnswered(channelId, args[1]);  return; }

  const bridgeId = pendingBridgeJoins.get(channelId) || (role === 'transfer' ? args[1] : null);
  if (bridgeId) {
    pendingBridgeJoins.delete(channelId);
    try {
      await joinBridge(bridgeId, channelId);
      broadcastEvent({ event: 'TransferBridged', channelId, bridgeId });
    } catch (err) {
      log.error(`[ARI-WS] Could not bridge ${channelId} into ${bridgeId}:`, err.message);
      broadcastEvent({ event: 'TransferFailed', channelId, bridgeId, error: err.message });
    }
  }
}

async function handleAriEvent(evt) {
  const channelId = evt.channel?.id;

  switch (evt.type) {
    case 'StasisStart':
      await handleStasisStart(evt);
      break;

    case 'StasisEnd':
      log.info(`[ARI-WS] StasisEnd channel=${channelId}`);
      stasisChannels.delete(channelId);
      pendingBridgeJoins.delete(channelId);
      broadcastEvent({ event: 'StasisEnd', channelId });
      break;

    case 'ChannelStateChange': {
      const chState = evt.channel?.state;
      const entry = stasisChannels.get(channelId);
      if (entry) entry.state = chState;
      broadcastEvent({ event: 'ChannelStateChange', channelId, state: chState, callId: channelToCall.get(channelId) || null });
      break;
    }

    case 'ChannelHangupRequest':
      broadcastEvent({ event: 'ChannelHangupRequest', channelId });
      break;

    case 'ChannelDestroyed':
      stasisChannels.delete(channelId);
      pendingBridgeJoins.delete(channelId);
      broadcastEvent({
        event: 'ChannelDestroyed', channelId,
        cause: evt.cause, causeText: evt.cause_txt,
        callId: channelToCall.get(channelId) || null
      });
      handleLegGone(channelId, evt.cause_txt || (evt.cause != null ? `cause ${evt.cause}` : ''));
      break;

    case 'ChannelDtmfReceived':
      broadcastEvent({ event: 'ChannelDtmfReceived', channelId, digit: evt.digit });
      break;

    case 'ChannelEnteredBridge':
      broadcastEvent({ event: 'ChannelEnteredBridge', channelId, bridgeId: evt.bridge?.id, callId: channelToCall.get(channelId) || null });
      break;

    case 'ChannelLeftBridge': {
      const bId = evt.bridge?.id;
      broadcastEvent({ event: 'ChannelLeftBridge', channelId, bridgeId: bId });
      if (bId && !pstnCalls.has(bId)) await destroyBridgeIfEmpty(bId);
      break;
    }

    case 'BridgeDestroyed':
      managedBridges.delete(evt.bridge?.id);
      break;

    default:
      break;
  }
}

function connectAriWebSocket() {
  if (shuttingDown) return;

  const qs = new URLSearchParams({
    app: CONFIG.ARI_APP,
    subscribeAll: 'false',
    api_key: `${CONFIG.ARI_USER}:${CONFIG.ARI_PASS}`
  });
  const url = `${CONFIG.ARI_WS_URL}?${qs.toString()}`;
  log.info(`[ARI-WS] Connecting to ${CONFIG.ARI_WS_URL} (app=${CONFIG.ARI_APP})`);

  ariWs = new WS(url, { ...tlsOptions, headers: { Authorization: ariAuthHeader }, handshakeTimeout: 10000 });

  ariWs.on('open', () => {
    log.info('[ARI-WS] Connected — Stasis app registered');
    ariWsReady = true;
    ariWsAlive = true;
    ariWsBackoff = 1000;
    stasisChannels.clear();
    pendingBridgeJoins.clear();
    pstnCalls.clear();
    channelToCall.clear();
    broadcastEvent({ event: 'AriConnected' });
  });

  ariWs.on('pong', () => { ariWsAlive = true; });

  ariWs.on('message', (raw) => {
    let evt;
    try { evt = JSON.parse(raw); } catch { return; }
    handleAriEvent(evt).catch((err) => log.error('[ARI-WS] Handler error:', err.message));
  });

  ariWs.on('unexpected-response', (_req, res) => {
    log.error(`[ARI-WS] Handshake rejected with HTTP ${res.statusCode} — check ARI user/password`);
  });

  ariWs.on('error', (err) => log.error('[ARI-WS] Error:', err.message));

  ariWs.on('close', (code) => {
    ariWsReady = false;
    ariWs = null;
    broadcastEvent({ event: 'AriDisconnected', code });
    if (shuttingDown) return;
    const delay = ariWsBackoff;
    ariWsBackoff = Math.min(ariWsBackoff * 2, 30000);
    log.warn(`[ARI-WS] Closed (${code}) — reconnecting in ${delay}ms`);
    setTimeout(connectAriWebSocket, delay);
  });
}

// ARI WebSocket heartbeat
setInterval(() => {
  if (!ariWs || ariWs.readyState !== WS.OPEN) return;
  if (!ariWsAlive) { log.warn('[ARI-WS] No pong — terminating socket'); ariWs.terminate(); return; }
  ariWsAlive = false;
  ariWs.ping();
}, 20000);

// ── Route helpers ─────────────────────────────────────────────────────────────

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function requireAri(_req, res, next) {
  if (!ariWsReady) {
    return res.status(503).json({
      error: `ARI event socket not connected — Stasis app "${CONFIG.ARI_APP}" is not registered yet`
    });
  }
  return next();
}

function muteDirection(req) {
  const raw = req.body?.direction ?? req.query?.direction ?? 'out';
  const dir = String(raw);
  if (!MUTE_DIRECTIONS.has(dir)) throw badRequest('direction must be in, out or both');
  return dir;
}

const RE_QUEUE = /^[A-Za-z0-9._-]{1,80}$/;
const RE_IFACE = /^[A-Za-z0-9._/@+-]{1,80}$/;
function requireQueue(v) {
  const s = String(v ?? '').trim();
  if (!RE_QUEUE.test(s)) throw badRequest('Invalid queue name');
  return s;
}
function requireInterface(v) {
  const s = String(v ?? '').trim();
  if (!RE_IFACE.test(s)) throw badRequest('Invalid interface');
  return s;
}

// ── Exported route handlers ───────────────────────────────────────────────────

export const healthCheck = (req, res) => {
  res.json({
    status: ariWsReady ? 'ok' : 'degraded',
    ariWsReady,
    amiReady: ami.ready,
    activeStasisChannels: stasisChannels.size,
    activePstnCalls: pstnCalls.size,
    sseClients: sseClients.size,
    timestamp: new Date().toISOString()
  });
};

export const getWssStatus = (req, res) => {
  res.json({
    ariWsReady,
    amiReady: ami.ready,
    webrtcAgent: CONFIG.WEBRTC_AGENT,
    browserWssUrl: CONFIG.BROWSER_WSS_URL,
    sipDomain: CONFIG.SIP_DOMAIN,
    ariApp: CONFIG.ARI_APP,
    asteriskHost: CONFIG.ASTERISK_HOST,
    ptclTrunk: CONFIG.PTCL_TRUNK,
    pstnCallerId: CONFIG.PSTN_CALLER_ID,
    agentExtension: CONFIG.AGENT_EXTENSION,
    pstnFlow: CONFIG.PSTN_FLOW,
    pstnRoute: CONFIG.PSTN_ROUTE,
    outboundContext: CONFIG.OUTBOUND_CONTEXT,
    localDialFormat: CONFIG.LOCAL_DIAL_FORMAT,
    sampleDialString: pstnDialString(`+${CONFIG.COUNTRY_CODE}3001234567`),
    stasisChannels: [...stasisChannels.keys()],
    pstnCalls: [...pstnCalls.values()].map(callSnapshot)
  });
};

export const getSipCredentials = (req, res) => {
  if (!CONFIG.WEBRTC_AGENT) {
    return res.json({ enabled: false, reason: 'WEBRTC_AGENT is disabled' });
  }
  res.json({
    enabled: true,
    wsUrl: CONFIG.BROWSER_WSS_URL,
    uri: `sip:${CONFIG.SIP_EXTENSION}@${CONFIG.SIP_DOMAIN}`,
    authUser: CONFIG.SIP_EXTENSION,
    password: CONFIG.SIP_PASSWORD,
    displayName: CONFIG.SIP_DISPLAY_NAME,
    realm: CONFIG.SIP_DOMAIN,
    agentExtension: CONFIG.AGENT_EXTENSION
  });
};

export const diagPstn = wrap(async (req, res) => {
  const sample = `+${CONFIG.COUNTRY_CODE}3001234567`;
  const [trunk, agent] = await Promise.all([
    endpointStatus(CONFIG.PTCL_TRUNK),
    endpointStatus(CONFIG.AGENT_EXTENSION)
  ]);
  const notes = [];
  if (trunk.exists === false) notes.push(`Trunk endpoint PJSIP/${CONFIG.PTCL_TRUNK} not found.`);
  if (agent.exists === false) notes.push(`PJSIP/${CONFIG.AGENT_EXTENSION} does not exist.`);
  else if (!isOnline(agent)) notes.push(`PJSIP/${CONFIG.AGENT_EXTENSION} exists but nothing is registered.`);
  const flow = await resolveFlow(CONFIG.AGENT_EXTENSION);
  res.json({
    configuredFlow: CONFIG.PSTN_FLOW,
    effectiveFlow: flow.agentLeg ? 'agent' : 'direct',
    effectiveFlowReason: flow.reason,
    audioPath: flow.agentLeg ? `PJSIP/${CONFIG.AGENT_EXTENSION} <-> bridge <-> ${CONFIG.PTCL_TRUNK}` : 'none — calls will be silent',
    route: CONFIG.PSTN_ROUTE,
    outboundContext: CONFIG.OUTBOUND_CONTEXT,
    sampleDialString: pstnDialString(sample),
    trunk: { name: CONFIG.PTCL_TRUNK, ...trunk },
    agentExtension: { name: CONFIG.AGENT_EXTENSION, ...agent },
    webrtc: { enabled: CONFIG.WEBRTC_AGENT, wsUrl: CONFIG.BROWSER_WSS_URL, sipUri: `sip:${CONFIG.SIP_EXTENSION}@${CONFIG.SIP_DOMAIN}` },
    ok: notes.length === 0,
    notes
  });
});

export const getStasisChannels = (req, res) => {
  res.json([...stasisChannels.entries()].map(([id, info]) => ({ id, ...info })));
};

export const sseEvents = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`data: ${JSON.stringify({
    event: 'Connected',
    ariWsReady,
    activeChannels: [...stasisChannels.keys()],
    pstnCalls: [...pstnCalls.values()].map(callSnapshot)
  })}\n\n`);
  sseClients.add(res);
  log.info(`[SSE] Client connected (total: ${sseClients.size})`);
  req.on('close', () => {
    sseClients.delete(res);
    log.info(`[SSE] Client disconnected (total: ${sseClients.size})`);
  });
};

// ── Call origination ──────────────────────────────────────────────────────────

export const postCallAgent = [
  requireAri,
  wrap(async (req, res) => {
    const endpoint = requireEndpoint(req.body?.endpoint);
    const callerId = cleanCallerId(req.body?.callerId);
    const result = await ari('POST', '/ari/channels',
      { endpoint: `PJSIP/${endpoint}`, app: CONFIG.ARI_APP, appArgs: 'agent', callerId },
      { variables: compactVars({
          company_id: cleanTag(req.body?.companyId, 'companyId'),
          agent_id:   cleanTag(req.body?.agentId,   'agentId'),
          lead_id:    cleanTag(req.body?.leadId,     'leadId'),
          caller_id:  callerId
        })
      }
    );
    sendAri(res, result);
  })
];

export const postCallAi = [
  requireAri,
  wrap(async (req, res) => {
    const { to, flowId = 'flow_001', flowVersion = 'v2' } = req.body || {};
    if (!to) throw badRequest('to (destination number) is required');
    const e164 = toE164(to);
    const dialString = pstnDialString(e164);
    const callerId = cleanCallerId(req.body?.callerId) || CONFIG.PSTN_CALLER_ID;
    const result = await ari('POST', '/ari/channels',
      { endpoint: dialString, app: CONFIG.ARI_APP, appArgs: `${cleanTag(flowId, 'flowId')},${cleanTag(flowVersion, 'flowVersion')}`, callerId, timeout: CONFIG.PSTN_RING_TIMEOUT },
      { variables: compactVars({ company_id: cleanTag(req.body?.companyId, 'companyId'), campaign_id: cleanTag(req.body?.campaignId, 'campaignId'), destination: e164 }) }
    );
    sendAri(res, result);
  })
];

export const postCallPstn = [
  requireAri,
  wrap(async (req, res) => {
    if (!req.body?.to) throw badRequest('to (destination number) is required');
    const e164 = toE164(req.body.to);
    const vars = compactVars({
      company_id:  cleanTag(req.body?.companyId,  'companyId'),
      lead_id:     cleanTag(req.body?.leadId,      'leadId'),
      campaign_id: cleanTag(req.body?.campaignId,  'campaignId'),
      destination: e164
    });
    const pstnCallerId = cleanCallerId(req.body?.pstnCallerId) || CONFIG.PSTN_CALLER_ID;
    const agentExtension = requireEndpoint(req.body?.agentExtension || CONFIG.AGENT_EXTENSION, 'agentExtension');
    const flow = await resolveFlow(
      agentExtension,
      typeof req.body.agentLeg === 'boolean' ? req.body.agentLeg : undefined
    );

    if (!flow.agentLeg) {
      const dialString = pstnDialString(e164);
      log.info(`[CALL/PSTN] ${e164} -> ${dialString} callerId=${pstnCallerId} (${flow.reason})`);
      if (flow.silent) log.warn(`[CALL/PSTN] no agent leg — this call will connect with NO AUDIO`);
      const result = await ari('POST', '/ari/channels',
        { endpoint: dialString, app: CONFIG.ARI_APP, appArgs: 'pstn', callerId: pstnCallerId, timeout: CONFIG.PSTN_RING_TIMEOUT },
        { variables: vars }
      );
      return res.status(result.status).json({
        ...(result.body || {}),
        destination: e164,
        dialString,
        route: describeRoute(e164, null),
        flow: 'direct',
        flowReason: flow.reason,
        ...(flow.silent ? { warning: `No agent leg: call has no media path. Nothing is registered on PJSIP/${agentExtension}.` } : {})
      });
    }

    const call = await startPstnCall({
      e164, agentExtension,
      callerId: cleanCallerId(req.body?.callerId),
      pstnCallerId, vars
    });
    return res.status(202).json({
      id: call.agentChannelId,
      ...callSnapshot(call),
      flow: 'agent-bridge',
      message: `Ringing extension ${agentExtension}; ${e164} is dialled over ${CONFIG.PTCL_TRUNK} once it answers`
    });
  })
];

export const getPstnCalls = (req, res) => {
  res.json([...pstnCalls.values()].map(callSnapshot));
};

export const getPstnCall = wrap(async (req, res) => {
  const callId = requireChannelId(req.params.callId);
  const call = pstnCalls.get(callId);
  if (!call) throw new HttpError(404, 'No such PSTN call');
  res.json(callSnapshot(call));
});

export const deletePstnCall = wrap(async (req, res) => {
  const callId = requireChannelId(req.params.callId);
  if (!pstnCalls.has(callId)) throw new HttpError(404, 'No such PSTN call');
  await teardownCall(callId, 'client-hangup');
  res.status(204).end();
});

export const getCallsList = wrap(async (req, res) => sendAri(res, await ari('GET', '/ari/channels')));

export const answerCall = wrap(async (req, res) => {
  const id = requireChannelId(req.params.channelId);
  sendAri(res, await ari('POST', `/ari/channels/${encodeURIComponent(id)}/answer`));
});

export const hangupCall = wrap(async (req, res) => {
  const id = requireChannelId(req.params.channelId);
  const callId = channelToCall.get(id);
  if (callId) { await teardownCall(callId, 'client-hangup'); return res.status(204).end(); }
  return sendAri(res, await ari('DELETE', `/ari/channels/${encodeURIComponent(id)}`));
});

export const holdCall = wrap(async (req, res) => {
  const id = requireChannelId(req.params.channelId);
  sendAri(res, await ari('POST', `/ari/channels/${encodeURIComponent(id)}/hold`));
});

export const unholdCall = wrap(async (req, res) => {
  const id = requireChannelId(req.params.channelId);
  sendAri(res, await ari('DELETE', `/ari/channels/${encodeURIComponent(id)}/hold`));
});

export const muteCall = wrap(async (req, res) => {
  const id = requireChannelId(req.params.channelId);
  sendAri(res, await ari('POST', `/ari/channels/${encodeURIComponent(id)}/mute`, { direction: muteDirection(req) }));
});

export const unmuteCall = wrap(async (req, res) => {
  const id = requireChannelId(req.params.channelId);
  sendAri(res, await ari('DELETE', `/ari/channels/${encodeURIComponent(id)}/mute`, { direction: muteDirection(req) }));
});

export const transferCall = [
  requireAri,
  wrap(async (req, res) => {
    const channelId = requireChannelId(req.params.channelId);
    const agentEndpoint = requireEndpoint(req.body?.agentEndpoint, 'agentEndpoint');
    const bridgeName = cleanTag(req.body?.bridgeName || `transfer_${Date.now()}`, 'bridgeName');
    if (!stasisChannels.has(channelId)) throw badRequest(`Channel ${channelId} is not in the Stasis app`);

    const bridgeId = await createMixingBridge(bridgeName);
    try { await joinBridge(bridgeId, channelId); }
    catch (err) {
      managedBridges.delete(bridgeId);
      await ariRequest('DELETE', `/ari/bridges/${encodeURIComponent(bridgeId)}`).catch(() => {});
      throw err;
    }

    let agentChannelId;
    try {
      const agentRes = await ari('POST', '/ari/channels', {
        endpoint: `PJSIP/${agentEndpoint}`,
        app: CONFIG.ARI_APP,
        appArgs: `transfer,${bridgeId}`,
        timeout: CONFIG.AGENT_RING_TIMEOUT
      });
      agentChannelId = agentRes.body?.id;
    } catch (err) {
      managedBridges.delete(bridgeId);
      await ariRequest('DELETE', `/ari/bridges/${encodeURIComponent(bridgeId)}`).catch(() => {});
      throw err;
    }

    if (agentChannelId) pendingBridgeJoins.set(agentChannelId, bridgeId);
    res.status(202).json({ message: 'Transfer initiated', bridgeId, originalChannelId: channelId, agentChannelId });
  })
];

export const postCallCallback = wrap(async (req, res) => {
  if (!req.body?.to) throw badRequest('to is required');
  const e164 = toE164(req.body.to);
  const channel = pstnDialString(e164);
  const variables = Object.entries(compactVars({
    company_id:  cleanTag(req.body?.companyId,  'companyId'),
    lead_id:     cleanTag(req.body?.leadId,      'leadId'),
    campaign_id: cleanTag(req.body?.campaignId,  'campaignId'),
    destination: e164
  })).map(([k, v]) => `${k}=${v}`);
  log.info(`[CALLBACK] ${req.body.to} -> ${channel}`);
  const result = await ami.send('Originate', {
    Channel:   channel,
    Context:   CONFIG.CALLBACK_CONTEXT,
    Exten:     cleanTag(req.body?.exten || 's', 'exten'),
    Priority:  '1',
    CallerID:  cleanCallerId(req.body?.callerId) || CONFIG.PSTN_CALLER_ID,
    Async:     'true',
    ActionID:  cleanTag(req.body?.callbackId || `callback_${Date.now()}`, 'callbackId'),
    Variable:  variables
  });
  res.json(result);
});

export const addToQueue = wrap(async (req, res) => {
  const queue = requireQueue(req.body?.queue);
  const iface = requireInterface(req.body?.interface);
  const penalty = Number.parseInt(req.body?.penalty ?? 0, 10);
  if (!Number.isFinite(penalty) || penalty < 0) throw badRequest('penalty must be >= 0');
  const result = await ami.send('QueueAdd', {
    Queue:      queue,
    Interface:  iface,
    Penalty:    penalty,
    Paused:     'false',
    MemberName: cleanTag(req.body?.memberName || iface, 'memberName')
  });
  res.json(result);
});

export const pauseQueue = wrap(async (req, res) => {
  const queue = requireQueue(req.body?.queue);
  const iface = requireInterface(req.body?.interface);
  if (req.body?.paused === undefined) throw badRequest('paused is required');
  const result = await ami.send('QueuePause', {
    Queue:     queue,
    Interface: iface,
    Paused:    req.body.paused ? 'true' : 'false',
    Reason:    cleanTag(req.body?.reason, 'reason')
  });
  res.json(result);
});

export const queueStatus = wrap(async (req, res) => {
  const params = {};
  if (req.query?.queue) params.Queue = requireQueue(req.query.queue);
  const result = await ami.send('QueueStatus', params);
  res.json(result);
});

export const getRecording = wrap(async (req, res) => {
  const name = requireRecordingName(req.params.name);
  sendAri(res, await ari('GET', `/ari/recordings/stored/${encodeURIComponent(name)}`));
});

export const deleteRecording = wrap(async (req, res) => {
  const name = requireRecordingName(req.params.name);
  sendAri(res, await ari('DELETE', `/ari/recordings/stored/${encodeURIComponent(name)}`));
});

// ── Error handler ──────────────────────────────────────────────────────────────

export function dialerErrorHandler(err, req, res, _next) {
  const status = err instanceof HttpError ? err.status : err?.type === 'entity.parse.failed' ? 400 : 500;
  if (status >= 500) log.error(`[HTTP] ${req.method} ${req.originalUrl}:`, err.message);
  else log.warn(`[HTTP] ${req.method} ${req.originalUrl}: ${err.message}`);
  res.status(status).json({ error: err.message || 'Internal server error', ...(err.detail ? { detail: err.detail } : {}) });
}

// ── Startup: connect ARI WebSocket + AMI at module load ────────────────────

log.info('[DIALER] Starting ARI WebSocket and AMI connections…');
connectAriWebSocket();
ami.start();

// ── Graceful shutdown helpers (called from process signals if needed) ────────

export function dialerShutdown() {
  shuttingDown = true;
  ami.close();
  if (ariWs) { try { ariWs.close(); } catch { /* ignore */ } }
  ariAgent.destroy();
}