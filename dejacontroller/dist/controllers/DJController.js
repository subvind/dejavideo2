"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DJController = void 0;
const data_source_1 = require("../data-source");
const DJ_1 = require("../entities/DJ");
const Deck_1 = require("../entities/Deck");
class DJController {
    constructor(streamManager) {
        this.djRepository = data_source_1.AppDataSource.getRepository(DJ_1.DJ);
        this.deckRepository = data_source_1.AppDataSource.getRepository(Deck_1.Deck);
        this.createDJ = async (req, res) => {
            try {
                const { username, email } = req.body;
                // Create new DJ
                const dj = new DJ_1.DJ();
                dj.username = username;
                dj.email = email;
                await this.djRepository.save(dj);
                // Create decks for DJ
                const deckA = new Deck_1.Deck();
                deckA.type = "A";
                deckA.dj = dj;
                deckA.obsPort = await this.streamManager.allocatePort();
                const deckB = new Deck_1.Deck();
                deckB.type = "B";
                deckB.dj = dj;
                deckB.obsPort = await this.streamManager.allocatePort();
                await this.deckRepository.save([deckA, deckB]);
                // Initialize OBS instances
                await this.streamManager.initializeDJStreams(dj.id);
                res.status(201).json({
                    message: "DJ created successfully",
                    dj: {
                        ...dj,
                        decks: [deckA, deckB],
                    },
                });
            }
            catch (error) {
                console.error("Error creating DJ:", error);
                res.status(500).json({ error: "Failed to create DJ" });
            }
        };
        this.getDJ = async (req, res) => {
            try {
                const dj = await this.djRepository.findOne({
                    where: { id: req.params.id },
                    relations: ["decks", "broadcasts"],
                });
                if (!dj) {
                    return res.status(404).json({ error: "DJ not found" });
                }
                res.json(dj);
            }
            catch (error) {
                console.error("Error fetching DJ:", error);
                res.status(500).json({ error: "Failed to fetch DJ" });
            }
        };
        this.getAllDJs = async (req, res) => {
            try {
                const djs = await this.djRepository.find({
                    relations: ["decks", "broadcasts"],
                });
                res.json(djs);
            }
            catch (error) {
                console.error("Error fetching DJs:", error);
                res.status(500).json({ error: "Failed to fetch DJs" });
            }
        };
        this.updateDJStatus = async (req, res) => {
            try {
                const { id } = req.params;
                const { status } = req.body;
                const dj = await this.djRepository.findOneBy({ id });
                if (!dj) {
                    return res.status(404).json({ error: "DJ not found" });
                }
                dj.status = status;
                await this.djRepository.save(dj);
                if (status === "inactive") {
                    await this.streamManager.cleanupDJStreams(id);
                }
                else if (status === "active") {
                    await this.streamManager.initializeDJStreams(id);
                }
                res.json({ message: "DJ status updated", dj });
            }
            catch (error) {
                console.error("Error updating DJ status:", error);
                res.status(500).json({ error: "Failed to update DJ status" });
            }
        };
        this.deleteDJ = async (req, res) => {
            try {
                const { id } = req.params;
                // Cleanup streams first
                await this.streamManager.cleanupDJStreams(id);
                // Delete DJ and related entities
                await this.djRepository.delete(id);
                res.json({ message: "DJ deleted successfully" });
            }
            catch (error) {
                console.error("Error deleting DJ:", error);
                res.status(500).json({ error: "Failed to delete DJ" });
            }
        };
        this.streamManager = streamManager;
    }
}
exports.DJController = DJController;
