"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OBSService = void 0;
const obs_websocket_js_1 = __importDefault(require("obs-websocket-js"));
const events_1 = require("events");
const Deck_1 = require("../entities/Deck");
const data_source_1 = require("../data-source");
class OBSService extends events_1.EventEmitter {
    constructor(deck) {
        super();
        this.connected = false;
        this.deck = deck;
        this.obs = new obs_websocket_js_1.default();
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        this.obs.on("error", (err) => {
            console.error(`OBS WebSocket Error (Deck ${this.deck.id}):`, err);
            this.emit("error", err);
        });
        this.obs.on("ConnectionClosed", () => {
            this.connected = false;
            this.emit("disconnected");
            this.attemptReconnect();
        });
    }
    async connect() {
        try {
            await this.obs.connect({
                address: `localhost:${this.deck.obsPort}`,
                password: process.env.OBS_PASSWORD,
            });
            this.connected = true;
            this.emit("connected");
        }
        catch (error) {
            console.error(`Failed to connect to OBS (Deck ${this.deck.id}):`, error);
            throw error;
        }
    }
    async loadVideo(video) {
        if (!this.connected)
            throw new Error("OBS not connected");
        const deckRepo = data_source_1.AppDataSource.getRepository(Deck_1.Deck);
        try {
            await this.obs.send("SetSourceSettings", {
                sourceName: `Deck${this.deck.type}Video`,
                sourceType: "ffmpeg_source",
                sourceSettings: {
                    local_file: video.path,
                    is_local_file: true,
                },
            });
            // Update deck status
            this.deck.currentVideo = video;
            this.deck.status = "loading";
            await deckRepo.save(this.deck);
        }
        catch (error) {
            console.error(`Failed to load video (Deck ${this.deck.id}):`, error);
            throw error;
        }
    }
}
exports.OBSService = OBSService;
