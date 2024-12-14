import { Command } from 'commander';
import { AppManager } from './services/appManager';
import path from 'path';
import type { AppConfig } from './types';

const program = new Command();
const appManager = new AppManager();

program
  .version('1.0.0')
  .description('Phoenix Apps Infrastructure Manager');

program
  .command('deploy <host> <action> <appName>')
  .description('Deploy, update, or remove a Phoenix application')
  .action(async (host: string, action: string, appName: string) => {
    try {
      const configPath = path.join(process.cwd(), 'apps.yaml');
      const config = await appManager.loadConfig(configPath);

      switch (action) {
        case 'add':
        case 'update':
          if (!config.apps[appName]) {
            throw new Error(`App ${appName} not found in configuration`);
          }
          await appManager.deployApp(host, appName, config.apps[appName]);
          break;

        case 'remove':
          if (config.apps[appName]) {
            console.log(`Removing app ${appName}...`);
            await appManager.removeApp(host, appName);
            delete config.apps[appName];
            await appManager.saveConfig(configPath, config);
          } else {
            console.log(`App ${appName} not found in configuration`);
          }
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

    } catch (err) {
      const error = err as Error;
      console.error("Error:", error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
