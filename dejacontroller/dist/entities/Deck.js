"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Deck = void 0;
const typeorm_1 = require("typeorm");
const DJ_1 = require("./DJ");
const Video_1 = require("./Video");
let Deck = class Deck {
};
exports.Deck = Deck;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)("uuid"),
    __metadata("design:type", String)
], Deck.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: "simple-enum",
        enum: ["A", "B"],
    }),
    __metadata("design:type", String)
], Deck.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => DJ_1.DJ, (dj) => dj.decks),
    (0, typeorm_1.JoinColumn)(),
    __metadata("design:type", DJ_1.DJ)
], Deck.prototype, "dj", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Video_1.Video, { nullable: true }),
    (0, typeorm_1.JoinColumn)(),
    __metadata("design:type", Video_1.Video)
], Deck.prototype, "currentVideo", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: "simple-enum",
        enum: ["playing", "stopped", "loading"],
        default: "stopped",
    }),
    __metadata("design:type", String)
], Deck.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)("float", { default: 100 }),
    __metadata("design:type", Number)
], Deck.prototype, "streamHealth", void 0);
__decorate([
    (0, typeorm_1.Column)("integer"),
    __metadata("design:type", Number)
], Deck.prototype, "obsPort", void 0);
exports.Deck = Deck = __decorate([
    (0, typeorm_1.Entity)()
], Deck);
