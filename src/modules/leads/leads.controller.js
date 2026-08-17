import Lead from '../integrations/lead.model.js';
import LeadList from '../integrations/leadList.model.js';

/**
 * GET /api/v1/leads
 * Returns all leads for this company from the database.
 * Matches the shape used by voxa-crm-backend /api/leads
 */
export const getLeads = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;

    const leads = await Lead.find({ companyId })
      .populate('leadListId', 'name source sourceRefId')
      .sort({ createdAt: -1 })
      .limit(200);

    const formatted = leads.map(l => ({
      id: l._id,
      full_name: l.fullName || '',
      email: l.email || '',
      phone: l.phoneE164 || '',
      form_id: l.leadListId?.sourceRefId || null,
      form_name: l.leadListId?.name || null,
      lead_status: l.globalStatus || 'new',
      assigned_agent: null,
      created_at: l.createdAt,
    }));

    res.json({ success: true, leads: formatted });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/leads/stats
 * Returns summary stats: total, new, converted etc.
 */
export const getLeadsStats = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;

    const [total, newCount, convertedCount] = await Promise.all([
      Lead.countDocuments({ companyId }),
      Lead.countDocuments({ companyId, globalStatus: 'new' }),
      Lead.countDocuments({ companyId, globalStatus: 'converted' }),
    ]);

    res.json({
      success: true,
      stats: {
        total,
        new: newCount,
        converted: convertedCount,
        status: 'Live',
      },
    });
  } catch (err) {
    next(err);
  }
};
