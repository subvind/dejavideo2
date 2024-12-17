import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Deck } from "./Deck";
import { Broadcast } from "./Broadcast";

@Entity()
export class DJ {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  username!: string;

  @Column({ unique: true })
  email!: string;

  @Column({
    type: "simple-enum",
    enum: ["active", "inactive"],
    default: "active",
  })
  status!: "active" | "inactive";

  @OneToMany(() => Deck, (deck) => deck.dj)
  decks!: Deck[];

  @OneToMany(() => Broadcast, (broadcast) => broadcast.dj)
  broadcasts!: Broadcast[];

  @Column("simple-json", {
    default: '{"cpu":0,"memory":0,"bandwidth":0}',
  })
  resourceUsage!: {
    cpu: number;
    memory: number;
    bandwidth: number;
  };

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
