/**
 * Vercel Speed Insights initialization
 * This file is loaded on all pages to track web vitals and performance metrics
 */
import { injectSpeedInsights } from 'https://cdn.jsdelivr.net/npm/@vercel/speed-insights@2/+esm'

// Initialize Speed Insights
// Debug mode is automatically enabled in development (NODE_ENV === 'development')
injectSpeedInsights()
