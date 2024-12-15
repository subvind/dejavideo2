import "reflect-metadata";
import { DataSource } from "typeorm";
import { DJ } from "./entities/DJ";
import { Deck } from "./entities/Deck";
import { Video } from "./entities/Video";
import { Broadcast } from "./entities/Broadcast";

export const AppDataSource = new DataSource({
  type: "sqlite",
  database: "database.sqlite",
  synchronize: true,
  logging: true,
  entities: [DJ, Deck, Video, Broadcast],
  migrations: [],
  subscribers: [],
});
