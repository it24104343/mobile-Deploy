const Hall = require('../models/Hall');
const Class = require('../models/Class');

/**
 * @desc    Get all halls with pagination and filters
 * @route   GET /api/halls
 * @access  Private
 */
const getHalls = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      includeInactive = false
    } = req.query;

    const filter = {};

    if (!includeInactive || includeInactive === 'false') {
      filter.isActive = true;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [halls, total] = await Promise.all([
      Hall.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Hall.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: halls,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single hall by ID
 * @route   GET /api/halls/:id
 * @access  Private
 */
const getHallById = async (req, res, next) => {
  try {
    const hall = await Hall.findById(req.params.id);

    if (!hall) {
      return res.status(404).json({
        success: false,
        message: 'Hall not found'
      });
    }

    // Also get classes scheduled in this hall
    const classesInHall = await Class.find({ hall: hall._id, isActive: true })
      .populate('teacher', 'name email')
      .select('className subject dayOfWeek startTime endTime classType')
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: {
        ...hall.toObject(),
        scheduledClasses: classesInHall
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create hall
 * @route   POST /api/halls
 * @access  Private/Admin
 */
const createHall = async (req, res, next) => {
  try {
    const { name, code, capacity, pricePerHour } = req.body;

    // Check if code already exists
    const existingHall = await Hall.findOne({ code: code.toUpperCase() });
    if (existingHall) {
      return res.status(400).json({
        success: false,
        message: 'A hall with this code already exists'
      });
    }

    const hall = await Hall.create({
      name,
      code: code.toUpperCase(),
      capacity,
      pricePerHour: pricePerHour || 0
    });

    res.status(201).json({
      success: true,
      message: 'Hall created successfully',
      data: hall
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update hall
 * @route   PUT /api/halls/:id
 * @access  Private/Admin
 */
const updateHall = async (req, res, next) => {
  try {
    const hall = await Hall.findById(req.params.id);

    if (!hall) {
      return res.status(404).json({
        success: false,
        message: 'Hall not found'
      });
    }

    const { name, code, capacity, pricePerHour, isActive } = req.body;

    // Check if new code already exists
    if (code && code.toUpperCase() !== hall.code) {
      const existingHall = await Hall.findOne({ code: code.toUpperCase() });
      if (existingHall) {
        return res.status(400).json({
          success: false,
          message: 'A hall with this code already exists'
        });
      }
    }

    if (name) hall.name = name;
    if (code) hall.code = code.toUpperCase();
    if (capacity) hall.capacity = capacity;
    if (pricePerHour !== undefined) hall.pricePerHour = pricePerHour;
    if (isActive !== undefined) hall.isActive = isActive;

    await hall.save();

    res.status(200).json({
      success: true,
      message: 'Hall updated successfully',
      data: hall
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete hall (soft delete)
 * @route   DELETE /api/halls/:id
 * @access  Private/Admin
 */
const deleteHall = async (req, res, next) => {
  try {
    const hall = await Hall.findById(req.params.id);

    if (!hall) {
      return res.status(404).json({
        success: false,
        message: 'Hall not found'
      });
    }

    // Check if any active classes use this hall
    const classesUsingHall = await Class.countDocuments({ hall: hall._id, isActive: true });
    if (classesUsingHall > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot deactivate hall. ${classesUsingHall} active class(es) are scheduled in this hall.`
      });
    }

    hall.isActive = false;
    await hall.save();

    res.status(200).json({
      success: true,
      message: 'Hall deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check hall availability for a given time slot
 * @route   POST /api/halls/check-availability
 * @access  Private
 */
const checkHallAvailability = async (req, res, next) => {
  try {
    const { hallId, dayOfWeek, startTime, endTime, excludeClassId } = req.body;

    if (!hallId || !dayOfWeek || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Please provide hallId, dayOfWeek, startTime, and endTime'
      });
    }

    const conflict = await Class.checkHallConflict(
      hallId,
      dayOfWeek,
      startTime,
      endTime,
      excludeClassId
    );

    res.status(200).json({
      success: true,
      available: !conflict,
      conflictingClass: conflict || null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get hall schedule (all classes in a hall grouped by day)
 * @route   GET /api/halls/:id/schedule
 * @access  Private
 */
const getHallSchedule = async (req, res, next) => {
  try {
    const hall = await Hall.findById(req.params.id);

    if (!hall) {
      return res.status(404).json({
        success: false,
        message: 'Hall not found'
      });
    }

    const classes = await Class.find({ hall: hall._id, isActive: true })
      .populate('teacher', 'name')
      .sort({ startTime: 1 })
      .lean();

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const schedule = {};

    days.forEach((day) => {
      schedule[day] = classes
        .filter((cls) => cls.dayOfWeek === day)
        .map((cls) => ({
          _id: cls._id,
          className: cls.className,
          subject: cls.subject,
          classType: cls.classType,
          teacher: cls.teacher?.name || 'Unassigned',
          startTime: cls.startTime,
          endTime: cls.endTime,
          enrolledCount: cls.students?.length || 0
        }));
    });

    res.status(200).json({
      success: true,
      data: {
        hall: { _id: hall._id, name: hall.name, code: hall.code, capacity: hall.capacity },
        schedule
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get weekly availability for all halls
 * @route   GET /api/halls/weekly-availability
 * @access  Private
 */
const getWeeklyAvailability = async (req, res, next) => {
  try {
    const [halls, classes] = await Promise.all([
      Hall.find({ isActive: true }).select('name code capacity').sort({ name: 1 }).lean(),
      Class.find({ isActive: true, mode: 'PHYSICAL', hall: { $ne: null } })
        .populate('hall', 'name')
        .populate('teacher', 'name')
        .select('className subject dayOfWeek startTime endTime hall teacher')
        .sort({ startTime: 1 })
        .lean()
    ]);

    res.status(200).json({
      success: true,
      data: { halls, classes }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getHalls,
  getHallById,
  createHall,
  updateHall,
  deleteHall,
  checkHallAvailability,
  getHallSchedule,
  getWeeklyAvailability
};
