"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeckController = void 0;
const data_source_1 = require("../data-source");
const Deck_1 = require("../entities/Deck");
const Video_1 = require("../entities/Video");
class DeckController {
    constructor(streamManager) {
        this.deckRepository = data_source_1.AppDataSource.getRepository(Deck_1.Deck);
        this.videoRepository = data_source_1.AppDataSource.getRepository(Video_1.Video);
        this.loadVideo = async (req, res) => {
            try {
                const { deckId } = req.params;
                const { videoId } = req.body;
                const deck = await this.deckRepository.findOne({
                    where: { id: deckId },
                    relations: ["dj"],
                });
                if (!deck) {
                    return res.status(404).json({ error: "Deck not found" });
                }
                const video = await this.videoRepository.findOneBy({ id: videoId });
                if (!video) {
                    return res.status(404).json({ error: "Video not found" });
                }
                const obsInstance = this.streamManager.getOBSInstance(deck.dj.id, deck.type);
                if (!obsInstance) {
                    return res.status(500).json({ error: "OBS instance not found" });
                }
                await obsInstance.loadVideo(video);
                deck.currentVideo = video;
                deck.status = "loaded";
                await this.deckRepository.save(deck);
                res.json({ message: "Video loaded successfully", deck });
            }
            catch (error) {
                console.error("Error loading video:", error);
                res.status(500).json({ error: "Failed to load video" });
            }
        };
        this.play = async (req, res) => {
            try {
                const { deckId } = req.params;
                const deck = await this.deckRepository.findOne({
                    where: { id: deckId },
                    relations: ["dj", "currentVideo"],
                });
                if (!deck) {
                    return res.status(404).json({ error: "Deck not found" });
                }
                if (!deck.currentVideo) {
                    return res.status(400).json({ error: "No video loaded" });
                }
                const obsInstance = this.streamManager.getOBSInstance(deck.dj.id, deck.type);
                if (!obsInstance) {
                    return res.status(500).json({ error: "OBS instance not found" });
                }
                await obsInstance.play();
                deck.status = "playing";
                await this.deckRepository.save(deck);
                res.json({ message: "Playback started", deck });
            }
            catch (error) {
                console.error("Error starting playback:", error);
                res.status(500).json({ error: "Failed to start playback" });
            }
        };
        this.stop = async (req, res) => {
            try {
                const { deckId } = req.params;
                const deck = await this.deckRepository.findOne({
                    where: { id: deckId },
                    relations: ["dj"],
                });
                if (!deck) {
                    return res.status(404).json({ error: "Deck not found" });
                }
                const obsInstance = this.streamManager.getOBSInstance(deck.dj.id, deck.type);
                if (!obsInstance) {
                    return res.status(500).json({ error: "OBS instance not found" });
                }
                await obsInstance.stop();
                deck.status = "stopped";
                await this.deckRepository.save(deck);
                res.json({ message: "Playback stopped", deck });
            }
            catch (error) {
                console.error("Error stopping playback:", error);
                res.status(500).json({ error: "Failed to stop playback" });
            }
        };
        this.getDeckStatus = async (req, res) => {
            try {
                const { deckId } = req.params;
                const deck = await this.deckRepository.findOne({
                    where: { id: deckId },
                    relations: ["dj", "currentVideo"],
                });
                if (!deck) {
                    return res.status(404).json({ error: "Deck not found" });
                }
                res.json(deck);
            }
            catch (error) {
                console.error("Error fetching deck status:", error);
                res.status(500).json({ error: "Failed to fetch deck status" });
            }
        };
        this.streamManager = streamManager;
    }
}
exports.DeckController = DeckController;
