import fs from 'fs';
import path from 'path';

const PIPELINE_URL = (process.env.VOXA_AI_PIPELINE_URL || 'http://165.99.50.70:8000').replace(/\/$/, '');
const RECORDINGS_DIRS = [
  process.env.RECORDINGS_PATH,
  '/var/data',
  'var/data',
  'C:/var/data',
  path.join(process.cwd(), 'var', 'data'),
  path.join(process.cwd(), 'recordings')
].filter(Boolean);

/**
 * Searches directories for a matching recording file by unique ID, filename, or phone number.
 * e.g., var/data/03022011625_1788800465.17.wav
 */
export function findRecordingFile(uniqueid, phone = null, rawFilename = null) {
  if (!uniqueid && !rawFilename) return null;

  const targetUniqueId = String(uniqueid || '').trim();
  const cleanPhone = phone ? String(phone).replace(/\D/g, '') : '';

  // 1. Direct path check if rawFilename provided
  if (rawFilename) {
    if (fs.existsSync(rawFilename)) return path.resolve(rawFilename);
    const baseName = path.basename(rawFilename);
    for (const dir of RECORDINGS_DIRS) {
      const fullPath = path.join(dir, baseName);
      if (fs.existsSync(fullPath)) return fullPath;
    }
  }

  // 2. Search candidate directories
  for (const dir of RECORDINGS_DIRS) {
    if (!fs.existsSync(dir)) continue;

    try {
      const files = fs.readdirSync(dir);
      
      // Exact candidate names first
      if (cleanPhone && targetUniqueId) {
        const exact1 = `${cleanPhone}_${targetUniqueId}.wav`;
        if (files.includes(exact1)) return path.join(dir, exact1);
      }
      if (targetUniqueId) {
        const exact2 = `${targetUniqueId}.wav`;
        if (files.includes(exact2)) return path.join(dir, exact2);
      }

      // Search for any file containing uniqueid
      if (targetUniqueId) {
        const match = files.find(f => f.includes(targetUniqueId) && (f.endsWith('.wav') || f.endsWith('.mp3') || f.endsWith('.gsm')));
        if (match) return path.join(dir, match);
      }
    } catch (err) {
      console.warn(`[TelephonyService] Error reading directory ${dir}:`, err.message);
    }
  }

  return null;
}

/**
 * Call the AI Pipeline API
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

    const res = await fetch(`${PIPELINE_URL}/calls/process`, {
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
    const res = await fetch(`${PIPELINE_URL}/calls/process-url`, {
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

    const res = await fetch(`${PIPELINE_URL}/calls/transcribe`, {
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
    const res = await fetch(`${PIPELINE_URL}/calls/transcribe-url`, {
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

    const res = await fetch(`${PIPELINE_URL}/calls/summarize`, {
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
    const res = await fetch(`${PIPELINE_URL}/calls/summarize-url`, {
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
