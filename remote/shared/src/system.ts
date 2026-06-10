export type SystemStatusResponse = {
  ok: true;
  service: "remote-sync";
  database: "sqlite";
  conversationCount: number;
  deviceCount: number;
  serverTime: string;
};
