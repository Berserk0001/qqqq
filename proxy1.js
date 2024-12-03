import http from 'http';
import https from 'https';
import sharp from 'sharp';
import pick from './pick.js';

const DEFAULT_QUALITY = 40;
const MIN_COMPRESS_LENGTH = 1024;
const MIN_TRANSPARENT_COMPRESS_LENGTH = MIN_COMPRESS_LENGTH * 100;

// Helper: Should compress
function shouldCompress(req) {
  const { originType, originSize, webp } = req.params;

  if (!originType.startsWith('image')) return false;
  if (originSize === 0) return false;
  if (req.headers.range) return false;
  if (webp && originSize < MIN_COMPRESS_LENGTH) return false;
  if (
    !webp &&
    (originType.endsWith('png') || originType.endsWith('gif')) &&
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
function redirect(req, res) {
  if (res.sent) return;

  res.header('content-length', 0);
  res.removeHeader('cache-control');
  res.removeHeader('expires');
  res.removeHeader('date');
  res.removeHeader('etag');
  res.header('location', encodeURI(req.params.url));
  res.status(302).send();
}

// Helper: Compress
function compress(req, res, input) {
  const format = 'jpeg';

  sharp.cache(false);
  sharp.simd(false);
  sharp.concurrency(1);

  const sharpInstance = sharp({
    unlimited: true,
    failOn: 'none',
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
    .on('error', () => {
      if (!res.sent && !infoReceived) {
        redirect(req, res);
      }
    })
    .on('info', (info) => {
      infoReceived = true;
      res.header('content-type', 'image/' + format);
      res.header('content-length', info.size);
      res.header('x-original-size', req.params.originSize);
      res.header('x-bytes-saved', req.params.originSize - info.size);
      res.status(200).send();
    })
    .on('data', (chunk) => {
      if (!res.raw.write(chunk)) {
        input.pause();
        res.raw.once('drain', () => {
          input.resume();
        });
      }
    })
    .on('end', () => {
      res.raw.end();
    });
}

// Main: Proxy
async function hhproxy(req, res) {
  let url = req.query.url;
  if (!url) return res.send('bandwidth-hero-proxy');

  // Set request parameters
  req.params = {};
  req.params.url = url;
  req.params.webp = !req.query.jpeg;
  req.params.grayscale = req.query.bw != 0;
  req.params.quality = parseInt(req.query.l, 10) || DEFAULT_QUALITY;

  // Avoid loopback that could cause server hang
  if (
    req.headers['via'] === '1.1 bandwidth-hero' &&
    ['127.0.0.1', '::1'].includes(req.headers['x-forwarded-for'] || req.ip)
  ) {
    return redirect(req, res);
  }

  const options = {
    headers: {
      ...pick(req.headers, ['cookie', 'dnt', 'referer', 'range']),
      'user-agent': 'Bandwidth-Hero Compressor',
      'x-forwarded-for': req.headers['x-forwarded-for'] || req.ip,
      via: '1.1 bandwidth-hero',
    },
    rejectUnauthorized: false, // Disable SSL verification
  };

  const requestModule = url.startsWith('https') ? https : http;

  try {
    // Initiate the GET request to the origin server
    const originReq = requestModule.get(url, options, (originRes) => {
      // Handle non-2xx or redirect responses
      if (
        originRes.statusCode >= 400 ||
        (originRes.statusCode >= 300 && originRes.headers.location)
      ) {
        return redirect(req, res);
      }

      // Copy headers from origin response to the proxy response
      copyHeaders(originRes, res);
      res.header('content-encoding', 'identity');
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Cross-Origin-Resource-Policy', 'cross-origin');
      res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
      req.params.originType = originRes.headers['content-type'] || '';
      req.params.originSize = originRes.headers['content-length'] || '0';

      // Check if we should compress the image or bypass
      if (shouldCompress(req)) {
        return compress(req, res, originRes);
      } else {
        res.header('x-proxy-bypass', 1);
        ['accept-ranges', 'content-type', 'content-length', 'content-range'].forEach((header) => {
          if (originRes.headers[header]) {
            res.header(header, originRes.headers[header]);
          }
        });

        // Pipe the data to the Fastify response
        originRes.on('data', (chunk) => {
          res.raw.write(chunk);
        });

        originRes.on('end', () => {
          res.raw.end();
        });
      }
    });

  } catch (err) {
    // Handle errors (e.g., invalid URL or connection errors)
    if (err.code === 'ERR_INVALID_URL') {
      return res.status(400).send('Invalid URL');
    }
    redirect(req, res);
  }
}

export default hhproxy;
