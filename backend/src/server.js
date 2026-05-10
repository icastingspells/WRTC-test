const http = require("http");
const app = require("./app");
const initSocket = require("./socket/index");
const server = http.createServer(app);

initSocket(server);

server.listen(3000, "0.0.0.0", () => {
  console.log("Server running on port 3000");
});
