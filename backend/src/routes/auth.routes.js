import { Router } from 'express'

import * as authController from '../controllers/auth.controller.js'
import { requireAuth } from '../middleware/auth.js'
import {
  loginRateLimiter,
  passwordRateLimiter,
} from '../middleware/rate-limit.js'

export const router = Router()

router.post('/login', loginRateLimiter, authController.login)
router.get('/me', requireAuth, authController.me)
router.put(
  '/password',
  requireAuth,
  passwordRateLimiter,
  authController.cambiarPassword
)
router.post('/logout', requireAuth, authController.logout)
