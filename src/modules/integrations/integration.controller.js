import axios from 'axios';
import PlatformIntegration from './platformIntegration.model.js';
import MetaForm from './metaForm.model.js';
import LeadList from './leadList.model.js';
import Lead from './lead.model.js';
import { success as apiSuccess, error as apiError } from '../../utils/ApiResponse.js';

// ─── CREDENTIALS MANAGEMENT ──────────────────────────────────────────

/**
 * Get platform integration config for a company
 */
export const getConfig = async (req, res, next) => {
  try {
    const { platformType } = req.params;
    const companyId = req.user.companyId;

    if (!companyId) {
      return apiError(res, 400, 'Company ID is missing from user session');
    }

    const integration = await PlatformIntegration.findOne({ companyId, platformType });

    if (!integration) {
      return apiSuccess(res, null, 'No integration found', 200);
    }

    // Mask sensitive fields before returning
    const maskedCreds = { ...integration.credentials.toObject() };
    if (maskedCreds.metaPageAccessToken) {
      maskedCreds.metaPageAccessToken = '••••••••' + maskedCreds.metaPageAccessToken.slice(-6);
    }
    if (maskedCreds.metaAppSecret) {
      maskedCreds.metaAppSecret = '••••••••';
    }

    res.json({
      success: true,
      data: {
        _id: integration._id,
        platformType: integration.platformType,
        status: integration.status,
        leadsReceivedCount: integration.leadsReceivedCount,
        lastSyncAt: integration.lastSyncAt,
        connectedAt: integration.connectedAt,
        credentials: maskedCreds
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Save platform integration config
 */
export const saveConfig = async (req, res, next) => {
  try {
    const { platformType } = req.params;
    const companyId = req.user.companyId;
    const userId = req.user.userId;

    if (!companyId) {
      return apiError(res, 400, 'Company ID is missing from user session');
    }

    // Validate platform type
    const allowed = ['meta', 'whatsapp', 'sms', 'email'];
    if (!allowed.includes(platformType)) {
      return apiError(res, 400, `Platform ${platformType} is not supported`);
    }

    // Prepare credentials from request body
    const credentials = {};
    if (platformType === 'meta') {
      const { metaAppId, metaAppSecret, metaPageAccessToken, metaPageId, metaAdAccountId } = req.body;
      if (!metaPageAccessToken || !metaPageId) {
        return apiError(res, 400, 'metaPageAccessToken and metaPageId are required for Meta integration');
      }

      // If credentials already exist and we received masked values, preserve original values
      const existing = await PlatformIntegration.findOne({ companyId, platformType });

      credentials.metaAppId = metaAppId;
      credentials.metaAppSecret = (metaAppSecret && !metaAppSecret.includes('••'))
        ? metaAppSecret
        : existing?.credentials?.metaAppSecret;

      credentials.metaPageAccessToken = (metaPageAccessToken && !metaPageAccessToken.includes('••'))
        ? metaPageAccessToken
        : existing?.credentials?.metaPageAccessToken;

      credentials.metaPageId = metaPageId;
      credentials.metaAdAccountId = metaAdAccountId;
    }

    const updated = await PlatformIntegration.findOneAndUpdate(
      { companyId, platformType },
      {
        companyId,
        platformType,
        credentials,
        status: 'active',
        connectedBy: userId,
        connectedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Integration saved successfully',
      data: updated
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Disconnect an integration
 */
export const deleteConfig = async (req, res, next) => {
  try {
    const { platformType } = req.params;
    const companyId = req.user.companyId;

    if (!companyId) {
      return apiError(res, 400, 'Company ID is missing from user session');
    }

    const result = await PlatformIntegration.findOneAndDelete({ companyId, platformType });
    if (!result) {
      return apiError(res, 404, 'No integration found to delete');
    }

    res.json({
      success: true,
      message: 'Integration disconnected successfully'
    });
  } catch (err) {
    next(err);
  }
};

// ─── META LEAD ADS FORM GENERATOR ────────────────────────────────────

/**
 * Get lead ads forms from Meta Graph API
 */
export const getMetaForms = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;

    const integration = await PlatformIntegration.findOne({ companyId, platformType: 'meta' });
    if (!integration || !integration.credentials?.metaPageAccessToken || !integration.credentials?.metaPageId) {
      return apiError(res, 400, 'Meta integration is not configured or missing page credentials');
    }

    const token = integration.credentials.metaPageAccessToken;
    const pageId = integration.credentials.metaPageId;

    const response = await axios.get(
      `https://graph.facebook.com/v20.0/${pageId}/leadgen_forms`,
      {
        params: {
          access_token: token,
          fields: 'id,name,status,created_time,leads_count',
          limit: 100
        }
      }
    );

    // Fetch forms that were created through our VOXA app
    const localForms = await MetaForm.find({ companyId });
    const localFormIds = new Set(localForms.map(f => f.metaFormId));

    const forms = (response.data?.data || []).map(form => ({
      id: form.id,
      name: form.name,
      status: form.status,
      created_time: form.created_time,
      leads_count: form.leads_count ?? 0,
      created_via_voxa: localFormIds.has(form.id)
    }));

    res.json({ success: true, forms });
  } catch (err) {
    console.error('Error fetching Meta forms:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
};

/**
 * Create Leadgen Form on Meta Ads and save local reference
 */
export const createMetaForm = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { name, questions, privacy_policy } = req.body;

    if (!name || !questions) {
      return apiError(res, 400, 'Missing required fields: name and questions are required.');
    }

    const integration = await PlatformIntegration.findOne({ companyId, platformType: 'meta' });
    if (!integration || !integration.credentials?.metaPageAccessToken || !integration.credentials?.metaPageId) {
      return apiError(res, 400, 'Meta integration is not configured or missing page credentials');
    }

    const token = integration.credentials.metaPageAccessToken;
    const pageId = integration.credentials.metaPageId;
    const adAccountId = integration.credentials.metaAdAccountId;

    const BUILTIN_TYPES = ['FULL_NAME', 'EMAIL', 'PHONE', 'DATE_TIME', 'STREET_ADDRESS', 'CITY', 'STATE', 'COUNTRY', 'ZIP', 'POST_CODE', 'GENDER', 'MARITAL_STATUS', 'RELATIONSHIP_STATUS', 'MILITARY_STATUS', 'WORK_PHONE_NUMBER', 'WORK_EMAIL'];
    const parsedQuestions = Array.isArray(questions) ? questions : JSON.parse(questions);

    const sanitizedQuestions = parsedQuestions.map(q => {
      if (BUILTIN_TYPES.includes(q.type)) return { type: q.type };
      return { type: q.type, label: q.label, key: q.key };
    });

    const payload = {
      name,
      questions: JSON.stringify(sanitizedQuestions),
      privacy_policy: JSON.stringify(privacy_policy || { url: 'https://voxa-crm.vercel.app/privacy-policy' }),
      follow_up_action_url: 'https://voxa-crm.vercel.app',
      locale: 'en_US',
      page_id: pageId,
      access_token: token
    };

    console.log(`Publishing form "${name}" to Meta Page ${pageId}`);

    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${pageId}/leadgen_forms`,
      new URLSearchParams(payload).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const newForm = await MetaForm.create({
      companyId,
      formName: name,
      metaFormId: response.data.id,
      pageId,
      adAccountId,
      questions: sanitizedQuestions
    });

    res.json({ success: true, form_id: response.data.id, data: newForm });
  } catch (err) {
    console.error('Error creating Meta form:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
};

/**
 * Fetch recently captured leads from the database for this company
 */
export const getMetaLeads = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;

    const leads = await Lead.find({ companyId })
      .populate('leadListId')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, leads });
  } catch (err) {
    next(err);
  }
};

/**
 * Fetch leads for a specific Meta form directly from Meta Graph API
 */
export const getLeadsByFormId = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { formId } = req.params;

    const integration = await PlatformIntegration.findOne({ companyId, platformType: 'meta' });
    if (!integration || !integration.credentials?.metaPageAccessToken) {
      return res.status(400).json({ success: false, error: 'Meta integration not configured' });
    }

    const token = integration.credentials.metaPageAccessToken;

    const response = await axios.get(
      `https://graph.facebook.com/v20.0/${formId}/leads`,
      {
        params: {
          access_token: token,
          fields: 'id,created_time,field_data',
          limit: 500
        }
      }
    );

    const leads = (response.data?.data || []).map(lead => {
      const fields = {};
      lead.field_data?.forEach(f => { fields[f.name] = f.values?.[0] || ''; });
      return {
        id: lead.id,
        created_time: lead.created_time,
        fullName: fields.full_name || fields.name || '—',
        email: fields.email || '—',
        phone: fields.phone_number || fields.phone || '—',
        raw: fields
      };
    });

    res.json({ success: true, leads });
  } catch (err) {
    console.error('Error fetching leads for form:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
};

// ─── WEBHOOK HANDLERS ────────────────────────────────────────────────

/**
 * GET Webhook Verification for Meta subscription setup
 */
export const verifyWebhook = async (req, res, next) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified successfully.');
    return res.status(200).send(challenge);
  }

  console.warn('Webhook verification failed: token mismatch or incorrect mode.');
  res.sendStatus(403);
};

/**
 * POST Webhook receiver for Lead Ads lead notifications
 */
export const receiveWebhook = async (req, res, next) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    if (change?.field !== 'leadgen') return res.status(200).send('EVENT_RECEIVED');

    const leadgenId = change.value.leadgen_id;
    const formId = change.value.form_id || '';

    console.log(`Processing Meta webhook lead: leadgen_id=${leadgenId} form_id=${formId}`);

    // 1. Resolve companyId either from the route param or via MetaForm lookup
    let companyId = req.params.companyId;
    let localForm = null;

    if (formId) {
      localForm = await MetaForm.findOne({ metaFormId: formId });
      if (localForm && !companyId) {
        companyId = localForm.companyId;
      }
    }

    if (!companyId) {
      console.warn(`Could not resolve company for form_id=${formId} and leadgen_id=${leadgenId}`);
      return res.status(200).send('EVENT_RECEIVED');
    }

    // 2. Fetch the Meta integration credentials for this company to get access token
    const integration = await PlatformIntegration.findOne({ companyId, platformType: 'meta' });
    if (!integration || !integration.credentials?.metaPageAccessToken) {
      console.warn(`No Page Access Token found for company=${companyId}`);
      return res.status(200).send('EVENT_RECEIVED');
    }

    const token = integration.credentials.metaPageAccessToken;

    // 3. Fetch lead details from Meta Graph API
    const response = await axios.get(
      `https://graph.facebook.com/v25.0/${leadgenId}?access_token=${token}`
    );

    const fields = {};
    response.data?.field_data?.forEach(f => {
      fields[f.name] = f.values?.[0] || '';
    });

    const fullName = fields.full_name || fields.name || '';
    const email = fields.email || '';
    const phone = fields.phone_number || fields.phone || '';
    const formName = localForm?.formName || `Meta Form ${formId}`;

    if (!phone) {
      console.warn(`Lead processed successfully but missing phone number: ${fullName} (${email})`);
    }

    // 4. Look up or create a LeadList for this Meta form
    let leadList = await LeadList.findOne({ companyId, sourceRefId: formId });
    if (!leadList) {
      leadList = await LeadList.create({
        companyId,
        name: formName,
        source: 'meta',
        sourceRefId: formId,
        integrationId: integration._id,
        totalLeads: 0
      });
    }

    // 5. Store lead in the Lead collection
    await Lead.create({
      companyId,
      leadListId: leadList._id,
      phoneE164: phone || 'Unknown',
      fullName,
      email,
      sourcePayload: response.data,
      globalStatus: 'new'
    });

    // 6. Update counts
    await Promise.all([
      PlatformIntegration.updateOne({ _id: integration._id }, { $inc: { leadsReceivedCount: 1 } }),
      LeadList.updateOne({ _id: leadList._id }, { $inc: { totalLeads: 1 } })
    ]);

    console.log(`Stored lead in DB: Name="${fullName}", Phone="${phone}", Form="${formName}"`);
  } catch (err) {
    console.error('Webhook processing error:', err.response?.data || err.message);
  } finally {
    res.status(200).send('EVENT_RECEIVED');
  }
};
