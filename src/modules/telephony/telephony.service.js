import fs from 'fs';
import path from 'path';
import { Agent } from 'undici';

const pipelineAgent = new Agent({ connect: { rejectUnauthorized: false } });

function pipelineFetch(url, options = {}) {
  return fetch(url, { ...options, dispatcher: pipelineAgent });
}

const PIPELINE_URL = (process.env.VOXA_AI_PIPELINE_URL || 'https://crm-intelligence-voxa.vercel.app').replace(/\/$/, '');
const RECORDINGS_DIRS = Array.from(new Set([
  process.env.RECORDINGS_PATH,
  path.resolve(process.cwd(), 'recordings'),
  path.resolve(process.cwd(), 'voxa-backend', 'recordings'),
  path.resolve(process.cwd(), '..', 'recordings'),
  '/var/data',
  'var/data',
  'C:/var/data',
  path.resolve(process.cwd(), 'var', 'data'),
  '../../../../../data'
].filter(Boolean)));

/**
 * Searches root recordings directory, /var/data (and fallback dirs) for a recording.
 *
 * Primary filename format: {phone}_{uniqueid}.wav
 * Example:                 03022011625_1788800465.17.wav
 *
 * Fallback: any audio file whose name contains the uniqueid string.
 */
export function findRecordingFile(uniqueid, phone = null, rawFilename = null) {
  if (!uniqueid && !rawFilename) return null;

  const targetUniqueId = String(uniqueid || '').trim();
  const rawPhone = phone ? String(phone).trim() : '';
  // Keep only digits for the phone part (matches Asterisk CDR format)
  const cleanPhone = rawPhone ? rawPhone.replace(/\D/g, '') : '';

  // Build list of primary candidates: phone_uniqueid.wav (e.g. 03022011625_1788800465.17.wav)
  const primaryCandidates = [];
  if (cleanPhone && targetUniqueId) {
    primaryCandidates.push(`${cleanPhone}_${targetUniqueId}.wav`);
  }
  if (rawPhone && rawPhone !== cleanPhone && targetUniqueId) {
    primaryCandidates.push(`${rawPhone}_${targetUniqueId}.wav`);
  }
  if (targetUniqueId) {
    primaryCandidates.push(`${targetUniqueId}.wav`);
  }

  console.log('\n[RecordingFinder] ═══════════════════════════════════════════');
  console.log(`[RecordingFinder] Looking for recording`);
  console.log(`[RecordingFinder]   uniqueid         : "${targetUniqueId}"`);
  console.log(`[RecordingFinder]   phone (cleaned)  : "${cleanPhone}"`);
  console.log(`[RecordingFinder]   primary targets  : ${JSON.stringify(primaryCandidates)}`);
  console.log(`[RecordingFinder]   search dirs      : ${JSON.stringify(RECORDINGS_DIRS)}`);
  console.log('[RecordingFinder] ═══════════════════════════════════════════');

  // ── Step 0: rawFilename shortcut ──────────────────────────────────────────
  if (rawFilename) {
    console.log(`[RecordingFinder] Step 0: Checking rawFilename "${rawFilename}" directly`);
    if (fs.existsSync(rawFilename)) {
      console.log(`[RecordingFinder] ✅ FOUND at raw path: ${path.resolve(rawFilename)}`);
      return path.resolve(rawFilename);
    }
    // Try rawFilename basename inside search dirs
    const base = path.basename(rawFilename);
    for (const dir of RECORDINGS_DIRS) {
      const fp = path.join(dir, base);
      console.log(`[RecordingFinder]   Trying ${fp}`);
      if (fs.existsSync(fp)) {
        console.log(`[RecordingFinder] ✅ FOUND (rawFilename in dir): ${fp}`);
        return fp;
      }
    }
    console.log('[RecordingFinder]   rawFilename not found anywhere.');
  }

  // ── Step 1: Search each dir for phone_uniqueid.wav (primary) then fallback ─
  for (const dir of RECORDINGS_DIRS) {
    const dirExists = fs.existsSync(dir);
    console.log(`\n[RecordingFinder] Dir: "${dir}" → exists: ${dirExists}`);
    if (!dirExists) continue;

    let files;
    try {
      files = fs.readdirSync(dir);
    } catch (err) {
      console.warn(`[RecordingFinder]   ⚠️  Cannot read dir: ${err.message}`);
      continue;
    }

    const audioFiles = files.filter(f =>
      f.endsWith('.wav') || f.endsWith('.mp3') || f.endsWith('.gsm')
    );
    console.log(`[RecordingFinder]   Total files: ${files.length}  |  Audio files: ${audioFiles.length}`);
    if (audioFiles.length > 0) {
      console.log(`[RecordingFinder]   Audio files: ${audioFiles.slice(0, 30).join(', ')}${audioFiles.length > 30 ? ' …' : ''}`);
    }

    // 1a. Primary: phone_uniqueid.wav  (e.g. 03022011625_1788800465.17.wav)
    for (const candidate of primaryCandidates) {
      const found = files.includes(candidate);
      console.log(`[RecordingFinder]   [PRIMARY] "${candidate}" → ${found ? '✅ MATCH' : '❌ not found'}`);
      if (found) {
        const result = path.join(dir, candidate);
        console.log(`[RecordingFinder] ✅ FOUND: ${result}`);
        console.log('[RecordingFinder] ═══════════════════════════════════════════\n');
        return result;
      }
    }

    // 1b. Fallback: any audio file whose name contains the uniqueid
    if (targetUniqueId) {
      const partial = audioFiles.find(f => f.includes(targetUniqueId));
      if (partial) {
        const result = path.join(dir, partial);
        console.log(`[RecordingFinder]   [FALLBACK] Partial match on uniqueid → "${partial}"`);
        console.log(`[RecordingFinder] ✅ FOUND: ${result}`);
        console.log('[RecordingFinder] ═══════════════════════════════════════════\n');
        return result;
      }
      console.log(`[RecordingFinder]   [FALLBACK] No audio file contains "${targetUniqueId}"`);
    }
  }

  console.log('\n[RecordingFinder] ❌ NOT FOUND in any directory');
  console.log('[RecordingFinder] ═══════════════════════════════════════════\n');
  return null;
}

/**
 * Call the AI Pipeline API — full process (transcribe + summarize)
 */
export async function callPipelineProcess({ callId, script = 'mixed', filePath = null, audioUrl = null }) {
  if (filePath && fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append('audio', blob, fileName);
    formData.append('call_id', String(callId));
    formData.append('script', script);

    const res = await pipelineFetch(`${PIPELINE_URL}/calls/process`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipeline failed with status ${res.status}: ${text}`);
    }

    return await res.json();
  }

  if (audioUrl) {
    const res = await pipelineFetch(`${PIPELINE_URL}/calls/process-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_url: audioUrl,
        call_id: String(callId),
        script: script
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipeline URL process failed with status ${res.status}: ${text}`);
    }

    return await res.json();
  }

  throw new Error('Neither audio file nor audio URL could be found for processing.');
}

/**
 * Call pipeline for transcription only
 */
export async function callPipelineTranscribe({ callId, script = 'mixed', filePath = null, audioUrl = null }) {
  if (filePath && fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append('audio', blob, fileName);
    formData.append('call_id', String(callId));
    formData.append('script', script);

    const res = await pipelineFetch(`${PIPELINE_URL}/calls/transcribe`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipeline transcribe failed (${res.status}): ${text}`);
    }

    return await res.json();
  }

  if (audioUrl) {
    const res = await pipelineFetch(`${PIPELINE_URL}/calls/transcribe-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_url: audioUrl,
        call_id: String(callId),
        script
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipeline transcribe URL failed (${res.status}): ${text}`);
    }

    return await res.json();
  }

  throw new Error('Neither audio file nor audio URL provided');
}

/**
 * Call pipeline for summarize only
 */
export async function callPipelineSummarize({ callId, filePath = null, audioUrl = null }) {
  if (filePath && fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const mimeType = fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append('audio', blob, fileName);
    formData.append('call_id', String(callId));

    const res = await pipelineFetch(`${PIPELINE_URL}/calls/summarize`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipeline summarize failed (${res.status}): ${text}`);
    }

    return await res.json();
  }

  if (audioUrl) {
    const res = await pipelineFetch(`${PIPELINE_URL}/calls/summarize-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_url: audioUrl,
        call_id: String(callId)
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipeline summarize URL failed (${res.status}): ${text}`);
    }

    return await res.json();
  }

  throw new Error('Neither audio file nor audio URL provided');
}
