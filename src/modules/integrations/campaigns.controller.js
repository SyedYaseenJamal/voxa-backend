import axios from 'axios';
import FormData from 'form-data';
import multer from 'multer';
import PlatformIntegration from './platformIntegration.model.js';

// ── Multer: In-Memory image storage for Meta Ad Creatives ─────────────────────
const memoryStorage = multer.memoryStorage();
export const uploadAdImageMulter = multer({
  storage: memoryStorage,
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB max
});

/**
 * Helper to fetch Meta credentials for a company.
 * Automatically formats adAccountId with 'act_' prefix if missing.
 */
async function getMetaCredentials(companyId) {
  if (!companyId) {
    throw new Error('Company ID is missing from user session');
  }

  const integration = await PlatformIntegration.findOne({ companyId, platformType: 'meta' });
  if (!integration || !integration.credentials) {
    throw new Error('Meta integration is not configured');
  }

  const token = integration.credentials.metaPageAccessToken;
  let adAccountId = integration.credentials.metaAdAccountId;
  const pageId = integration.credentials.metaPageId;

  if (!token) {
    throw new Error('Meta Page Access Token is missing');
  }

  if (adAccountId) {
    adAccountId = adAccountId.trim();
    if (!adAccountId.startsWith('act_')) {
      adAccountId = `act_${adAccountId}`;
    }
  }

  return {
    token,
    adAccountId,
    pageId,
    adAccountName: integration.credentials.metaAdAccountName || 'Meta Ad Account',
    pageName: integration.credentials.metaPageName || 'Connected Page'
  };
}

/**
 * Centralized Meta Error Handler
 */
function handleMetaError(res, err, defaultMsg = 'Meta API Error') {
  console.error('[Meta Campaigns Error]:', err.response?.data || err.message);

  const metaErr = err.response?.data?.error;
  if (metaErr) {
    // Check for rate limits
    if (metaErr.code === 17 || metaErr.code === 429 || metaErr.code === 80004 || metaErr.is_transient) {
      return res.status(200).json({
        success: false,
        error: 'rate_limit'
      });
    }

    return res.status(200).json({
      success: false,
      error: metaErr.message || metaErr.error_user_msg || defaultMsg
    });
  }

  return res.status(200).json({
    success: false,
    error: err.message || defaultMsg
  });
}

// ─── CAMPAIGNS ────────────────────────────────────────────────────────────────

/**
 * GET /api/campaigns
 */
export const getCampaigns = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token, adAccountId, adAccountName, pageId, pageName } = await getMetaCredentials(companyId);

    if (!adAccountId) {
      return res.status(200).json({
        success: false,
        error: 'Meta Ad Account ID is not configured. Please add it in Omnichannel settings.'
      });
    }

    const datePreset = req.query.date_preset || 'last_30d';

    const fields = [
      'id', 'name', 'objective', 'status', 'effective_status', 'configured_status',
      'daily_budget', 'lifetime_budget', 'budget_remaining', 'spend_cap',
      'bid_strategy', 'buying_type', 'pacing_type', 'start_time', 'stop_time',
      'created_time', 'updated_time', 'special_ad_categories', 'issues_info',
      'source_campaign_id', 'account_id',
      `insights.date_preset(${datePreset}){spend,reach,impressions,clicks,ctr,cpm,cpc,cpp,frequency,actions,cost_per_action_type,action_values,date_start,date_stop}`
    ].join(',');

    const response = await axios.get(
      `https://graph.facebook.com/v20.0/${adAccountId}/campaigns`,
      {
        params: {
          access_token: token,
          fields,
          limit: 100
        }
      }
    );

    const rawList = response.data?.data || [];
    const campaigns = rawList.map(c => {
      const insight = c.insights?.data?.[0] || null;
      return {
        id: c.id,
        name: c.name,
        objective: c.objective,
        status: c.status,
        effective_status: c.effective_status,
        configured_status: c.configured_status,
        daily_budget: c.daily_budget || null,
        lifetime_budget: c.lifetime_budget || null,
        budget_remaining: c.budget_remaining || null,
        spend_cap: c.spend_cap || null,
        bid_strategy: c.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
        buying_type: c.buying_type || 'AUCTION',
        pacing_type: c.pacing_type || ['standard'],
        start_time: c.start_time || null,
        stop_time: c.stop_time || null,
        created_time: c.created_time || null,
        updated_time: c.updated_time || null,
        special_ad_categories: c.special_ad_categories || [],
        issues_info: c.issues_info || null,
        source_campaign_id: c.source_campaign_id || '0',
        ad_account_id: adAccountId,
        ad_account_name: adAccountName,
        page_id: pageId,
        page_name: pageName,
        insights: insight ? {
          spend: insight.spend || '0.00',
          reach: insight.reach || '0',
          impressions: insight.impressions || '0',
          clicks: insight.clicks || '0',
          ctr: insight.ctr || '0',
          cpm: insight.cpm || '0',
          cpc: insight.cpc || '0',
          cpp: insight.cpp || '0',
          frequency: insight.frequency || '0',
          actions: (insight.actions || []).reduce((acc, a) => {
            acc[a.action_type] = a.value;
            return acc;
          }, {}),
          cost_per_action_type: (insight.cost_per_action_type || []).reduce((acc, a) => {
            acc[a.action_type] = a.value;
            return acc;
          }, {}),
          action_values: (insight.action_values || []).reduce((acc, a) => {
            acc[a.action_type] = a.value;
            return acc;
          }, {}),
          date_start: insight.date_start,
          date_stop: insight.date_stop
        } : null
      };
    });

    return res.status(200).json({
      success: true,
      date_preset: datePreset,
      campaigns,
      accounts: [
        {
          ad_account_id: adAccountId,
          ad_account_name: adAccountName,
          campaigns
        }
      ]
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to fetch campaigns');
  }
};

/**
 * GET /api/campaigns/:id
 */
export const getCampaignById = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token, adAccountId, adAccountName, pageId, pageName } = await getMetaCredentials(companyId);
    const campaignId = req.params.id;
    const datePreset = req.query.date_preset || 'last_30d';
    const includeBreakdowns = req.query.include_breakdowns === 'true' || req.query.include_breakdowns === true;

    // 1. Fetch Campaign Details
    const campaignFields = [
      'id', 'name', 'objective', 'status', 'effective_status', 'configured_status',
      'daily_budget', 'lifetime_budget', 'budget_remaining', 'spend_cap',
      'bid_strategy', 'buying_type', 'pacing_type', 'start_time', 'stop_time',
      'created_time', 'updated_time', 'special_ad_categories', 'issues_info',
      `insights.date_preset(${datePreset}){spend,reach,impressions,clicks,unique_clicks,ctr,unique_ctr,cpm,cpc,cpp,frequency,actions,cost_per_action_type,action_values,date_start,date_stop}`
    ].join(',');

    const campRes = await axios.get(
      `https://graph.facebook.com/v20.0/${campaignId}`,
      {
        params: {
          access_token: token,
          fields: campaignFields
        }
      }
    );

    const c = campRes.data;
    const insight = c.insights?.data?.[0] || null;

    // 2. Fetch Ad Sets
    const adsetFields = [
      'id', 'name', 'campaign_id', 'status', 'effective_status', 'configured_status',
      'daily_budget', 'lifetime_budget', 'budget_remaining', 'bid_strategy',
      'optimization_goal', 'billing_event', 'destination_type', 'promoted_object',
      'targeting', 'is_dynamic_creative', 'learning_stage_info', 'start_time',
      'created_time', 'updated_time',
      `insights.date_preset(${datePreset}){spend,reach,impressions,clicks,ctr,cpm,cpc,actions,date_start,date_stop}`
    ].join(',');

    const adsetsRes = await axios.get(
      `https://graph.facebook.com/v20.0/${campaignId}/adsets`,
      {
        params: {
          access_token: token,
          fields: adsetFields,
          limit: 100
        }
      }
    ).catch(() => ({ data: { data: [] } }));

    const rawAdsets = adsetsRes.data?.data || [];

    // 3. Fetch Ads with Creatives
    const adFields = [
      'id', 'name', 'adset_id', 'campaign_id', 'status', 'effective_status',
      'configured_status', 'bid_type', 'preview_shareable_link', 'created_time', 'updated_time',
      'creative{id,name,title,body,image_url,thumbnail_url,call_to_action_type,object_story_spec}',
      `insights.date_preset(${datePreset}){spend,reach,impressions,clicks,ctr,actions,date_start,date_stop}`
    ].join(',');

    const adsRes = await axios.get(
      `https://graph.facebook.com/v20.0/${campaignId}/ads`,
      {
        params: {
          access_token: token,
          fields: adFields,
          limit: 100
        }
      }
    ).catch(() => ({ data: { data: [] } }));

    const rawAds = adsRes.data?.data || [];

    // Nest ads inside adsets
    const adsets = rawAdsets.map(as => {
      const asInsight = as.insights?.data?.[0] || null;
      const matchingAds = rawAds
        .filter(ad => ad.adset_id === as.id)
        .map(ad => {
          const adInsight = ad.insights?.data?.[0] || null;
          return {
            id: ad.id,
            name: ad.name,
            adset_id: ad.adset_id,
            campaign_id: ad.campaign_id,
            status: ad.status,
            effective_status: ad.effective_status,
            configured_status: ad.configured_status,
            bid_type: ad.bid_type,
            preview_shareable_link: ad.preview_shareable_link,
            created_time: ad.created_time,
            updated_time: ad.updated_time,
            creative: ad.creative || null,
            insights: adInsight ? {
              spend: adInsight.spend || '0.00',
              reach: adInsight.reach || '0',
              impressions: adInsight.impressions || '0',
              clicks: adInsight.clicks || '0',
              ctr: adInsight.ctr || '0',
              actions: (adInsight.actions || []).reduce((acc, a) => {
                acc[a.action_type] = a.value;
                return acc;
              }, {}),
              date_start: adInsight.date_start,
              date_stop: adInsight.date_stop
            } : null
          };
        });

      return {
        id: as.id,
        name: as.name,
        campaign_id: as.campaign_id,
        status: as.status,
        effective_status: as.effective_status,
        configured_status: as.configured_status,
        daily_budget: as.daily_budget || null,
        lifetime_budget: as.lifetime_budget || null,
        budget_remaining: as.budget_remaining || null,
        bid_strategy: as.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
        optimization_goal: as.optimization_goal,
        billing_event: as.billing_event,
        destination_type: as.destination_type,
        promoted_object: as.promoted_object,
        targeting: as.targeting,
        is_dynamic_creative: as.is_dynamic_creative || false,
        learning_stage_info: as.learning_stage_info,
        start_time: as.start_time,
        created_time: as.created_time,
        updated_time: as.updated_time,
        insights: asInsight ? {
          spend: asInsight.spend || '0.00',
          reach: asInsight.reach || '0',
          impressions: asInsight.impressions || '0',
          clicks: asInsight.clicks || '0',
          ctr: asInsight.ctr || '0',
          cpm: asInsight.cpm || '0',
          cpc: asInsight.cpc || '0',
          actions: (asInsight.actions || []).reduce((acc, a) => {
            acc[a.action_type] = a.value;
            return acc;
          }, {}),
          date_start: asInsight.date_start,
          date_stop: asInsight.date_stop
        } : null,
        ads: matchingAds
      };
    });

    let insights_by_age = [];
    let insights_by_gender = [];
    let insights_by_placement = [];
    let insights_by_country = [];
    let insights_by_device = [];
    let insights_daily = [];

    // 4. Optional Breakdowns
    if (includeBreakdowns) {
      try {
        const [ageGenRes, placementRes, countryRes, deviceRes, dailyRes] = await Promise.all([
          axios.get(`https://graph.facebook.com/v20.0/${campaignId}/insights`, {
            params: { access_token: token, date_preset: datePreset, breakdowns: 'age,gender', fields: 'spend,impressions,clicks,ctr,cpm,cpc,actions' }
          }).catch(() => ({ data: { data: [] } })),
          axios.get(`https://graph.facebook.com/v20.0/${campaignId}/insights`, {
            params: { access_token: token, date_preset: datePreset, breakdowns: 'publisher_platform,platform_position', fields: 'spend,impressions,clicks' }
          }).catch(() => ({ data: { data: [] } })),
          axios.get(`https://graph.facebook.com/v20.0/${campaignId}/insights`, {
            params: { access_token: token, date_preset: datePreset, breakdowns: 'country', fields: 'spend,impressions,clicks' }
          }).catch(() => ({ data: { data: [] } })),
          axios.get(`https://graph.facebook.com/v20.0/${campaignId}/insights`, {
            params: { access_token: token, date_preset: datePreset, breakdowns: 'impression_device', fields: 'spend,impressions,clicks' }
          }).catch(() => ({ data: { data: [] } })),
          axios.get(`https://graph.facebook.com/v20.0/${campaignId}/insights`, {
            params: { access_token: token, date_preset: datePreset, time_increment: 1, fields: 'spend,reach,impressions,clicks,date_start,date_stop' }
          }).catch(() => ({ data: { data: [] } })),
        ]);

        // Age / Gender breakdown mapping
        const ageGenData = ageGenRes.data?.data || [];
        const ageMap = {};
        const genderMap = {};
        ageGenData.forEach(row => {
          if (row.age) {
            if (!ageMap[row.age]) {
              ageMap[row.age] = { age: row.age, spend: 0, impressions: 0, clicks: 0 };
            }
            ageMap[row.age].spend += parseFloat(row.spend || 0);
            ageMap[row.age].impressions += parseInt(row.impressions || 0, 10);
            ageMap[row.age].clicks += parseInt(row.clicks || 0, 10);
          }
          if (row.gender) {
            if (!genderMap[row.gender]) {
              genderMap[row.gender] = { gender: row.gender, spend: 0, impressions: 0, clicks: 0 };
            }
            genderMap[row.gender].spend += parseFloat(row.spend || 0);
            genderMap[row.gender].impressions += parseInt(row.impressions || 0, 10);
            genderMap[row.gender].clicks += parseInt(row.clicks || 0, 10);
          }
        });

        insights_by_age = Object.values(ageMap).map(a => ({
          ...a,
          spend: a.spend.toFixed(2),
          impressions: String(a.impressions),
          clicks: String(a.clicks),
          ctr: a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(2) : '0',
          cpm: a.impressions > 0 ? ((a.spend / a.impressions) * 1000).toFixed(2) : '0',
          cpc: a.clicks > 0 ? (a.spend / a.clicks).toFixed(2) : '0'
        }));

        insights_by_gender = Object.values(genderMap).map(g => ({
          gender: g.gender,
          spend: g.spend.toFixed(2),
          impressions: String(g.impressions),
          clicks: String(g.clicks)
        }));

        insights_by_placement = (placementRes.data?.data || []).map(p => ({
          publisher_platform: p.publisher_platform,
          platform_position: p.platform_position,
          spend: p.spend || '0.00',
          impressions: p.impressions || '0',
          clicks: p.clicks || '0'
        }));

        insights_by_country = (countryRes.data?.data || []).map(co => ({
          country: co.country,
          spend: co.spend || '0.00',
          impressions: co.impressions || '0',
          clicks: co.clicks || '0'
        }));

        insights_by_device = (deviceRes.data?.data || []).map(d => ({
          impression_device: d.impression_device,
          spend: d.spend || '0.00',
          impressions: d.impressions || '0',
          clicks: d.clicks || '0'
        }));

        insights_daily = (dailyRes.data?.data || []).map(day => ({
          date_start: day.date_start,
          date_stop: day.date_stop,
          spend: day.spend || '0.00',
          reach: day.reach || '0',
          impressions: day.impressions || '0',
          clicks: day.clicks || '0'
        }));
      } catch {
        // Soft error on breakdowns
      }
    }

    const campaign = {
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      effective_status: c.effective_status,
      configured_status: c.configured_status,
      daily_budget: c.daily_budget || null,
      lifetime_budget: c.lifetime_budget || null,
      budget_remaining: c.budget_remaining || null,
      spend_cap: c.spend_cap || null,
      bid_strategy: c.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
      buying_type: c.buying_type || 'AUCTION',
      pacing_type: c.pacing_type || ['standard'],
      start_time: c.start_time || null,
      stop_time: c.stop_time || null,
      created_time: c.created_time || null,
      updated_time: c.updated_time || null,
      special_ad_categories: c.special_ad_categories || [],
      issues_info: c.issues_info || null,
      ad_account_id: adAccountId,
      ad_account_name: adAccountName,
      page_id: pageId,
      page_name: pageName,
      insights: insight ? {
        spend: insight.spend || '0.00',
        reach: insight.reach || '0',
        impressions: insight.impressions || '0',
        clicks: insight.clicks || '0',
        unique_clicks: insight.unique_clicks || '0',
        ctr: insight.ctr || '0',
        unique_ctr: insight.unique_ctr || '0',
        cpm: insight.cpm || '0',
        cpc: insight.cpc || '0',
        cpp: insight.cpp || '0',
        frequency: insight.frequency || '0',
        actions: (insight.actions || []).reduce((acc, a) => {
          acc[a.action_type] = a.value;
          return acc;
        }, {}),
        cost_per_action_type: (insight.cost_per_action_type || []).reduce((acc, a) => {
          acc[a.action_type] = a.value;
          return acc;
        }, {}),
        action_values: (insight.action_values || []).reduce((acc, a) => {
          acc[a.action_type] = a.value;
          return acc;
        }, {}),
        date_start: insight.date_start,
        date_stop: insight.date_stop
      } : null,
      insights_by_age,
      insights_by_gender,
      insights_by_placement,
      insights_by_country,
      insights_by_device,
      insights_daily,
      adsets
    };

    return res.status(200).json({
      success: true,
      date_preset: datePreset,
      campaign
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to fetch campaign details');
  }
};

/**
 * POST /api/campaigns/create
 */
export const createCampaign = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token, adAccountId } = await getMetaCredentials(companyId);

    if (!adAccountId) {
      return res.status(200).json({
        success: false,
        error: 'Meta Ad Account ID is missing. Please configure it in Omnichannel settings.'
      });
    }

    const {
      name,
      objective,
      status = 'PAUSED',
      special_ad_categories = [],
      daily_budget,
      lifetime_budget,
      bid_strategy,
      start_time,
      stop_time
    } = req.body;

    if (!name || !objective) {
      return res.status(200).json({
        success: false,
        error: 'name and objective are required.'
      });
    }

    const payload = {
      name,
      objective,
      status,
      special_ad_categories: special_ad_categories.length > 0 ? special_ad_categories : ['NONE'],
      access_token: token
    };

    if (daily_budget) payload.daily_budget = Math.round(Number(daily_budget));
    if (lifetime_budget) payload.lifetime_budget = Math.round(Number(lifetime_budget));
    if (bid_strategy) payload.bid_strategy = bid_strategy;
    if (start_time) payload.start_time = start_time;
    if (stop_time) payload.stop_time = stop_time;

    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${adAccountId}/campaigns`,
      payload
    );

    return res.status(200).json({
      success: true,
      campaign_id: response.data?.id
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to create campaign');
  }
};

/**
 * PATCH /api/campaigns/:id
 */
export const updateCampaign = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token } = await getMetaCredentials(companyId);
    const campaignId = req.params.id;

    const payload = { ...req.body, access_token: token };

    await axios.post(
      `https://graph.facebook.com/v20.0/${campaignId}`,
      payload
    );

    return res.status(200).json({
      success: true,
      updated_campaign_id: campaignId
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to update campaign');
  }
};

/**
 * DELETE /api/campaigns/:id
 */
export const deleteCampaign = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token } = await getMetaCredentials(companyId);
    const campaignId = req.params.id;

    await axios.delete(
      `https://graph.facebook.com/v20.0/${campaignId}`,
      {
        params: { access_token: token }
      }
    );

    return res.status(200).json({
      success: true,
      deleted_campaign_id: campaignId
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to delete campaign');
  }
};

// ─── AD SETS ──────────────────────────────────────────────────────────────────

/**
 * GET /api/adsets
 */
export const getAdSets = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token, adAccountId } = await getMetaCredentials(companyId);
    const { campaign_id } = req.query;

    const targetUrl = campaign_id
      ? `https://graph.facebook.com/v20.0/${campaign_id}/adsets`
      : `https://graph.facebook.com/v20.0/${adAccountId}/adsets`;

    const fields = 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting,created_time';

    const response = await axios.get(targetUrl, {
      params: {
        access_token: token,
        fields,
        limit: 100
      }
    });

    return res.status(200).json({
      success: true,
      adsets: response.data?.data || []
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to fetch ad sets');
  }
};

/**
 * POST /api/adsets/create
 */
export const createAdSet = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token, adAccountId, pageId } = await getMetaCredentials(companyId);

    const {
      name,
      campaign_id,
      daily_budget,
      lifetime_budget,
      status = 'PAUSED',
      targeting,
      bid_amount,
      start_time,
      end_time,
      optimization_goal = 'LEAD_GENERATION',
      billing_event = 'IMPRESSIONS',
      promoted_object,
      destination_type
    } = req.body;

    if (!name || !campaign_id) {
      return res.status(200).json({
        success: false,
        error: 'name and campaign_id are required.'
      });
    }

    const payload = {
      name,
      campaign_id,
      status,
      optimization_goal,
      billing_event,
      access_token: token
    };

    if (daily_budget) payload.daily_budget = Math.round(Number(daily_budget));
    if (lifetime_budget) payload.lifetime_budget = Math.round(Number(lifetime_budget));
    if (bid_amount) payload.bid_amount = Math.round(Number(bid_amount));
    if (start_time) payload.start_time = start_time;
    if (end_time) payload.end_time = end_time;
    if (destination_type) payload.destination_type = destination_type;

    if (promoted_object) {
      payload.promoted_object = promoted_object;
    } else if (pageId && optimization_goal === 'LEAD_GENERATION') {
      payload.promoted_object = { page_id: pageId };
    }

    if (targeting) {
      payload.targeting = targeting;
    } else {
      payload.targeting = {
        age_min: 18,
        age_max: 65,
        geo_locations: { countries: ['PK'] }
      };
    }

    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${adAccountId}/adsets`,
      payload
    );

    return res.status(200).json({
      success: true,
      adset_id: response.data?.id
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to create ad set');
  }
};

/**
 * PATCH /api/adsets/:id
 */
export const updateAdSet = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token } = await getMetaCredentials(companyId);
    const adsetId = req.params.id;

    const payload = { ...req.body, access_token: token };

    await axios.post(
      `https://graph.facebook.com/v20.0/${adsetId}`,
      payload
    );

    return res.status(200).json({
      success: true,
      updated_adset_id: adsetId
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to update ad set');
  }
};

/**
 * DELETE /api/adsets/:id
 */
export const deleteAdSet = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token } = await getMetaCredentials(companyId);
    const adsetId = req.params.id;

    await axios.delete(
      `https://graph.facebook.com/v20.0/${adsetId}`,
      {
        params: { access_token: token }
      }
    );

    return res.status(200).json({
      success: true,
      deleted_adset_id: adsetId
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to delete ad set');
  }
};

// ─── AD CREATIVES ─────────────────────────────────────────────────────────────

/**
 * POST /api/adcreatives/upload-image
 */
export const uploadCreativeImage = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token, adAccountId } = await getMetaCredentials(companyId);

    if (!req.file) {
      return res.status(200).json({
        success: false,
        error: 'No image file uploaded'
      });
    }

    const form = new FormData();
    form.append('access_token', token);
    form.append('filename', req.file.buffer, {
      filename: req.file.originalname || 'creative.png',
      contentType: req.file.mimetype || 'image/png'
    });

    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${adAccountId}/adimages`,
      form,
      {
        headers: form.getHeaders()
      }
    );

    const imagesObj = response.data?.images || {};
    const firstImage = Object.values(imagesObj)[0];
    const imageHash = firstImage?.hash;

    if (!imageHash) {
      return res.status(200).json({
        success: false,
        error: 'Meta did not return an image hash'
      });
    }

    return res.status(200).json({
      success: true,
      image_hash: imageHash
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to upload image to Meta');
  }
};

/**
 * POST /api/adcreatives/create
 */
export const createAdCreative = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token, adAccountId, pageId } = await getMetaCredentials(companyId);

    const {
      name,
      image_hash,
      message,
      headline,
      description,
      lead_gen_form_id,
      cta_type = 'LEARN_MORE',
      link_url
    } = req.body;

    if (!name || !image_hash || !message || !headline) {
      return res.status(200).json({
        success: false,
        error: 'name, image_hash, message, and headline are required.'
      });
    }

    const linkData = {
      image_hash,
      message,
      name: headline,
      description: description || undefined,
      call_to_action: {
        type: cta_type,
        value: lead_gen_form_id ? { lead_gen_form_id } : { link: link_url || 'https://voxa-crm.vercel.app/' }
      }
    };

    if (link_url) {
      linkData.link = link_url;
    }

    const payload = {
      name,
      object_story_spec: {
        page_id: pageId,
        link_data: linkData
      },
      access_token: token
    };

    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${adAccountId}/adcreatives`,
      payload
    );

    return res.status(200).json({
      success: true,
      creative_id: response.data?.id
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to create ad creative');
  }
};

/**
 * GET /api/adcreatives
 */
export const getAdCreatives = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token, adAccountId } = await getMetaCredentials(companyId);

    const response = await axios.get(
      `https://graph.facebook.com/v20.0/${adAccountId}/adcreatives`,
      {
        params: {
          access_token: token,
          fields: 'id,name,title,body,image_url,thumbnail_url,object_story_spec,created_time',
          limit: 100
        }
      }
    );

    return res.status(200).json({
      success: true,
      creatives: response.data?.data || []
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to fetch ad creatives');
  }
};

/**
 * DELETE /api/adcreatives/:id
 */
export const deleteAdCreative = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token } = await getMetaCredentials(companyId);
    const creativeId = req.params.id;

    await axios.delete(
      `https://graph.facebook.com/v20.0/${creativeId}`,
      {
        params: { access_token: token }
      }
    );

    return res.status(200).json({
      success: true,
      deleted_creative_id: creativeId
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to delete ad creative');
  }
};

// ─── ADS ──────────────────────────────────────────────────────────────────────

/**
 * GET /api/ads
 */
export const getAds = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token, adAccountId } = await getMetaCredentials(companyId);
    const { adset_id } = req.query;

    const targetUrl = adset_id
      ? `https://graph.facebook.com/v20.0/${adset_id}/ads`
      : `https://graph.facebook.com/v20.0/${adAccountId}/ads`;

    const response = await axios.get(targetUrl, {
      params: {
        access_token: token,
        fields: 'id,name,adset_id,campaign_id,status,effective_status,creative,created_time',
        limit: 100
      }
    });

    return res.status(200).json({
      success: true,
      ads: response.data?.data || []
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to fetch ads');
  }
};

/**
 * POST /api/ads/create
 */
export const createAd = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token, adAccountId } = await getMetaCredentials(companyId);

    const {
      name,
      adset_id,
      creative_id,
      status = 'PAUSED'
    } = req.body;

    if (!name || !adset_id || !creative_id) {
      return res.status(200).json({
        success: false,
        error: 'name, adset_id, and creative_id are required.'
      });
    }

    const payload = {
      name,
      adset_id,
      creative: { creative_id },
      status,
      access_token: token
    };

    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${adAccountId}/ads`,
      payload
    );

    return res.status(200).json({
      success: true,
      ad_id: response.data?.id
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to create ad');
  }
};

/**
 * PATCH /api/ads/:id
 */
export const updateAd = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token } = await getMetaCredentials(companyId);
    const adId = req.params.id;

    const payload = { ...req.body, access_token: token };

    await axios.post(
      `https://graph.facebook.com/v20.0/${adId}`,
      payload
    );

    return res.status(200).json({
      success: true,
      updated_ad_id: adId
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to update ad');
  }
};

/**
 * DELETE /api/ads/:id
 */
export const deleteAd = async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(200).json({ success: false, error: 'Unauthorized or missing company session' });
    }
    const { token } = await getMetaCredentials(companyId);
    const adId = req.params.id;

    await axios.delete(
      `https://graph.facebook.com/v20.0/${adId}`,
      {
        params: { access_token: token }
      }
    );

    return res.status(200).json({
      success: true,
      deleted_ad_id: adId
    });
  } catch (err) {
    return handleMetaError(res, err, 'Failed to delete ad');
  }
};
