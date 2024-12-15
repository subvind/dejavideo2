"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RTMPService = void 0;
const node_media_server_1 = __importDefault(require("node-media-server"));
const events_1 = require("events");
const data_source_1 = require("../data-source");
const Deck_1 = require("../entities/Deck");
class RTMPService extends events_1.EventEmitter {
    constructor() {
        super();
        this.activeStreams = new Map(); // streamPath -> djId
        this.nms = new node_media_server_1.default({
            rtmp: {
                port: 1935,
                chunk_size: 60000,
                gop_cache: true,
                ping: 30,
                ping_timeout: 60,
            },
            http: {
                port: 8000,
                allow_origin: "*",
                mediaroot: "./media",
            },
        });
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        this.nms.on("prePublish", async (id, StreamPath, args) => {
            console.log("[RTMP] Stream starting:", StreamPath);
            try {
                const pathParts = StreamPath.split("/");
                const djId = pathParts[1];
                const deckType = pathParts[2];
                if (deckType === "A" || deckType === "B") {
                    const deck = await data_source_1.AppDataSource.getRepository(Deck_1.Deck).findOne({
                        where: {
                            dj: { id: djId },
                            type: deckType,
                        },
                        relations: ["dj"],
                    });
                    if (!deck) {
                        this.nms.reject();
                        return;
                    }
                    this.activeStreams.set(StreamPath, djId);
                    this.emit("streamStart", { djId, deckType });
                }
            }
            catch (error) {
                console.error("Error handling prePublish:", error);
                this.nms.reject();
            }
        });
        this.nms.on("donePublish", async (id, StreamPath, args) => {
            console.log("[RTMP] Stream ended:", StreamPath);
            const djId = this.activeStreams.get(StreamPath);
            if (djId) {
                const pathParts = StreamPath.split("/");
                const deckType = pathParts[2];
                this.activeStreams.delete(StreamPath);
                this.emit("streamEnd", { djId, deckType });
            }
        });
    }
    async start() {
        return new Promise((resolve) => {
            this.nms.run();
            this.nms.on("preConnect", () => {
                resolve();
            });
        });
    }
    async stop() {
        return new Promise((resolve) => {
            this.nms.stop();
            resolve();
        });
    }
    async cleanupDJStreams(djId) {
        for (const [streamPath, id] of this.activeStreams.entries()) {
            if (id === djId) {
                this.activeStreams.delete(streamPath);
                // Additional cleanup if needed
            }
        }
    }
    isStreamActive(djId, deckType) {
        const streamPath = `/live/${djId}/${deckType}`;
        return this.activeStreams.has(streamPath);
    }
}
exports.RTMPService = RTMPService;
