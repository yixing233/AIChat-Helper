import { buildApp } from "./app.js";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";

const app = buildApp();

app
  .listen({ port, host })
  .then(() => {
    console.log(`remote server listening on ${host}:${port}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
