const express = require('express');
const {
  signup,
  login,
  adminLogin,
  changePassword,
  completeProfile,
  updateProfile,
  getProfile,
  refreshTokenHandler,
  logout,
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = require('./user.controller');
const {
  protect,
  authorize,
  validateSignup,
  validateLogin,
  validateAdminLogin,
  validateChangePassword,
  validateCompleteProfile,
  validateAddress,
} = require('./user.middleware');

const router = express.Router();

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

/**
 * @route   POST /api/auth/signup (also available on /api/auth/register)
 * @desc    Sign up with mobile number & password
 * @access  Public
 */
router.post('/signup', validateSignup, signup);
router.post('/register', validateSignup, signup);

/**
 * @route   POST /api/auth/login
 * @desc    Log in with mobile number & password
 * @access  Public
 */
router.post('/login', validateLogin, login);

/**
 * @route   POST /api/auth/admin/login
 * @desc    Admin Log in with email or phone & password
 * @access  Public
 */
router.post('/admin/login', validateAdminLogin, adminLogin);

/**
 * @route   PUT /api/auth/admin/change-password
 * @desc    Admin Change Password (single newPassword field)
 * @access  Private (Admin)
 */
router.put(
  '/admin/change-password',
  protect,
  authorize('admin'),
  validateChangePassword,
  changePassword
);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change Password for current authenticated user
 * @access  Private
 */
router.put('/change-password', protect, validateChangePassword, changePassword);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Generate a new access token using refresh token
 * @access  Public
 */
router.post('/refresh-token', refreshTokenHandler);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user, blacklist JWT in Redis, clear cache
 * @access  Private
 */
router.post('/logout', protect, logout);

// ==========================================
// PROFILE MANAGEMENT ROUTES
// ==========================================

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile (with Redis caching)
 * @access  Private
 */
router.get('/me', protect, getProfile);

const { upload, handleMulterError } = require('../../middlewares/upload.middleware');

const profileImageUpload = (req, res, next) => {
  upload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'avatar', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    if (req.files) {
      if (req.files.profileImage && req.files.profileImage[0]) {
        req.file = req.files.profileImage[0];
      } else if (req.files.image && req.files.image[0]) {
        req.file = req.files.image[0];
      } else if (req.files.avatar && req.files.avatar[0]) {
        req.file = req.files.avatar[0];
      } else if (req.files.file && req.files.file[0]) {
        req.file = req.files.file[0];
      }
    }
    next();
  });
};

/**
 * @route   POST /api/auth/complete-profile
 * @desc    Separate API to complete profile (Name, Email, Profile Image file/URL)
 * @access  Private
 */
router.post('/complete-profile', protect, profileImageUpload, validateCompleteProfile, completeProfile);
router.put('/complete-profile', protect, profileImageUpload, validateCompleteProfile, completeProfile);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update profile details (Name, Email, Profile Image file/URL)
 * @access  Private
 */
router.put('/profile', protect, profileImageUpload, updateProfile);
router.patch('/profile', protect, profileImageUpload, updateProfile);

// ==========================================
// USER ADDRESS ROUTES (Mehndi Booking)
// ==========================================

/**
 * @route   POST /api/auth/addresses
 * @desc    Add a new address
 * @access  Private
 */
router.post('/addresses', protect, validateAddress, addAddress);

/**
 * @route   GET /api/auth/addresses
 * @desc    Get all addresses for logged in user (cached in Redis)
 * @access  Private
 */
router.get('/addresses', protect, getAddresses);

/**
 * @route   PUT /api/auth/addresses/:addressId
 * @desc    Update an address
 * @access  Private
 */
router.put('/addresses/:addressId', protect, updateAddress);

/**
 * @route   DELETE /api/auth/addresses/:addressId
 * @desc    Delete (soft-delete) an address
 * @access  Private
 */
router.delete('/addresses/:addressId', protect, deleteAddress);

/**
 * @route   PATCH /api/auth/addresses/:addressId/default
 * @desc    Set address as default
 * @access  Private
 */
router.patch('/addresses/:addressId/default', protect, setDefaultAddress);

module.exports = router;
