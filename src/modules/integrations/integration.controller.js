import axios from 'axios';
import crypto from 'crypto';
import PlatformIntegration from './platformIntegration.model.js';
import MetaForm from './metaForm.model.js';
import LeadList from './leadList.model.js';
import Lead from './lead.model.js';
import Message from './message.model.js';
import { success as apiSuccess, error as apiError } from '../../utils/ApiResponse.js';

const generateWebhookVerifyToken = () => {
  return 'voxa_meta_vfk_' + crypto.randomBytes(16).toString('hex');
};

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

    if (platformType === 'meta' && !integration.webhookVerifyToken) {
      integration.webhookVerifyToken = generateWebhookVerifyToken();
      await integration.save();
    }

    // Mask sensitive fields before returning
    const maskedCreds = { ...integration.credentials.toObject() };
    if (maskedCreds.metaPageAccessToken) {
      maskedCreds.metaPageAccessToken = '••••••••' + maskedCreds.metaPageAccessToken.slice(-6);
    }
    if (maskedCreds.metaAppSecret) {
      maskedCreds.metaAppSecret = '••••••••';
    }
    if (maskedCreds.shopifyAccessToken) {
      maskedCreds.shopifyAccessToken = '••••••••' + maskedCreds.shopifyAccessToken.slice(-6);
    }
    if (maskedCreds.shopifyApiSecretKey) {
      maskedCreds.shopifyApiSecretKey = '••••••••';
    }
    if (maskedCreds.darazAppSecret) {
      maskedCreds.darazAppSecret = '••••••••';
    }
    if (maskedCreds.darazAccessToken) {
      maskedCreds.darazAccessToken = '••••••••' + maskedCreds.darazAccessToken.slice(-6);
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
        webhookVerifyToken: integration.webhookVerifyToken,
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
    const allowed = ['meta', 'whatsapp', 'sms', 'email', 'shopify', 'daraz'];
    if (!allowed.includes(platformType)) {
      return apiError(res, 400, `Platform ${platformType} is not supported`);
    }

    const existing = await PlatformIntegration.findOne({ companyId, platformType });

    // Prepare credentials from request body
    const credentials = {};
    if (platformType === 'meta') {
      const { metaAppId, metaAppSecret, metaPageAccessToken, metaPageId, metaAdAccountId } = req.body;
      if (!metaPageAccessToken || !metaPageId) {
        return apiError(res, 400, 'metaPageAccessToken and metaPageId are required for Meta integration');
      }

      credentials.metaAppId = metaAppId;
      credentials.metaAppSecret = (metaAppSecret && !metaAppSecret.includes('••'))
        ? metaAppSecret
        : existing?.credentials?.metaAppSecret;

      credentials.metaPageAccessToken = (metaPageAccessToken && !metaPageAccessToken.includes('••'))
        ? metaPageAccessToken
        : existing?.credentials?.metaPageAccessToken;

      credentials.metaPageId = metaPageId;
      credentials.metaAdAccountId = metaAdAccountId;
    } else if (platformType === 'shopify') {
      const { shopifyShopUrl, shopifyAccessToken, shopifyApiKey, shopifyApiSecretKey, shopifyApiVersion } = req.body;
      if (!shopifyShopUrl || !shopifyAccessToken) {
        return apiError(res, 400, 'shopifyShopUrl and shopifyAccessToken are required for Shopify integration');
      }

      credentials.shopifyShopUrl = shopifyShopUrl;
      credentials.shopifyAccessToken = (shopifyAccessToken && !shopifyAccessToken.includes('••'))
        ? shopifyAccessToken
        : existing?.credentials?.shopifyAccessToken;

      credentials.shopifyApiKey = shopifyApiKey;
      credentials.shopifyApiSecretKey = (shopifyApiSecretKey && !shopifyApiSecretKey.includes('••'))
        ? shopifyApiSecretKey
        : existing?.credentials?.shopifyApiSecretKey;

      credentials.shopifyApiVersion = shopifyApiVersion || '2024-04';
    } else if (platformType === 'daraz') {
      const { darazShopName, darazSellerId, darazAppKey, darazAppSecret, darazAccessToken, darazRegion } = req.body;
      if (!darazAppKey || !darazAppSecret || !darazAccessToken) {
        return apiError(res, 400, 'darazAppKey, darazAppSecret, and darazAccessToken are required for Daraz integration');
      }

      credentials.darazShopName = darazShopName;
      credentials.darazSellerId = darazSellerId;
      credentials.darazAppKey = darazAppKey;
      credentials.darazAppSecret = (darazAppSecret && !darazAppSecret.includes('••'))
        ? darazAppSecret
        : existing?.credentials?.darazAppSecret;

      credentials.darazAccessToken = (darazAccessToken && !darazAccessToken.includes('••'))
        ? darazAccessToken
        : existing?.credentials?.darazAccessToken;

      credentials.darazRegion = darazRegion || 'PK';
    } else {
      Object.assign(credentials, req.body);
    }

    const existingDoc = await PlatformIntegration.findOne({ companyId, platformType });
    const webhookVerifyToken = existingDoc?.webhookVerifyToken || generateWebhookVerifyToken();

    const updated = await PlatformIntegration.findOneAndUpdate(
      { companyId, platformType },
      {
        companyId,
        platformType,
        credentials,
        webhookVerifyToken,
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

// ─── MESSENGER API HANDLERS ──────────────────────────────────────────

/**
 * GET /api/messages — Fetch all Messenger conversations for the company's Meta Page
 */
export const getMessages = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    if (!companyId) {
      return apiError(res, 400, 'Company ID is missing from user session');
    }

    const integration = await PlatformIntegration.findOne({ companyId, platformType: 'meta' });
    if (!integration || !integration.credentials?.metaPageAccessToken || !integration.credentials?.metaPageId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Meta integration is not configured or missing page credentials' }
      });
    }

    const token = integration.credentials.metaPageAccessToken;
    const pageId = integration.credentials.metaPageId;

    const response = await axios.get(
      `https://graph.facebook.com/v20.0/${pageId}/conversations`,
      {
        params: {
          access_token: token,
          fields: 'id,updated_time,snippet,participants',
          limit: 100
        }
      }
    );

    const rawConversations = response.data?.data || [];
    const conversations = rawConversations.map(conv => {
      const participants = conv.participants?.data || [];
      const customer = participants.find(p => String(p.id) !== String(pageId)) || participants[0] || {};
      
      return {
        thread_id: conv.id.startsWith('t_') ? conv.id : `t_${conv.id}`,
        raw_thread_id: conv.id,
        psid: customer.id || '',
        display_name: customer.name || 'Facebook User',
        snippet: conv.snippet || '',
        updated_time: conv.updated_time || new Date().toISOString()
      };
    });

    if (conversations.length === 0) {
      const localPsids = await Message.distinct('psid', { companyId });
      for (const psid of localPsids) {
        const lastMsg = await Message.findOne({ companyId, psid }).sort({ sentAt: -1 });
        if (lastMsg) {
          conversations.push({
            thread_id: lastMsg.threadId || `t_${psid}`,
            raw_thread_id: psid,
            psid: lastMsg.psid,
            display_name: lastMsg.senderName || `User (${psid})`,
            snippet: lastMsg.content,
            updated_time: lastMsg.sentAt.toISOString()
          });
        }
      }
    }

    res.json({
      success: true,
      conversations
    });
  } catch (err) {
    console.error('Error fetching Messenger conversations:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error || { message: err.message }
    });
  }
};

/**
 * GET /api/messages/:psid — Fetch message thread for a given PSID
 */
export const getMessagesByPsid = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { psid } = req.params;

    if (!psid) {
      return apiError(res, 400, 'psid parameter is required.');
    }

    const integration = await PlatformIntegration.findOne({ companyId, platformType: 'meta' });
    const token = integration?.credentials?.metaPageAccessToken;
    const pageId = integration?.credentials?.metaPageId;

    let messages = [];

    if (token && pageId) {
      try {
        const convRes = await axios.get(
          `https://graph.facebook.com/v20.0/${pageId}/conversations`,
          {
            params: {
              access_token: token,
              user_id: psid,
              fields: 'id,messages{id,message,created_time,from,to}'
            }
          }
        );

        const convData = convRes.data?.data?.[0];
        if (convData?.messages?.data) {
          const rawMsgs = convData.messages.data;
          const metaMsgs = rawMsgs.slice().reverse().map(m => {
            const isFromPage = String(m.from?.id) === String(pageId);
            return {
              direction: isFromPage ? 'outbound' : 'inbound',
              content: m.message || '',
              sent_at: m.created_time
            };
          });
          messages = metaMsgs;
        }
      } catch (graphErr) {
        console.warn('Live fetch from Meta Graph API failed, using local DB fallback:', graphErr.response?.data || graphErr.message);
      }
    }

    if (messages.length === 0) {
      const dbMsgs = await Message.find({ companyId, psid }).sort({ sentAt: 1 });
      messages = dbMsgs.map(m => ({
        direction: m.direction,
        content: m.content,
        sent_at: m.sentAt.toISOString()
      }));
    }

    res.json({
      success: true,
      messages
    });
  } catch (err) {
    console.error('Error fetching messages for PSID:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.error || { message: err.message }
    });
  }
};

/**
 * POST /api/messages/send — Send a text reply to customer via Meta Send API
 */
export const sendMessengerMessage = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { psid, text } = req.body;

    if (!psid || !text) {
      return res.status(400).json({
        success: false,
        error: 'psid and text are required.'
      });
    }

    const integration = await PlatformIntegration.findOne({ companyId, platformType: 'meta' });
    if (!integration || !integration.credentials?.metaPageAccessToken) {
      return res.status(400).json({
        success: false,
        error: { message: 'Meta integration is not configured in Omnichannel Meta section.' }
      });
    }

    const token = integration.credentials.metaPageAccessToken;
    const pageId = integration.credentials.metaPageId;

    const metaRes = await axios.post(
      `https://graph.facebook.com/v20.0/me/messages?access_token=${token}`,
      {
        recipient: { id: psid },
        message: { text }
      }
    );

    await Message.create({
      companyId,
      threadId: `t_${psid}`,
      psid,
      direction: 'outbound',
      content: text,
      senderId: pageId,
      recipientId: psid,
      metaMessageId: metaRes.data?.message_id,
      sentAt: new Date()
    });

    res.json({
      success: true
    });
  } catch (err) {
    console.error('Error sending Messenger message:', err.response?.data || err.message);
    const metaError = err.response?.data?.error || { message: err.message };
    res.status(500).json({
      success: false,
      error: metaError
    });
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

  if (mode !== 'subscribe' || !token) {
    console.warn('Webhook verification failed: invalid mode or missing verify_token.');
    return res.sendStatus(403);
  }

  // 1. Check companyId parameter if provided (/webhook/meta/:companyId)
  if (req.params.companyId) {
    const integration = await PlatformIntegration.findOne({ companyId: req.params.companyId, platformType: 'meta' });
    if (integration && integration.webhookVerifyToken === token) {
      console.log(`Webhook verified for companyId=${req.params.companyId}`);
      return res.status(200).send(challenge);
    }
  }

  // 2. Search by unique token across all company Meta integrations
  const integrationByToken = await PlatformIntegration.findOne({ webhookVerifyToken: token, platformType: 'meta' });
  if (integrationByToken) {
    console.log(`Webhook verified via token for companyId=${integrationByToken.companyId}`);
    return res.status(200).send(challenge);
  }

  // 3. Fallback for legacy global env verify token
  if (process.env.META_WEBHOOK_VERIFY_TOKEN && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified via global fallback token.');
    return res.status(200).send(challenge);
  }

  console.warn('Webhook verification failed: token mismatch.');
  res.sendStatus(403);
};

/**
 * POST Webhook receiver for Lead Ads lead notifications
 */
export const receiveWebhook = async (req, res, next) => {
  try {
    const entry = req.body.entry?.[0];

    // ── Handle Messenger messaging events ──
    const messaging = entry?.messaging?.[0];
    if (messaging) {
      const senderId = messaging.sender?.id;
      const recipientId = messaging.recipient?.id;
      const messageText = messaging.message?.text;
      const isEcho = messaging.message?.is_echo;

      if (senderId && messageText && !isEcho) {
        console.log(`Processing inbound Messenger message from PSID=${senderId}`);
        let integration = null;
        if (req.params.companyId) {
          integration = await PlatformIntegration.findOne({ companyId: req.params.companyId, platformType: 'meta' });
        }
        if (!integration && recipientId) {
          integration = await PlatformIntegration.findOne({ 'credentials.metaPageId': recipientId, platformType: 'meta' });
        }

        if (integration) {
          await Message.create({
            companyId: integration.companyId,
            threadId: `t_${senderId}`,
            psid: senderId,
            direction: 'inbound',
            content: messageText,
            senderId,
            recipientId,
            metaMessageId: messaging.message?.mid,
            sentAt: new Date(messaging.timestamp || Date.now())
          });
          console.log(`Stored inbound Messenger message from PSID=${senderId} to DB`);
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    }

    // ── Handle Lead Ads events ──
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
