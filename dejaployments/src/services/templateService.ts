import Handlebars from 'handlebars';
import { nginxTemplate, systemdTemplate } from '../config/templates';

export class TemplateService {
  private nginxTemplate: HandlebarsTemplateDelegate;
  private systemdTemplate: HandlebarsTemplateDelegate;

  constructor() {
    this.nginxTemplate = Handlebars.compile(nginxTemplate);
    this.systemdTemplate = Handlebars.compile(systemdTemplate);
  }

  generateNginxConfig(appName: string, domain: string, port: number): string {
    return this.nginxTemplate({ appName, domain, port });
  }

  generateSystemdService(appName: string, port: number): string {
    return this.systemdTemplate({ appName, port });
  }
}
