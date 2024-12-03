import http from 'http';
import hhproxy from './proxy1.js';

// Create an HTTP server
const server = http.createServer(hhproxy);

// Define the port to listen on
const PORT = 8080;

// Start the server and listen on the specified port
server.listen(PORT, () => {
  console.log(`Proxy server listening on port ${PORT}`);
});
