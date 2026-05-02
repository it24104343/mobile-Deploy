const InstituteSettings = require('../models/InstituteSettings');

/**
 * @desc    Get institute settings (create default if none exists)
 * @route   GET /api/settings
 * @access  Private
 */
const getSettings = async (req, res, next) => {
  try {
    let settings = await InstituteSettings.findOne()
      .populate('revenueConfigs.class', 'className subject monthlyFee');

    if (!settings) {
      settings = await InstituteSettings.create({});
    }

    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update institute settings
 * @route   PUT /api/settings
 * @access  Private (Admin)
 */
const updateSettings = async (req, res, next) => {
  try {
    const {
      admissionFee,
      attendanceThresholdPercent,
      allowTeacherThresholdOverride,
      instituteName,
      contactEmail,
      contactPhone,
      address
    } = req.body;

    let settings = await InstituteSettings.findOne();

    if (!settings) {
      settings = new InstituteSettings();
    }

    if (admissionFee !== undefined) settings.admissionFee = admissionFee;
    if (attendanceThresholdPercent !== undefined) settings.attendanceThresholdPercent = attendanceThresholdPercent;
    if (allowTeacherThresholdOverride !== undefined) settings.allowTeacherThresholdOverride = allowTeacherThresholdOverride;
    if (instituteName !== undefined) settings.instituteName = instituteName;
    if (contactEmail !== undefined) settings.contactEmail = contactEmail;
    if (contactPhone !== undefined) settings.contactPhone = contactPhone;
    if (address !== undefined) settings.address = address;

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: settings
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update revenue config for a class
 * @route   PUT /api/settings/revenue-config
 * @access  Private (Admin)
 */
const updateRevenueConfig = async (req, res, next) => {
  try {
    const { classId, instituteRetainedAmount, notes } = req.body;

    let settings = await InstituteSettings.findOne();
    if (!settings) {
      settings = new InstituteSettings();
    }

    const existingIdx = settings.revenueConfigs.findIndex(
      (rc) => rc.class.toString() === classId
    );

    if (existingIdx >= 0) {
      settings.revenueConfigs[existingIdx].instituteRetainedAmount = instituteRetainedAmount;
      if (notes !== undefined) settings.revenueConfigs[existingIdx].notes = notes;
    } else {
      settings.revenueConfigs.push({
        class: classId,
        instituteRetainedAmount,
        notes: notes || ''
      });
    }

    await settings.save();

    const populated = await InstituteSettings.findById(settings._id)
      .populate('revenueConfigs.class', 'className subject monthlyFee');

    res.status(200).json({
      success: true,
      message: 'Revenue config updated',
      data: populated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete revenue config for a class
 * @route   DELETE /api/settings/revenue-config/:classId
 * @access  Private (Admin)
 */
const deleteRevenueConfig = async (req, res, next) => {
  try {
    const settings = await InstituteSettings.findOne();
    if (!settings) {
      return res.status(404).json({ success: false, message: 'Settings not found' });
    }

    settings.revenueConfigs = settings.revenueConfigs.filter(
      (rc) => rc.class.toString() !== req.params.classId
    );

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Revenue config removed'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
  updateRevenueConfig,
  deleteRevenueConfig
};
