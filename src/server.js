/** Local HTTP adapter: turns node:http requests into API-Gateway-shaped events. */
const http = require("node:http");
const { randomUUID } = require("node:crypto");

const serve = ({ app, port = 3000, host = "127.0.0.1", resolveApiKey = () => undefined }) =>
  new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const result = await app.handle({
          httpMethod: req.method,
          path: url.pathname,
          queryStringParameters: Object.fromEntries(url.searchParams),
          headers: req.headers,
          body: chunks.length ? Buffer.concat(chunks).toString("utf8") : null,
          requestContext: { requestId: randomUUID(), identity: { apiKeyId: await resolveApiKey(req.headers["x-api-key"]) } }
        });
        res.writeHead(result.statusCode, result.headers);
        res.end(result.body);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Local adapter failure", detail: err.message }));
      }
    });
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });

module.exports = { serve };
