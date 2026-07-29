import { Router } from "express";
import * as authController from "./auth.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import * as authValidation from "./auth.validator.js";

const router = Router();



router.post(
  "/login",
  validate(authValidation.loginSchema),
  authController.login
);

router.post(
  "/refresh",
  validate(authValidation.refreshSchema),
  authController.refresh
);

router.post(
  "/logout",
  validate(authValidation.logoutSchema),
  authController.logout
);

router.post(
  "/forgot-password",
  validate(authValidation.forgotPasswordSchema),
  authController.forgotPassword
);

router.post(
  "/reset-password",
  validate(authValidation.resetPasswordSchema),
  authController.resetPassword
);



router.use(authenticate);

router.get("/sessions", authController.listSessions);
router.post("/logout-all", authController.logoutAllDevices);

export default router;