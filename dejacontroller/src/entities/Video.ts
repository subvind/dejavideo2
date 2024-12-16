import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity()
export class Video {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  filename!: string;

  @Column()
  path!: string;

  @Column("float")
  duration!: number;

  @Column({
    type: "simple-enum",
    enum: ["local", "youtube"],
    default: "local",
  })
  source!: "local" | "youtube";

  @Column({ nullable: true })
  youtubeUrl?: string;

  @Column({ nullable: true })
  youtubeId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  constructor() {
    this.source = "local";
    this.duration = 0;
    this.createdAt = new Date();
  }
}
