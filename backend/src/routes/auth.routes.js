import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

router.post('/login', authController.login);
router.get('/me', requireAuth, authController.me);
router.put('/password', requireAuth, authController.cambiarPassword);
