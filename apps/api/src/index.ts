import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { createServer } from "./server.js";

const prisma = new PrismaClient();
const app = createServer(prisma);

const PORT = parseInt(process.env.API_PORT || "5001", 10);

app.listen(PORT, () => {
  console.log(`GroqAI API Server running on http://localhost:${PORT}`);
  console.log(`OpenAPI documentation: http://localhost:${PORT}/api/docs/openapi.json`);
});
