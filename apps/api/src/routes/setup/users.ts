import { Router } from 'express';
import { userRoutes } from '../users';

// Setup owns the user-management API while the legacy /api/users route remains supported.
const setupUsersRouter = Router();
setupUsersRouter.use('/', userRoutes);

export default setupUsersRouter;
