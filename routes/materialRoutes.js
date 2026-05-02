const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');
const {
  getMaterials, getMaterialById, createMaterial, updateMaterial, deleteMaterial
} = require('../controllers/materialController');

const idVal = [param('id').isMongoId().withMessage('Invalid material ID')];

const createVal = [
  body('classId').isMongoId().withMessage('Invalid class ID'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('type').optional().isIn(['NOTE', 'SLIDE', 'VIDEO', 'LINK', 'DOCUMENT', 'RECORDING', 'OTHER'])
];

router.use(protect);

router.get('/', getMaterials);
router.get('/:id', idVal, validateRequest, getMaterialById);
router.post('/', authorize('ADMIN', 'TEACHER'), upload.single('file'), createVal, validateRequest, createMaterial);
router.put('/:id', authorize('ADMIN', 'TEACHER'), upload.single('file'), idVal, validateRequest, updateMaterial);
router.delete('/:id', authorize('ADMIN', 'TEACHER'), idVal, validateRequest, deleteMaterial);

module.exports = router;
