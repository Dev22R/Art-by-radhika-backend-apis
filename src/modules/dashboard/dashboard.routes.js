const express = require('express');
const dashboardController = require('./dashboard.controller');
const { protect, authorize } = require('../user/user.middleware');

const router = express.Router();

/**
 * All Dashboard endpoints are protected and restricted to Admin
 */

// 1. Overall Dashboard Counts & Statistics
// GET /api/dashboard/stats or GET /api/admin/dashboard/stats
router.get(
  ['/stats', '/admin/stats'],
  protect,
  authorize('admin'),
  dashboardController.getDashboardStats
);

// 2. Dashboard Chart & Graph Datasets (Revenue Trends, Status Donut, Category Bar, User Growth, Weekday heatmap)
// GET /api/dashboard/charts or GET /api/admin/dashboard/charts?range=12months&year=2026
router.get(
  ['/charts', '/admin/charts'],
  protect,
  authorize('admin'),
  dashboardController.getDashboardCharts
);

// 3. Combined Overview (Stats + Charts in single API call)
// GET /api/dashboard/overview or GET /api/admin/dashboard/overview
router.get(
  ['/overview', '/admin/overview', '/'],
  protect,
  authorize('admin'),
  dashboardController.getDashboardOverview
);

module.exports = router;
