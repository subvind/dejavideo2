"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDataSource = void 0;
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const DJ_1 = require("./entities/DJ");
const Deck_1 = require("./entities/Deck");
const Video_1 = require("./entities/Video");
const Broadcast_1 = require("./entities/Broadcast");
exports.AppDataSource = new typeorm_1.DataSource({
    type: "sqlite",
    database: "database.sqlite",
    synchronize: true,
    logging: true,
    entities: [DJ_1.DJ, Deck_1.Deck, Video_1.Video, Broadcast_1.Broadcast],
    migrations: [],
    subscribers: [],
});
