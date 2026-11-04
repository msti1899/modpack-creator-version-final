import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "modpack-api" }));

export default app;
