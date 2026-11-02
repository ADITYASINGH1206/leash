export interface GatewayConfig {
  port: number;
  environment: string;
}

export const config: GatewayConfig = {
  port: Number(process.env.PORT || 4000),
  environment: process.env.NODE_ENV || 'development'
};
