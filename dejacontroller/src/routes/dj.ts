import {
  Router,
  Request,
  Response,
  RequestHandler,
  NextFunction,
} from "express";
import { DJController } from "../controllers/DJController";
import { StreamManager } from "../services/StreamManager";

export function createDJRouter(streamManager: StreamManager): Router {
  const router = Router();
  const djController = new DJController(streamManager);

  // Helper function to wrap async handlers
  const asyncHandler =
    (fn: (req: Request, res: Response) => Promise<any>): RequestHandler =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        await fn(req, res);
      } catch (error) {
        next(error);
      }
    };

  router.post("/", asyncHandler(djController.createDJ));
  router.get("/", asyncHandler(djController.getAllDJs));
  router.get("/:id", asyncHandler(djController.getDJ));
  router.patch("/:id/status", asyncHandler(djController.updateDJStatus));
  router.delete("/:id", asyncHandler(djController.deleteDJ));

  return router;
}
