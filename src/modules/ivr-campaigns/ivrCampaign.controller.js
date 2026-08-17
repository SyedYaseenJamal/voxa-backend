import { IvrCampaign } from './ivrCampaign.model.js';

export const createCampaign = async (req, res) => {
  try {
    const { name, type, audioFile, csvFile, description } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ success: false, message: 'Name and Type are required.' });
    }

    const campaign = new IvrCampaign({
      name,
      type: type.toLowerCase(),
      audioFile,
      csvFile,
      description,
      status: 'pending',
      createdBy: 'admin'
    });

    await campaign.save();

    res.status(201).json({ success: true, message: 'Campaign created successfully', data: campaign });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getCampaigns = async (req, res) => {
  try {
    const campaigns = await IvrCampaign.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: campaigns });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
