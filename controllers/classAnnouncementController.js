const ClassAnnouncement = require('../models/ClassAnnouncement');

/**
 * @desc    Get announcements for a class
 * @route   GET /api/announcements
 */
const getAnnouncements = async (req, res, next) => {
  try {
    const { classId, page = 1, limit = 20 } = req.query;
    const filter = { isActive: true };
    if (classId) filter.class = classId;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const [announcements, total] = await Promise.all([
      ClassAnnouncement.find(filter)
        .populate('class', 'className subject grade')
        .populate('createdBy', 'username')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      ClassAnnouncement.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: announcements,
      pagination: { currentPage: pageNum, totalPages: Math.ceil(total / limitNum), totalItems: total }
    });
  } catch (error) { next(error); }
};

/**
 * @desc    Create announcement
 * @route   POST /api/announcements
 */
const createAnnouncement = async (req, res, next) => {
  try {
    const { classId, content, priority, week } = req.body;

    const announcement = await ClassAnnouncement.create({
      class: classId,
      content,
      priority: priority || 'NORMAL',
      week: week || 1,
      createdBy: req.user?._id || null
    });

    const populated = await ClassAnnouncement.findById(announcement._id)
      .populate('class', 'className subject')
      .populate('createdBy', 'username');

    res.status(201).json({ success: true, message: 'Announcement posted', data: populated });
  } catch (error) { next(error); }
};

/**
 * @desc    Update announcement
 * @route   PUT /api/announcements/:id
 */
const updateAnnouncement = async (req, res, next) => {
  try {
    const announcement = await ClassAnnouncement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });

    if (req.body.content !== undefined) announcement.content = req.body.content;
    if (req.body.priority) announcement.priority = req.body.priority;
    if (req.body.week !== undefined) announcement.week = req.body.week;

    await announcement.save();
    res.status(200).json({ success: true, message: 'Announcement updated', data: announcement });
  } catch (error) { next(error); }
};

/**
 * @desc    Delete announcement (soft)
 * @route   DELETE /api/announcements/:id
 */
const deleteAnnouncement = async (req, res, next) => {
  try {
    const announcement = await ClassAnnouncement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });

    announcement.isActive = false;
    await announcement.save();
    res.status(200).json({ success: true, message: 'Announcement deleted' });
  } catch (error) { next(error); }
};

module.exports = {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement
};
