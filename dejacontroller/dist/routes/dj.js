"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDJRouter = createDJRouter;
const express_1 = require("express");
const DJController_1 = require("../controllers/DJController");
function createDJRouter(streamManager) {
    const router = (0, express_1.Router)();
    const djController = new DJController_1.DJController(streamManager);
    router.post("/", djController.createDJ);
    router.get("/", djController.getAllDJs);
    router.get("/:id", djController.getDJ);
    router.patch("/:id/status", djController.updateDJStatus);
    router.delete("/:id", djController.deleteDJ);
    return router;
}
