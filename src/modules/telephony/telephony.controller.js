import fs from 'fs';
import path from 'path';
import { CallAnalysis } from './callAnalysis.model.js';
import { findRecordingFile, callPipelineProcess, callPipelineTranscribe, callPipelineSummarize } from './telephony.service.js';
import { success, error as apiError } from '../../utils/ApiResponse.js';

export const checkRecording = async (req, res) => {
  try {
    const { uniqueid, phone, filename } = req.query;
    if (!uniqueid && !filename) {
      return apiError(res, 400, 'uniqueid or filename parameter is required');
    }

    const filePath = findRecordingFile(uniqueid, phone, filename);
    if (!filePath || !fs.existsSync(filePath)) {
      return apiError(res, 404, 'Recording not found');
    }

    const baseName = path.basename(filePath);
    const streamUrl = `/api/v1/telephony/recordings/stream?uniqueid=${encodeURIComponent(uniqueid || '')}&filename=${encodeURIComponent(baseName)}`;

    return success(res, {
      exists: true,
      uniqueid,
      filename: baseName,
      stream_url: streamUrl,
    }, 'Recording found');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const streamRecording = async (req, res) => {
  try {
    const { uniqueid, phone, filename } = req.query;
    const filePath = findRecordingFile(uniqueid, phone, filename);

    if (!filePath || !fs.existsSync(filePath)) {
      return apiError(res, 404, 'Recording not found');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.mp3' ? 'audio/mpeg' : 'audio/wav';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const getCallAnalysis = async (req, res) => {
  try {
    const { callId } = req.params;
    const analysis = await CallAnalysis.findOne({
      $or: [{ call_id: callId }, { uniqueid: callId }]
    });

    if (!analysis) {
      return apiError(res, 404, 'No AI analysis found for this call');
    }

    return success(res, analysis, 'Call analysis fetched');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const processCall = async (req, res) => {
  try {
    const { call_id, uniqueid, phone, filename, audio_url, script = 'mixed' } = req.body;
    const activeCallId = String(call_id || uniqueid || Date.now());

    // Check if already processed and not requested force re-analysis
    if (!req.body.force) {
      const existing = await CallAnalysis.findOne({
        $or: [{ call_id: activeCallId }, { uniqueid: uniqueid }]
      });
      if (existing && existing.status === 'completed') {
        return success(res, existing, 'Existing analysis returned');
      }
    }

    const filePath = findRecordingFile(uniqueid || activeCallId, phone, filename);
    let resolvedAudioUrl = audio_url;

    if (!filePath && !resolvedAudioUrl) {
      return apiError(res, 404, 'Recording file not found on server for processing');
    }

    const result = await callPipelineProcess({
      callId: activeCallId,
      script,
      filePath,
      audioUrl: resolvedAudioUrl,
    });

    // Save or update in MongoDB
    const analysisRecord = await CallAnalysis.findOneAndUpdate(
      { call_id: activeCallId },
      {
        call_id: activeCallId,
        uniqueid: uniqueid || activeCallId,
        callerid: phone,
        recording_filename: filePath ? path.basename(filePath) : null,
        recording_url: resolvedAudioUrl,
        script,
        transcript: result.transcript,
        summary: result.summary,
        status: 'completed',
        raw_response: result,
      },
      { upsert: true, new: true }
    );

    return success(res, analysisRecord, 'Call processed successfully');
  } catch (err) {
    console.error('[Telephony Controller] Process Call Error:', err);
    return apiError(res, 500, err.message);
  }
};

export const transcribeCall = async (req, res) => {
  try {
    const { call_id, uniqueid, phone, filename, audio_url, script = 'mixed' } = req.body;
    const activeCallId = String(call_id || uniqueid || Date.now());
    const filePath = findRecordingFile(uniqueid || activeCallId, phone, filename);

    if (!filePath && !audio_url) {
      return apiError(res, 404, 'Recording file not found for transcription');
    }

    const result = await callPipelineTranscribe({
      callId: activeCallId,
      script,
      filePath,
      audioUrl: audio_url,
    });

    return success(res, result, 'Call transcribed successfully');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};

export const summarizeCall = async (req, res) => {
  try {
    const { call_id, uniqueid, phone, filename, audio_url } = req.body;
    const activeCallId = String(call_id || uniqueid || Date.now());
    const filePath = findRecordingFile(uniqueid || activeCallId, phone, filename);

    if (!filePath && !audio_url) {
      return apiError(res, 404, 'Recording file not found for summarization');
    }

    const result = await callPipelineSummarize({
      callId: activeCallId,
      filePath,
      audioUrl: audio_url,
    });

    return success(res, result, 'Call summarized successfully');
  } catch (err) {
    return apiError(res, 500, err.message);
  }
};
