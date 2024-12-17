import { DJ } from "../entities/DJ";

export function createDJ(username: string, email: string): DJ {
  const dj = new DJ();
  dj.username = username;
  dj.email = email;
  dj.status = "active";
  dj.decks = [];
  dj.broadcasts = [];
  dj.resourceUsage = {
    cpu: 0,
    memory: 0,
    bandwidth: 0,
  };
  return dj;
}
