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
exports.Broadcast = void 0;
const typeorm_1 = require("typeorm");
const DJ_1 = require("./DJ");
let Broadcast = class Broadcast {
};
exports.Broadcast = Broadcast;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)("uuid"),
    __metadata("design:type", String)
], Broadcast.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Broadcast.prototype, "channelId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => DJ_1.DJ, (dj) => dj.broadcasts),
    (0, typeorm_1.JoinColumn)(),
    __metadata("design:type", DJ_1.DJ)
], Broadcast.prototype, "dj", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: "simple-enum",
        enum: ["live", "offline"],
        default: "offline",
    }),
    __metadata("design:type", String)
], Broadcast.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)("float", { default: 0.5 }),
    __metadata("design:type", Number)
], Broadcast.prototype, "crossfaderPosition", void 0);
__decorate([
    (0, typeorm_1.Column)("simple-json", { default: () => "({})" }),
    __metadata("design:type", Object)
], Broadcast.prototype, "streamStats", void 0);
exports.Broadcast = Broadcast = __decorate([
    (0, typeorm_1.Entity)()
], Broadcast);
