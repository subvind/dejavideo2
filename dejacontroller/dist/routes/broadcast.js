"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBroadcastRouter = createBroadcastRouter;
const express_1 = require("express");
const BroadcastController_1 = require("../controllers/BroadcastController");
function createBroadcastRouter(streamManager, rtmpService) {
    const router = (0, express_1.Router)();
    const broadcastController = new BroadcastController_1.BroadcastController(streamManager, rtmpService);
    router.post("/dj/:djId/start", broadcastController.startBroadcast);
    router.post("/:broadcastId/crossfader", broadcastController.updateCrossfader);
    router.post("/:broadcastId/stop", broadcastController.stopBroadcast);
    router.get("/:broadcastId/status", broadcastController.getBroadcastStatus);
    return router;
}
