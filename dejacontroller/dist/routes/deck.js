"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeckRouter = createDeckRouter;
const express_1 = require("express");
const DeckController_1 = require("../controllers/DeckController");
function createDeckRouter(streamManager) {
    const router = (0, express_1.Router)();
    const deckController = new DeckController_1.DeckController(streamManager);
    router.post("/:deckId/load", deckController.loadVideo);
    router.post("/:deckId/play", deckController.play);
    router.post("/:deckId/stop", deckController.stop);
    router.get("/:deckId/status", deckController.getDeckStatus);
    return router;
}
