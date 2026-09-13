import Lead from '../integrations/lead.model.js';
import LeadList from '../integrations/leadList.model.js';
import { error as apiError } from '../../utils/ApiResponse.js';

/**
 * GET /api/v1/leads
 * Returns all leads for this company from the database.
 */
export const getLeads = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;

    const leads = await Lead.find({ companyId })
      .populate('leadListId', 'name source sourceRefId')
      .sort({ createdAt: -1 })
      .limit(500);

    const formatted = leads.map(l => ({
      id: l._id.toString(),
      full_name: l.fullName || '',
      email: l.email || '',
      phone: l.phoneE164 || '',
      form_id: l.leadListId?.sourceRefId || (l.leadListId ? l.leadListId._id.toString() : null),
      form_name: l.leadListId?.name || 'Manual Lead',
      source: l.leadListId?.source || 'manual',
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

/**
 * POST /api/v1/leads/single
 * Create a single lead manually with a specified Form/Group Name
 */
export const createSingleLead = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const userId = req.user.userId;
    const { fullName, email, phone, formName } = req.body;

    if (!phone && !fullName) {
      return apiError(res, 400, 'Full name or phone number is required.');
    }

    const listName = (formName && formName.trim()) ? formName.trim() : 'Manual Leads';

    // Find or create LeadList for this form name
    let leadList = await LeadList.findOne({ companyId, name: listName });
    if (!leadList) {
      leadList = await LeadList.create({
        companyId,
        name: listName,
        source: 'manual',
        totalLeads: 0,
        createdBy: userId
      });
    }

    // Create the Lead record
    const newLead = await Lead.create({
      companyId,
      leadListId: leadList._id,
      fullName: fullName || '',
      email: email || '',
      phoneE164: phone || '—',
      globalStatus: 'new'
    });

    // Increment LeadList count
    await LeadList.updateOne({ _id: leadList._id }, { $inc: { totalLeads: 1 } });

    res.json({
      success: true,
      message: 'Lead created successfully',
      lead: {
        id: newLead._id.toString(),
        full_name: newLead.fullName,
        email: newLead.email,
        phone: newLead.phoneE164,
        form_id: leadList._id.toString(),
        form_name: leadList.name,
        source: 'manual',
        lead_status: 'new',
        created_at: newLead.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/leads/csv
 * Bulk import leads from parsed CSV with a specified Form/Group Name
 */
export const importCsvLeads = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const userId = req.user.userId;
    const { formName, leads } = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return apiError(res, 400, 'leads array is required and must not be empty.');
    }

    const listName = (formName && formName.trim()) ? formName.trim() : `CSV Import ${new Date().toLocaleDateString()}`;

    // Find or create LeadList for this CSV import group
    let leadList = await LeadList.findOne({ companyId, name: listName });
    if (!leadList) {
      leadList = await LeadList.create({
        companyId,
        name: listName,
        source: 'csv',
        totalLeads: 0,
        createdBy: userId
      });
    }

    // Prepare lead documents
    const leadDocs = leads.map(item => ({
      companyId,
      leadListId: leadList._id,
      fullName: item.fullName || item.full_name || item.name || '',
      email: item.email || '',
      phoneE164: item.phone || item.phoneE164 || item.phone_number || '—',
      globalStatus: 'new'
    }));

    const inserted = await Lead.insertMany(leadDocs);

    // Update count
    await LeadList.updateOne({ _id: leadList._id }, { $inc: { totalLeads: inserted.length } });

    res.json({
      success: true,
      message: `Successfully imported ${inserted.length} leads under form name "${listName}"`,
      count: inserted.length,
      form_name: listName
    });
  } catch (err) {
    next(err);
  }
};
