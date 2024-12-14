import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { SSHClient } from '../utils/ssh';
import { TemplateService } from './templateService';
import type { AppConfig, AppsConfig } from '../types';
import path from 'path';

export class AppManager {
  private sshClient: SSHClient;
  private templateService: TemplateService;

  constructor() {
    this.sshClient = new SSHClient();
    this.templateService = new TemplateService();
  }

  async loadConfig(configPath: string): Promise<AppsConfig> {
    const content = await fs.readFile(configPath, 'utf-8');
    return yaml.load(content) as AppsConfig;
  }

  async saveConfig(configPath: string, config: AppsConfig): Promise<void> {
    const content = yaml.dump(config);
    await fs.writeFile(configPath, content, 'utf-8');
  }

  private async generateConfigs(appName: string, app: AppConfig): Promise<{ nginx: string; systemd: string }> {
    const nginx = this.templateService.generateNginxConfig(appName, app.domain, app.port);
    const systemd = this.templateService.generateSystemdService(appName, app.port);
    return { nginx, systemd };
  }

  async removeApp(host: string, appName: string): Promise<void> {
    try {
      await this.sshClient.connect(host);
      
      // Stop the app service
      console.log(`Stopping service for ${appName}...`);
      await this.sshClient.execute(`sudo systemctl stop phoenix-${appName} || true`);
      await this.sshClient.execute(`sudo systemctl disable phoenix-${appName} || true`);
      
      // Remove configuration files
      console.log('Removing configuration files...');
      await this.sshClient.execute(`sudo rm -f /etc/nginx/sites-enabled/${appName}.conf`);
      await this.sshClient.execute(`sudo rm -f /etc/systemd/system/phoenix-${appName}.service`);
      
      // Remove app files
      console.log('Removing application files...');
      await this.sshClient.execute(`sudo rm -rf /opt/apps/${appName}`);
      
      // Reload services
      console.log('Reloading services...');
      await this.sshClient.execute('sudo systemctl daemon-reload');
      await this.sshClient.execute('sudo nginx -t && sudo systemctl reload nginx');
      
      console.log(`Successfully removed ${appName}`);
    } catch (error) {
      console.error(`Error removing app ${appName}:`, error);
      throw error;
    } finally {
      await this.sshClient.disconnect();
    }
  }

  async deployApp(host: string, appName: string, config: AppConfig): Promise<void> {
    try {
      await this.sshClient.connect(host);

      console.log(`Deploying ${appName} from ${config.repository}#${config.branch}`);

      // Install required build tools
      await this.sshClient.execute(`
        sudo apt-get update && \
        sudo apt-get install -y git build-essential erlang elixir npm nodejs
      `);

      // Setup app directory
      const appPath = `/opt/apps/${appName}`;
      await this.sshClient.execute(`sudo mkdir -p ${appPath}`);
      await this.sshClient.execute(`sudo chown -R deploy:deploy ${appPath}`);

      // Clone or update repository
      const gitDir = `${appPath}/.git`;
      const gitExists = await this.sshClient.execute(`test -d ${gitDir} && echo "exists" || echo ""`);
      
      if (gitExists.trim() === 'exists') {
        console.log('Updating existing repository...');
        await this.sshClient.execute(`
          cd ${appPath} && \
          git fetch --all && \
          git reset --hard origin/${config.branch} && \
          git clean -fd
        `);
      } else {
        console.log('Cloning repository...');
        await this.sshClient.execute(`
          git clone --branch ${config.branch} ${config.repository} ${appPath}
        `);
      }

      // Setup build environment
      const buildEnv = {
        MIX_ENV: 'prod',
        PORT: config.port.toString(),
        ...config.env
      };
      const exportEnv = Object.entries(buildEnv)
        .map(([key, value]) => `export ${key}="${value}"`)
        .join(' && ');

      // Build the application
      console.log('Building application...');
      await this.sshClient.execute(`
        cd ${appPath} && \
        ${exportEnv} && \
        mix local.hex --force && \
        mix local.rebar --force && \
        mix deps.get && \
        ${config.buildCommand || 'mix release --overwrite'}
      `);

      // Update systemd service with current environment
      const systemdEnvConfig = Object.entries(buildEnv)
        .map(([key, value]) => `Environment=${key}=${value}`)
        .join('\n');
      
      await this.sshClient.execute(`
        sudo sed -i '/^Environment=.*/d' /etc/systemd/system/phoenix-${appName}.service && \
        echo '${systemdEnvConfig}' | sudo tee -a /etc/systemd/system/phoenix-${appName}.service
      `);

      // Restart the service
      console.log('Restarting service...');
      await this.sshClient.execute(`
        sudo systemctl daemon-reload && \
        sudo systemctl restart phoenix-${appName}
      `);

      console.log(`Successfully deployed ${appName}`);

    } catch (error) {
      console.error(`Error deploying ${appName}:`, error);
      throw error;
    } finally {
      await this.sshClient.disconnect();
    }
  }

  async updateConfigurations(host: string, config: AppsConfig): Promise<void> {
    try {
      await this.sshClient.connect(host);

      // Get list of currently deployed apps
      const deployedApps = await this.sshClient.execute('ls /etc/nginx/sites-enabled/ | grep .conf || true');
      const deployedAppNames = deployedApps.split('\n')
        .map(name => name.replace('.conf', ''))
        .filter(Boolean);

      // Process configuration changes
      for (const [appName, app] of Object.entries(config.apps)) {
        if (app.enabled) {
          console.log(`Configuring ${appName}...`);
          const configs = await this.generateConfigs(appName, app);
          
          // Update Nginx config
          await this.sshClient.execute(`cat > /etc/nginx/sites-enabled/${appName}.conf << 'EOL'
${configs.nginx}
EOL`);
          
          // Update systemd service
          await this.sshClient.execute(`cat > /etc/systemd/system/phoenix-${appName}.service << 'EOL'
${configs.systemd}
EOL`);
        } else {
          console.log(`Removing configurations for ${appName}...`);
          await this.removeApp(host, appName);
        }
      }

      // Clean up old apps that are no longer in config
      for (const deployedApp of deployedAppNames) {
        if (!config.apps[deployedApp]) {
          console.log(`Removing old app ${deployedApp}...`);
          await this.removeApp(host, deployedApp);
        }
      }

      // Reload services
      console.log('Reloading services...');
      await this.sshClient.execute('systemctl daemon-reload');
      await this.sshClient.execute('nginx -t && systemctl reload nginx');

    } finally {
      await this.sshClient.disconnect();
    }
  }
}
