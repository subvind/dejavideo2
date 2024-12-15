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
exports.DJ = void 0;
const typeorm_1 = require("typeorm");
const Deck_1 = require("./Deck");
const Broadcast_1 = require("./Broadcast");
let DJ = class DJ {
};
exports.DJ = DJ;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)("uuid"),
    __metadata("design:type", String)
], DJ.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], DJ.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], DJ.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: "simple-enum",
        enum: ["active", "inactive"],
        default: "inactive",
    }),
    __metadata("design:type", String)
], DJ.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Deck_1.Deck, (deck) => deck.dj),
    __metadata("design:type", Array)
], DJ.prototype, "decks", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Broadcast_1.Broadcast, (broadcast) => broadcast.dj),
    __metadata("design:type", Array)
], DJ.prototype, "broadcasts", void 0);
__decorate([
    (0, typeorm_1.Column)("simple-json", { default: () => "({})" }),
    __metadata("design:type", Object)
], DJ.prototype, "resourceUsage", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], DJ.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], DJ.prototype, "updatedAt", void 0);
exports.DJ = DJ = __decorate([
    (0, typeorm_1.Entity)()
], DJ);
