import http from "node:http";
import handler from "./app.js";
export const server = http.createServer(handler);
server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log("Kitoko gestart op poort " + (process.env.PORT || 3000)),
);
