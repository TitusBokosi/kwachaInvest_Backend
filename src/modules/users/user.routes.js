import { Router } from "express";
import * as userController from "./user.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import * as userValidation from "./user.validator.js";

const router = Router();



router.post(
  "/register",
  validate(userValidation.registerSchema),
  userController.register
);

// Self-service (authenticated user, any role)


router.use(authenticate);

router.get("/me", userController.getMe);
router.get("/me/profile", userController.getMyProfile);

router.patch(
  "/me",
  validate(userValidation.updateMeSchema),
  userController.updateMe
);

router.post(
  "/me/change-password",
  validate(userValidation.changePasswordSchema),
  userController.changeMyPassword
);

router.delete("/me", userController.deactivateMe);


// Admin-only


router.use(authorize("ADMIN"));

router.get(
  "/search",
  validate(userValidation.searchUsersSchema),
  userController.searchUsers
);

router.get(
  "/",
  validate(userValidation.listUsersSchema),
  userController.listUsers
);

router.get(
  "/:id",
  validate(userValidation.userIdParamSchema),
  userController.getUserById
);

router.patch(
  "/:id/deactivate",
  validate(userValidation.userIdParamSchema),
  userController.deactivateUserById
);

router.patch(
  "/:id/reactivate",
  validate(userValidation.userIdParamSchema),
  userController.reactivateUserById
);
router.patch(
  "/:id/role",
  validate(userValidation.updateUserRoleSchema),
  userController.updateUserRole
);

export default router;