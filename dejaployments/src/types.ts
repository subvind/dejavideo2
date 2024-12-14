export interface AppConfig {
  domain: string;
  port: number;
  repository: string;
  branch: string;
  buildCommand?: string;
  enabled: boolean;
  env?: Record<string, string>;
}

export interface AppsConfig {
  apps: {
    [key: string]: AppConfig;
  };
}
