const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getServiceRequests, createServiceRequest, updateServiceRequest, getServiceRequestById, deleteServiceRequest
} = require('../controllers/serviceRequestController');

router.use(protect);

router.get('/', getServiceRequests);
router.get('/:id', [param('id').isMongoId()], validateRequest, getServiceRequestById);
router.post('/',
  [body('type').isIn(['CERTIFICATE', 'ID_CARD_REISSUE', 'SCHEDULE_CHANGE', 'FEE_INQUIRY', 'COMPLAINT', 'LEAVE', 'OTHER']),
   body('subject').trim().notEmpty(), body('description').trim().notEmpty()],
  validateRequest, createServiceRequest);
router.put('/:id', authorize('ADMIN', 'TEACHER'),
  [param('id').isMongoId()], validateRequest, updateServiceRequest);
router.delete('/:id', [param('id').isMongoId()], validateRequest, deleteServiceRequest);

module.exports = router;
