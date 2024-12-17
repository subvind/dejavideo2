import {
  Router,
  Request,
  Response,
  RequestHandler,
  NextFunction,
} from "express";
import { VideoController } from "../controllers/VideoController";

export function createVideoRouter(): Router {
  const router = Router();
  const videoController = new VideoController();

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

  router.get("/", asyncHandler(videoController.getAllVideos));
  router.post("/youtube", asyncHandler(videoController.importFromYoutube));
  router.get("/youtube/info", asyncHandler(videoController.getVideoInfo));

  return router;
}
