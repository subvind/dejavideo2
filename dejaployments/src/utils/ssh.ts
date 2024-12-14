import { NodeSSH } from "node-ssh";

export class SSHClient {
  private ssh: NodeSSH;

  constructor() {
    this.ssh = new NodeSSH();
  }

  async connect(host: string): Promise<void> {
    await this.ssh.connect({
      host,
      username: process.env.SSH_USER || "dejaploy",
      privateKey: process.env.SSH_KEY_PATH || "~/.ssh/deja",
    });
  }

  async execute(command: string): Promise<string> {
    const result = await this.ssh.execCommand(command, {
      execOptions: { stream: "both" },
    });
    if (result.code !== 0) {
      throw new Error(`Command failed: ${result.stderr}`);
    }
    return result.stdout;
  }

  async disconnect(): Promise<void> {
    await this.ssh.dispose();
  }
}
