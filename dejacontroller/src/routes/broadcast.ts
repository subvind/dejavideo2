import {
  Router,
  Request,
  Response,
  RequestHandler,
  NextFunction,
} from "express";
import { BroadcastController } from "../controllers/BroadcastController";
import { StreamManager } from "../services/StreamManager";
import { RTMPService } from "../services/RTMPService";

export function createBroadcastRouter(
  streamManager: StreamManager,
  rtmpService: RTMPService,
): Router {
  const router = Router();
  const broadcastController = new BroadcastController(
    streamManager,
    rtmpService,
  );

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

  router.post(
    "/dj/:djId/start",
    asyncHandler(broadcastController.startBroadcast),
  );
  router.post(
    "/:broadcastId/crossfader",
    asyncHandler(broadcastController.updateCrossfader),
  );
  router.post(
    "/:broadcastId/stop",
    asyncHandler(broadcastController.stopBroadcast),
  );
  router.get(
    "/:broadcastId/status",
    asyncHandler(broadcastController.getBroadcastStatus),
  );

  return router;
}
