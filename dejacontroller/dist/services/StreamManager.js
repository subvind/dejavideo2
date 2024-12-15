"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamManager = void 0;
const OBSService_1 = require("./OBSService");
const RTMPService_1 = require("./RTMPService");
const data_source_1 = require("../data-source");
const DJ_1 = require("../entities/DJ");
const Deck_1 = require("../entities/Deck");
class StreamManager {
    constructor() {
        this.obsInstances = new Map();
        this.usedPorts = new Set();
        this.basePort = 4444;
        this.rtmpService = new RTMPService_1.RTMPService();
    }
    async initialize() {
        await this.rtmpService.start();
        // Reinitialize streams for active DJs
        const djRepository = data_source_1.AppDataSource.getRepository(DJ_1.DJ);
        const activeDJs = await djRepository.find({
            where: { status: "active" },
            relations: ["decks"],
        });
        for (const dj of activeDJs) {
            await this.initializeDJStreams(dj.id);
        }
    }
    async allocatePort() {
        let port = this.basePort;
        while (this.usedPorts.has(port)) {
            port++;
        }
        this.usedPorts.add(port);
        return port;
    }
    async initializeDJStreams(djId) {
        const deckRepository = data_source_1.AppDataSource.getRepository(Deck_1.Deck);
        const decks = await deckRepository.find({
            where: { dj: { id: djId } },
            relations: ["dj"],
        });
        for (const deck of decks) {
            const obsInstance = new OBSService_1.OBSService(deck);
            try {
                await obsInstance.connect();
                this.obsInstances.set(`${djId}_${deck.type}`, obsInstance);
                // Setup event handlers
                obsInstance.on("error", (error) => {
                    console.error(`OBS Error for DJ ${djId} Deck ${deck.type}:`, error);
                });
                obsInstance.on("disconnected", async () => {
                    console.log(`OBS Disconnected for DJ ${djId} Deck ${deck.type}`);
                    // Update deck status in database
                    deck.status = "stopped";
                    await deckRepository.save(deck);
                });
            }
            catch (error) {
                console.error(`Failed to initialize stream for DJ ${djId} Deck ${deck.type}:`, error);
            }
        }
    }
    async cleanupDJStreams(djId) {
        // Cleanup OBS instances
        for (const type of ["A", "B"]) {
            const key = `${djId}_${type}`;
            const obs = this.obsInstances.get(key);
            if (obs) {
                await obs.cleanup();
                this.obsInstances.delete(key);
            }
        }
        // Cleanup RTMP streams
        await this.rtmpService.cleanupDJStreams(djId);
    }
    getOBSInstance(djId, deckType) {
        return this.obsInstances.get(`${djId}_${deckType}`);
    }
    async cleanup() {
        // Cleanup all streams
        for (const [key, obs] of this.obsInstances) {
            await obs.cleanup();
        }
        this.obsInstances.clear();
        // Stop RTMP server
        await this.rtmpService.stop();
    }
}
exports.StreamManager = StreamManager;
