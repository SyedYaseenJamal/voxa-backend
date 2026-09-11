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

  console.log('\n[RecordingFinder] ─────────────────────────────────────────');
  console.log(`[RecordingFinder] Searching for recording`);
  console.log(`[RecordingFinder]   uniqueid    : "${targetUniqueId}"`);
  console.log(`[RecordingFinder]   phone       : "${cleanPhone}" (raw: "${phone}")`);
  console.log(`[RecordingFinder]   rawFilename : "${rawFilename}"`);
  console.log(`[RecordingFinder]   Search dirs : ${JSON.stringify(RECORDINGS_DIRS)}`);
  console.log('[RecordingFinder] ─────────────────────────────────────────');

  // 1. Direct path check if rawFilename provided
  if (rawFilename) {
    console.log(`[RecordingFinder] Step 1: Checking raw filename directly: "${rawFilename}"`);
    if (fs.existsSync(rawFilename)) {
      const resolved = path.resolve(rawFilename);
      console.log(`[RecordingFinder] ✅ FOUND (direct path): ${resolved}`);
      return resolved;
    }
    console.log(`[RecordingFinder]   Not found at direct path, trying in search dirs…`);
    const baseName = path.basename(rawFilename);
    for (const dir of RECORDINGS_DIRS) {
      const fullPath = path.join(dir, baseName);
      console.log(`[RecordingFinder]   Checking: ${fullPath}`);
      if (fs.existsSync(fullPath)) {
        console.log(`[RecordingFinder] ✅ FOUND (raw filename in dir): ${fullPath}`);
        return fullPath;
      }
    }
    console.log(`[RecordingFinder]   Raw filename not found in any dir.`);
  }

  // 2. Search candidate directories
  console.log(`[RecordingFinder] Step 2: Searching directories by uniqueid/phone pattern…`);
  for (const dir of RECORDINGS_DIRS) {
    const dirExists = fs.existsSync(dir);
    console.log(`[RecordingFinder]   Dir: "${dir}" — exists: ${dirExists}`);
    if (!dirExists) continue;

    try {
      const files = fs.readdirSync(dir);
      console.log(`[RecordingFinder]   Files in dir (${files.length} total): ${files.slice(0, 20).join(', ')}${files.length > 20 ? ' …(truncated)' : ''}`);

      // Exact candidate: phone_uniqueid.wav
      if (cleanPhone && targetUniqueId) {
        const exact1 = `${cleanPhone}_${targetUniqueId}.wav`;
        const found1 = files.includes(exact1);
        console.log(`[RecordingFinder]   Trying "${exact1}" → ${found1 ? '✅ FOUND' : '❌ not found'}`);
        if (found1) {
          const result = path.join(dir, exact1);
          console.log(`[RecordingFinder] ✅ FOUND (phone_uniqueid.wav): ${result}`);
          return result;
        }
      }

      // Exact candidate: uniqueid.wav
      if (targetUniqueId) {
        const exact2 = `${targetUniqueId}.wav`;
        const found2 = files.includes(exact2);
        console.log(`[RecordingFinder]   Trying "${exact2}" → ${found2 ? '✅ FOUND' : '❌ not found'}`);
        if (found2) {
          const result = path.join(dir, exact2);
          console.log(`[RecordingFinder] ✅ FOUND (uniqueid.wav): ${result}`);
          return result;
        }
      }

      // Partial match: any file containing the uniqueid
      if (targetUniqueId) {
        const match = files.find(f =>
          f.includes(targetUniqueId) &&
          (f.endsWith('.wav') || f.endsWith('.mp3') || f.endsWith('.gsm'))
        );
        if (match) {
          const result = path.join(dir, match);
          console.log(`[RecordingFinder] ✅ FOUND (partial match "${match}"): ${result}`);
          return result;
        }
        console.log(`[RecordingFinder]   No file containing "${targetUniqueId}" in this dir`);
      }
    } catch (err) {
      console.warn(`[RecordingFinder] ⚠️  Error reading dir "${dir}":`, err.message);
    }
  }

  console.log(`[RecordingFinder] ❌ NOT FOUND — recording not in any search directory`);
  console.log('[RecordingFinder] ─────────────────────────────────────────\n');
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
