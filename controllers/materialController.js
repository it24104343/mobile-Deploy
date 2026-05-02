const Material = require('../models/Material');
const Class = require('../models/Class');
const path = require('path');
const fs = require('fs');

/**
 * @desc    Get materials for a class
 * @route   GET /api/materials
 */
const getMaterials = async (req, res, next) => {
  try {
    const { classId, type, page = 1, limit = 20 } = req.query;
    const filter = { isActive: true };
    if (classId) filter.class = classId;
    if (type) filter.type = type;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const [materials, total] = await Promise.all([
      Material.find(filter)
        .populate('class', 'className subject grade')
        .populate('uploadedBy', 'username')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Material.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: materials,
      pagination: { currentPage: pageNum, totalPages: Math.ceil(total / limitNum), totalItems: total }
    });
  } catch (error) { next(error); }
};

/**
 * @desc    Get material by ID
 * @route   GET /api/materials/:id
 */
const getMaterialById = async (req, res, next) => {
  try {
    const material = await Material.findById(req.params.id)
      .populate('class', 'className subject grade')
      .populate('uploadedBy', 'username');
    if (!material) return res.status(404).json({ success: false, message: 'Material not found' });
    res.status(200).json({ success: true, data: material });
  } catch (error) { next(error); }
};

/**
 * @desc    Create material (with optional file upload)
 * @route   POST /api/materials
 */
const createMaterial = async (req, res, next) => {
  try {
    const { classId, title, description, type, externalLink, week, month, year } = req.body;

    const classDoc = await Class.findById(classId);
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found' });

    const materialData = {
      class: classId,
      title, description: description || '', type: type || 'DOCUMENT',
      externalLink: externalLink || '',
      week: week || null, month: month || null, year: year || null,
      uploadedBy: req.user?._id || null
    };

    // Handle file upload
    if (req.file) {
      materialData.fileUrl = `/uploads/materials/${req.file.filename}`;
      materialData.fileName = req.file.originalname;
    }

    const material = await Material.create(materialData);

    res.status(201).json({ success: true, message: 'Material uploaded', data: material });
  } catch (error) { next(error); }
};

/**
 * @desc    Update material
 * @route   PUT /api/materials/:id
 */
const updateMaterial = async (req, res, next) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ success: false, message: 'Material not found' });

    const fields = ['title', 'description', 'type', 'externalLink', 'week', 'month', 'year'];
    fields.forEach(f => { if (req.body[f] !== undefined) material[f] = req.body[f]; });

    if (req.file) {
      material.fileUrl = `/uploads/materials/${req.file.filename}`;
      material.fileName = req.file.originalname;
    }

    await material.save();
    res.status(200).json({ success: true, message: 'Material updated', data: material });
  } catch (error) { next(error); }
};

/**
 * @desc    Delete material (soft)
 * @route   DELETE /api/materials/:id
 */
const deleteMaterial = async (req, res, next) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ success: false, message: 'Material not found' });

    material.isActive = false;
    await material.save();
    res.status(200).json({ success: true, message: 'Material deleted' });
  } catch (error) { next(error); }
};

module.exports = {
  getMaterials,
  getMaterialById,
  createMaterial,
  updateMaterial,
  deleteMaterial
};
