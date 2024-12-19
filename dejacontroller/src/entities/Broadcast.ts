import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Video } from "./Video";
import { DJ } from "./DJ";

@Entity()
export class Broadcast {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  channelId!: string;

  @ManyToOne(() => DJ, (dj) => dj.broadcasts)
  @JoinColumn()
  dj!: DJ;

  @Column({
    type: "simple-enum",
    enum: ["live", "offline"],
    default: "offline",
  })
  status!: "live" | "offline";

  @Column("float", { default: 0.5 })
  crossfaderPosition!: number;

  @Column()
  activeVideo!: "A" | "B";

  @Column("simple-json", {
    default: '{"viewers":0,"startTime":null,"bitrate":0}',
  })
  streamStats!: {
    viewers: number;
    startTime: Date | null;
    bitrate: number;
  };

  constructor() {
    this.status = "offline";
    this.crossfaderPosition = 0.5;
    this.streamStats = {
      viewers: 0,
      startTime: null,
      bitrate: 0,
    };
  }
}
