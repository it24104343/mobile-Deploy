const Notification = require('../models/Notification');

/**
 * @desc    Get notifications for current user
 * @route   GET /api/notifications
 */
const getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const filter = {
      isActive: true,
      'deletedBy.user': { $ne: req.user._id },
      $or: [
        { targetRole: 'ALL' },
        { targetRole: req.user.role },
        { targetUsers: req.user._id }
      ]
    };

    let query = Notification.find(filter)
      .populate('createdBy', 'username')
      .populate('targetClass', 'className')
      .sort({ createdAt: -1 });

    if (unreadOnly === 'true') {
      filter['readBy.user'] = { $ne: req.user._id };
    }

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .populate('createdBy', 'username')
        .populate('targetClass', 'className')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Notification.countDocuments(filter)
    ]);

    // Add isRead field for current user
    const enriched = notifications.map(n => ({
      ...n,
      isRead: n.readBy?.some(r => r.user?.toString() === req.user._id.toString()) || false
    }));

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      ...filter,
      'readBy.user': { $ne: req.user._id }
    });

    res.status(200).json({
      success: true,
      data: enriched,
      unreadCount,
      pagination: { currentPage: pageNum, totalPages: Math.ceil(total / limitNum), totalItems: total }
    });
  } catch (error) { next(error); }
};

/**
 * @desc    Get single notification
 * @route   GET /api/notifications/:id
 */
const getNotificationById = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id)
      .populate('createdBy', 'username')
      .populate('targetClass', 'className');

    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });

    // Check if user has permission to see it
    const isTarget = 
      notification.targetRole === 'ALL' || 
      notification.targetRole === req.user.role || 
      notification.targetUsers.some(id => id.toString() === req.user._id.toString());

    if (!isTarget) return res.status(403).json({ success: false, message: 'Unauthorized access to notification' });

    // Check if deleted
    const isDeleted = notification.deletedBy.some(d => d.user?.toString() === req.user._id.toString());
    if (isDeleted) return res.status(404).json({ success: false, message: 'Notification not found' });

    res.status(200).json({ success: true, data: notification });
  } catch (error) { next(error); }
};

/**
 * @desc    Create notification (admin/teacher)
 * @route   POST /api/notifications
 */
const createNotification = async (req, res, next) => {
  try {
    const { title, content, type, category, targetRole, targetUsers, targetClass } = req.body;

    const notification = await Notification.create({
      title, content,
      type: type || 'MANUAL',
      category: category || 'INFO',
      targetRole: targetRole || 'ALL',
      targetUsers: targetUsers || [],
      targetClass: targetClass || null,
      createdBy: req.user._id
    });

    res.status(201).json({ success: true, message: 'Notification sent', data: notification });
  } catch (error) { next(error); }
};

/**
 * @desc    Mark notification as read
 * @route   PUT /api/notifications/:id/read
 */
const markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });

    const alreadyRead = notification.readBy.some(r => r.user?.toString() === req.user._id.toString());
    if (!alreadyRead) {
      notification.readBy.push({ user: req.user._id });
      await notification.save();
    }

    res.status(200).json({ success: true, message: 'Marked as read' });
  } catch (error) { next(error); }
};

/**
 * @desc    Mark all notifications as read
 * @route   PUT /api/notifications/read-all
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const filter = {
      isActive: true,
      'readBy.user': { $ne: req.user._id },
      'deletedBy.user': { $ne: req.user._id },
      $or: [
        { targetRole: 'ALL' },
        { targetRole: req.user.role },
        { targetUsers: req.user._id }
      ]
    };

    const unread = await Notification.find(filter);
    for (const n of unread) {
      n.readBy.push({ user: req.user._id });
      await n.save();
    }

    res.status(200).json({ success: true, message: `${unread.length} notifications marked as read` });
  } catch (error) { next(error); }
};

/**
 * @desc    Delete notification
 * @route   DELETE /api/notifications/:id
 */
const deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });

    const alreadyDeleted = notification.deletedBy.some(d => d.user?.toString() === req.user._id.toString());
    if (!alreadyDeleted) {
      notification.deletedBy.push({ user: req.user._id });
      await notification.save();
    }
    
    res.status(200).json({ success: true, message: 'Notification deleted for you' });
  } catch (error) { next(error); }
};

module.exports = {
  getNotifications,
  getNotificationById,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications: async (req, res, next) => {
    try {
      const filter = {
        isActive: true,
        'deletedBy.user': { $ne: req.user._id },
        $or: [
          { targetRole: 'ALL' },
          { targetRole: req.user.role },
          { targetUsers: req.user._id }
        ]
      };

      const notifications = await Notification.find(filter);
      for (const n of notifications) {
        n.deletedBy.push({ user: req.user._id });
        await n.save();
      }

      res.status(200).json({ success: true, message: 'All notifications cleared' });
    } catch (error) { next(error); }
  }
};
