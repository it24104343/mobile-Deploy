const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const { protect, authorize } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  getPayments,
  getStudentPayments,
  getClassPaymentSummary,
  recordPayment,
  processGatewayPayment,
  refundPayment,
  submitBankTransfer,
  approveBankTransfer,
  processTeacherGatewayPayment,
  submitTeacherBankTransfer,
  updatePayment,
  deletePayment,
  recordTeacherSalary,
  getTeacherSalarySummary
} = require('../controllers/paymentController');

// Multer config for receipt uploads
const receiptStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'receipts');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `receipt-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const uploadReceipt = multer({
  storage: receiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  }
});

const recordPaymentValidation = [
  body('enrollmentId')
    .isMongoId()
    .withMessage('Invalid enrollment ID'),
  body('month')
    .isInt({ min: 1, max: 12 })
    .withMessage('Month must be between 1 and 12'),
  body('year')
    .isInt({ min: 2020 })
    .withMessage('Year must be 2020 or later'),
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount must be non-negative'),
  body('paymentMethod')
    .optional()
    .isIn(['CASH', 'BANK_TRANSFER', 'MANUAL'])
    .withMessage('Payment method must be CASH, BANK_TRANSFER, or MANUAL'),
  body('notes')
    .optional()
    .trim()
];

const gatewayPaymentValidation = [
  body('enrollmentId')
    .isMongoId()
    .withMessage('Invalid enrollment ID'),
  body('month')
    .isInt({ min: 1, max: 12 })
    .withMessage('Month must be between 1 and 12'),
  body('year')
    .isInt({ min: 2020 })
    .withMessage('Year must be 2020 or later'),
  body('cardNumber')
    .optional()
    .trim()
    .isLength({ min: 4 })
    .withMessage('Card number must be at least 4 characters')
];

const bankTransferValidation = [
  body('enrollmentId')
    .isMongoId()
    .withMessage('Invalid enrollment ID'),
  body('month')
    .isInt({ min: 1, max: 12 })
    .withMessage('Month must be between 1 and 12'),
  body('year')
    .isInt({ min: 2020 })
    .withMessage('Year must be 2020 or later')
];

const idValidation = [
  param('id').isMongoId().withMessage('Invalid payment ID')
];

const studentIdValidation = [
  param('studentId').isMongoId().withMessage('Invalid student ID')
];

const classIdValidation = [
  param('classId').isMongoId().withMessage('Invalid class ID')
];

router.use(protect);

router.get('/', authorize('ADMIN', 'TEACHER'), getPayments);
router.get('/student/:studentId', studentIdValidation, validateRequest, getStudentPayments);
router.get('/class/:classId/summary', authorize('ADMIN', 'TEACHER'), classIdValidation, validateRequest, getClassPaymentSummary);
router.get('/teacher-salary/summary', authorize('ADMIN'), getTeacherSalarySummary);

router.post('/', authorize('ADMIN'), uploadReceipt.single('receipt'), recordPaymentValidation, validateRequest, recordPayment);
router.post('/gateway', authorize('STUDENT'), gatewayPaymentValidation, validateRequest, processGatewayPayment);
router.post('/bank-transfer', authorize('STUDENT'), uploadReceipt.single('receipt'), bankTransferValidation, validateRequest, submitBankTransfer);
router.post('/teacher-salary', authorize('ADMIN'), uploadReceipt.single('receipt'), recordTeacherSalary);

router.post('/teacher/gateway', authorize('TEACHER'), processTeacherGatewayPayment);
router.post('/teacher/bank-transfer', authorize('TEACHER'), uploadReceipt.single('receipt'), submitTeacherBankTransfer);

router.put('/:id', authorize('ADMIN'), idValidation, validateRequest, updatePayment);
router.delete('/:id', authorize('ADMIN'), idValidation, validateRequest, deletePayment);
router.put('/:id/refund', authorize('ADMIN'), idValidation, validateRequest, refundPayment);
router.put('/:id/approve-transfer', authorize('ADMIN'), idValidation, validateRequest, approveBankTransfer);

module.exports = router;
