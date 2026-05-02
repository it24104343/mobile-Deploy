const ServiceRequest = require('../models/ServiceRequest');

/**
 * @desc    Get service requests
 * @route   GET /api/service-requests
 */
const getServiceRequests = async (req, res, next) => {
  try {
    const { status, type, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    const role = req.user.role;

    // 1. Role-based Visibility logic
    if (role === 'STUDENT') {
      filter.student = req.user._id;
    } else if (role === 'TEACHER') {
      const Class = require('../models/Class');
      const mongoose = require('mongoose');
      
      let classIds = [];
      if (mongoose.Types.ObjectId.isValid(req.user.profileId)) {
        const teacherClasses = await Class.find({ teacher: req.user.profileId }).select('_id');
        classIds = teacherClasses.map(c => c._id);
      }

      filter.$or = [
        { student: req.user._id },
        { recipient: 'TEACHER', targetTeacher: req.user.profileId },
        { recipient: 'TEACHER', class: { $in: classIds } },
        { recipient: 'TEACHER', targetTeacher: null, class: null } // General teacher requests
      ];
    } else if (role === 'ADMIN') {
      filter.$or = [
        { student: req.user._id },
        { recipient: 'ADMIN' }
      ];
    }

    // 2. Status and Type Filters
    if (status && status !== 'ALL') filter.status = status;
    if (type) filter.type = type;

    // 3. Search logic
    if (search) {
      const searchConditions = [
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
      if (search.match(/^[0-9a-fA-F]{24}$/)) {
        searchConditions.push({ _id: search });
      }

      if (filter.$or) {
        const existingOr = filter.$or;
        delete filter.$or;
        Object.assign(filter, {
          $and: [
            { $or: existingOr },
            { $or: searchConditions }
          ]
        });
      } else {
        filter.$or = searchConditions;
      }
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const [requests, total] = await Promise.all([
      ServiceRequest.find(filter)
        .populate('student', 'username fullName email')
        .populate('resolvedBy', 'username')
        .populate('class', 'className subject')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      ServiceRequest.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: requests,
      pagination: { currentPage: pageNum, totalPages: Math.ceil(total / limitNum), totalItems: total }
    });
  } catch (error) { next(error); }
};

/**
 * @desc    Create service request (student)
 * @route   POST /api/service-requests
 */
const createServiceRequest = async (req, res, next) => {
  try {
    const { type, subject, description, priority, requestDate, recipient, class: classId, targetTeacher } = req.body;

    const request = await ServiceRequest.create({
      student: req.user._id,
      type, subject, description,
      priority: priority || 'NORMAL',
      recipient: recipient || 'ADMIN',
      class: classId || null,
      targetTeacher: targetTeacher || null,
      requestDate: requestDate ? new Date(requestDate) : null
    });

    res.status(201).json({ success: true, message: 'Request submitted', data: request });
  } catch (error) { next(error); }
};

/**
 * @desc    Update request status (admin)
 * @route   PUT /api/service-requests/:id
 */
const updateServiceRequest = async (req, res, next) => {
  try {
    const request = await ServiceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    const { status, adminNotes } = req.body;

    // Authorization
    const isAdmin = req.user.role === 'ADMIN';
    let isRecipient = false;
    if (req.user.role === 'TEACHER') {
      if (request.targetTeacher && request.targetTeacher.toString() === req.user.profileId?.toString()) {
        isRecipient = true;
      }
      if (request.recipient === 'TEACHER' && !request.targetTeacher && !request.class) {
        isRecipient = true;
      }
    }

    if (!isAdmin && !isRecipient) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (status) {
      request.status = status;
      if (status === 'RESOLVED' || status === 'REJECTED') {
        request.resolvedBy = req.user._id;
        request.resolvedAt = new Date();
      }
    }
    if (adminNotes !== undefined) request.adminNotes = adminNotes;

    await request.save();

    const populated = await ServiceRequest.findById(request._id)
      .populate('student', 'username email')
      .populate('resolvedBy', 'username');

    res.status(200).json({ success: true, message: 'Request updated', data: populated });
  } catch (error) { next(error); }
};

/**
 * @desc    Get request by ID
 * @route   GET /api/service-requests/:id
 */
const getServiceRequestById = async (req, res, next) => {
  try {
    const request = await ServiceRequest.findById(req.params.id)
      .populate('student', 'username email')
      .populate('resolvedBy', 'username')
      .populate('class', 'className subject');
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    // Authorization
    const isAdmin = req.user.role === 'ADMIN';
    const isOwner = request.student._id.toString() === req.user._id.toString();
    
    let isRecipient = false;
    if (req.user.role === 'TEACHER') {
      // Check if they are the target teacher
      if (request.targetTeacher && request.targetTeacher.toString() === req.user.profileId?.toString()) {
        isRecipient = true;
      }
      // Or if it's a general teacher request and they are a teacher
      if (request.recipient === 'TEACHER' && !request.targetTeacher && !request.class) {
        isRecipient = true;
      }
      // Note: Class-based check would require checking the Class model, but for now specific/general handles most cases
    }

    if (!isAdmin && !isOwner && !isRecipient) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.status(200).json({ success: true, data: request });
  } catch (error) { next(error); }
};

/**
 * @desc    Delete service request
 * @route   DELETE /api/service-requests/:id
 */
const deleteServiceRequest = async (req, res, next) => {
  try {
    const request = await ServiceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    // Admins can delete anything
    // Students/Teachers can only delete their own PENDING requests
    if (req.user.role !== 'ADMIN') {
      if (request.student.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to delete this request' });
      }
      if (request.status !== 'PENDING') {
        return res.status(400).json({ success: false, message: 'Cannot delete a request that is already processed' });
      }
    }

    await request.deleteOne();
    res.status(200).json({ success: true, message: 'Request deleted successfully' });
  } catch (error) { next(error); }
};

module.exports = {
  getServiceRequests,
  createServiceRequest,
  updateServiceRequest,
  getServiceRequestById,
  deleteServiceRequest
};
