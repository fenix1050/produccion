/**
 * Vercel Speed Insights initialization
 * This file is loaded on all pages to track web vitals and performance metrics
 */
import { injectSpeedInsights } from '@vercel/speed-insights'

// Initialize Speed Insights
// Debug mode is automatically enabled in development (NODE_ENV === 'development')
injectSpeedInsights()
