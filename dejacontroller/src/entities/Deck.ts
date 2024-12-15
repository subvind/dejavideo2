import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { DJ } from "./DJ";
import { Video } from "./Video";

@Entity()
export class Deck {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({
    type: "simple-enum",
    enum: ["A", "B"],
  })
  type!: "A" | "B";

  @ManyToOne(() => DJ, (dj) => dj.decks)
  @JoinColumn()
  dj!: DJ;

  @ManyToOne(() => Video, { nullable: true })
  @JoinColumn()
  currentVideo!: Video | null;

  @Column({
    type: "simple-enum",
    enum: ["playing", "stopped", "loading", "loaded"],
    default: "stopped",
  })
  status!: "playing" | "stopped" | "loading" | "loaded";

  @Column("float", { default: 100 })
  streamHealth!: number;

  @Column("integer")
  obsPort!: number;

  constructor() {
    this.status = "stopped";
    this.streamHealth = 100;
    this.currentVideo = null;
  }
}
