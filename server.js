import http from 'http';
import hhproxy from './proxy1.js';

const PORT = process.env.PORT || 8080;

// Create the HTTP server
const server = http.createServer((req, res) => {

  // Use the proxy function to handle the request
  hhproxy(req, res);
});

// Start the server and listen on the specified port
server.listen(PORT, () => {
  console.log(`Proxy server listening on port ${PORT}`);
});
