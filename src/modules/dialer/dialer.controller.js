// ─── Dialer Controller ────────────────────────────────────────────────────────
// Handles outbound call initiation via Asterisk API and call termination
// via LiveKit Admin API (room deletion drops the SIP participant).

import { RoomServiceClient, AccessToken } from 'livekit-server-sdk';
const ASTERISK_API_URL = process.env.ASTERISK_API_URL;
const LIVEKIT_HTTP_URL = process.env.LIVEKIT_HTTP_URL || 'http://localhost:7880';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'voxa-key';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'voxa-secret';

// ── LiveKit room service client ───────────────────────────────────────────────
function getRoomClient() {
  return new RoomServiceClient(LIVEKIT_HTTP_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

// ── GET /dialer/token ──────────────────────────────────────────────────────────
// Generates a JWT token for the browser client to join a specific LiveKit room.
export async function getToken(req, res) {
  try {
    const { roomName, identity } = req.query;
    if (!roomName || !identity) {
      return res.status(400).json({ success: false, message: 'roomName and identity are required.' });
    }

    const t = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: identity.trim(),
      name: identity.trim(),
    });

    t.addGrant({
      roomJoin: true,
      room: roomName.trim(),
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await t.toJwt();
    return res.status(200).json({ success: true, token });
  } catch (err) {
    console.error('[Dialer] getToken error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to generate token.' });
  }
}

// ── POST /dialer/call ─────────────────────────────────────────────────────────
// Triggers an outbound PSTN call via Asterisk.
// Body: { number: string }   e.g. "03131210033"
// Returns: { success, roomName, message }
export async function callOut(req, res) {
  try {
    const { number } = req.body;
    if (!number || typeof number !== 'string' || !number.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    const cleanNumber = number.trim();

    if (!ASTERISK_API_URL) {
      return res.status(500).json({ success: false, message: 'ASTERISK_API_URL not configured.' });
    }

    // Replicate what outbound_test.py does:
    // POST with form-encoded body: mobile=<number>
    const formBody = new URLSearchParams({ mobile: cleanNumber }).toString();

    const asteriskRes = await fetch(ASTERISK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    const responseText = await asteriskRes.text();

    if (!asteriskRes.ok) {
      console.error(`[Dialer] Asterisk API error: ${asteriskRes.status} — ${responseText}`);
      return res.status(502).json({
        success: false,
        message: `Asterisk API returned ${asteriskRes.status}`,
        detail: responseText,
      });
    }

    // Map to phone-room to match the direct dispatch rule
    const roomName = 'phone-room';

    console.log(`[Dialer] Outbound call triggered to ${cleanNumber}. Room: ${roomName}`);
    console.log(`[Dialer] Asterisk response: ${responseText}`);

    return res.status(200).json({
      success: true,
      roomName,
      number: cleanNumber,
      message: `Call initiated to ${cleanNumber}`,
      asteriskResponse: responseText,
    });
  } catch (err) {
    console.error('[Dialer] callOut error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to initiate call.',
    });
  }
}

// ── POST /dialer/hangup ───────────────────────────────────────────────────────
// Ends an active call by deleting the LiveKit room.
// Deleting the room disconnects all participants including the SIP bridge,
// which drops the PSTN call.
// Body: { roomName: string }   e.g. "call-03131210033"
export async function hangup(req, res) {
  try {
    const { roomName } = req.body;
    if (!roomName || typeof roomName !== 'string' || !roomName.trim()) {
      return res.status(400).json({ success: false, message: 'roomName is required.' });
    }

    const client = getRoomClient();

    // First check if room actually exists
    let roomExists = false;
    try {
      const rooms = await client.listRooms([roomName.trim()]);
      roomExists = rooms.length > 0;
    } catch {
      // If listing fails, still attempt deletion
      roomExists = true;
    }

    if (!roomExists) {
      // Room already gone — call already ended
      return res.status(200).json({
        success: true,
        message: 'Room not found — call may have already ended.',
        alreadyEnded: true,
      });
    }

    await client.deleteRoom(roomName.trim());

    console.log(`[Dialer] Room deleted: ${roomName}`);
    return res.status(200).json({
      success: true,
      message: `Call ended. Room '${roomName}' deleted.`,
    });
  } catch (err) {
    console.error('[Dialer] hangup error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to hang up call.',
    });
  }
}

