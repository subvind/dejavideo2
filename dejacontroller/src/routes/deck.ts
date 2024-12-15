import {
  Router,
  Request,
  Response,
  RequestHandler,
  NextFunction,
} from "express";
import { DeckController } from "../controllers/DeckController";
import { StreamManager } from "../services/StreamManager";

export function createDeckRouter(streamManager: StreamManager): Router {
  const router = Router();
  const deckController = new DeckController(streamManager);

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

  router.post("/:deckId/load", asyncHandler(deckController.loadVideo));
  router.post("/:deckId/play", asyncHandler(deckController.play));
  router.post("/:deckId/stop", asyncHandler(deckController.stop));
  router.get("/:deckId/status", asyncHandler(deckController.getDeckStatus));

  return router;
}
