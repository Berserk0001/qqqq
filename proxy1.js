import http from "http";
import https from "https";
import sharp from "sharp";
import pick from "./pick.js";

const DEFAULT_QUALITY = 40;
const MIN_COMPRESS_LENGTH = 1024;
const MIN_TRANSPARENT_COMPRESS_LENGTH = MIN_COMPRESS_LENGTH * 100;

// Helper: Should compress
function shouldCompress(req) {
  const { originType, originSize, webp } = req.params;

  if (!originType.startsWith("image")) return false;
  if (originSize === 0) return false;
  if (req.headers.range) return false;
  if (webp && originSize < MIN_COMPRESS_LENGTH) return false;
  if (
    !webp &&
    (originType.endsWith("png") || originType.endsWith("gif")) &&
    originSize < MIN_TRANSPARENT_COMPRESS_LENGTH
  ) {
    return false;
  }

  return true;
}

// Helper: Copy headers
function copyHeaders(source, target) {
  for (const [key, value] of Object.entries(source.headers)) {
    try {
      target.header(key, value);
    } catch (e) {
      console.log(e.message);
    }
  }
}

// Helper: Redirect
function redirect(req, reply) {
  if (reply.sent) return;

  reply.header("content-length", 0);
  reply.removeHeader("cache-control");
  reply.removeHeader("expires");
  reply.removeHeader("date");
  reply.removeHeader("etag");
  reply.header("location", encodeURI(req.params.url));
  reply.status(302);
  reply.send();
}

// Helper: Compress
function compress(req, reply, input) {
  const format = "jpeg";

  sharp.cache(false);
  sharp.simd(false);
  sharp.concurrency(1);

  const sharpInstance = sharp({
    unlimited: true,
    failOn: "none",
    limitInputPixels: false,
  });

  const transform = sharpInstance
    .resize(null, 16383, {
      withoutEnlargement: true
    })
    .grayscale(req.params.grayscale)
    .toFormat(format, {
      quality: req.params.quality,
      effort: 0
    });

  let infoReceived = false;

  input
    .pipe(transform)
    .on("error", () => {
      if (!reply.sent && !infoReceived) {
        redirect(req, reply);
      }
    })
    .on("info", (info) => {
      infoReceived = true;
      reply.header("content-type", "image/" + format);
      reply.header("content-length", info.size);
      reply.header("x-original-size", req.params.originSize);
      reply.header("x-bytes-saved", req.params.originSize - info.size);
      reply.status(200);
    })
    .on('data', (chunk) => {
      reply.send(chunk);
    })

}

// Main: Proxy
async function hhproxy(req, reply) {
  // Extract and validate parameters from the request
  let url = req.query.url;
  if (!url) return reply.send("bandwidth-hero-proxy");

  // Set request parameters
  req.params = {};
  req.params.url = url;
  req.params.webp = !req.query.jpeg;
  req.params.grayscale = req.query.bw != 0;
  req.params.quality = parseInt(req.query.l, 10) || DEFAULT_QUALITY;

  // Avoid loopback that could cause server hang.
  if (
    req.headers["via"] === "1.1 bandwidth-hero" &&
    ["127.0.0.1", "::1"].includes(req.headers["x-forwarded-for"] || req.ip)
  ) {
    return redirect(req, reply);
  }

  const options = {
    headers: {
      ...pick(req.headers, ["cookie", "dnt", "referer", "range"]),
      "user-agent": "Bandwidth-Hero Compressor",
      "x-forwarded-for": req.headers["x-forwarded-for"] || req.ip,
      via: "1.1 bandwidth-hero",
    },
    rejectUnauthorized: false // Disable SSL verification
  };

  const requestModule = url.startsWith('https') ? https : http;

  try {
    let originReq = requestModule.get(url, options, (originRes) => {
      // Handle non-2xx or redirect responses.
      if (
        originRes.statusCode >= 400 ||
        (originRes.statusCode >= 300 && originRes.headers.location)
      ) {
        return redirect(req, reply);
      }

      // Set headers and stream response.
      copyHeaders(originRes, reply);
      reply.header("content-encoding", "identity");
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Cross-Origin-Resource-Policy", "cross-origin");
      reply.header("Cross-Origin-Embedder-Policy", "unsafe-none");
      req.params.originType = originRes.headers["content-type"] || "";
      req.params.originSize = originRes.headers["content-length"] || "0";

      if (shouldCompress(req)) {
        return compress(req, reply, originRes);
      } else {
        reply.header("x-proxy-bypass", 1);
        ["accept-ranges", "content-type", "content-length", "content-range"].forEach((header) => {
          if (originRes.headers[header]) {
            reply.header(header, originRes.headers[header]);
          }
        });

        // Use reply.raw.write for bypass
        originRes.on('data', (chunk) => {
          reply.send(chunk);
        });

        
      }
    });
  } catch (err) {
    if (err.code === 'ERR_INVALID_URL') {
      return reply.status(400).send("Invalid URL");
    }
    redirect(req, reply);
  }
}

export default hhproxy;
