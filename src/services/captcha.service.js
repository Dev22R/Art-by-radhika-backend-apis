const crypto = require('crypto');
const redisService = require('./redis.service');

/**
 * Generate a visual SVG Captcha string with noise, lines and rotation
 * @param {number} length - Number of characters (default 5)
 */
function generateSvgCaptcha(length = 5) {
  // Characters set avoiding ambiguous characters (0, O, 1, I, l)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const width = 160;
  const height = 55;
  const fontSize = 32;

  // Background noise lines (curved and straight)
  let noise = '';
  const noiseColors = ['#cbd5e1', '#e2e8f0', '#fca5a5', '#fed7aa', '#93c5fd', '#fbcfe8'];
  for (let i = 0; i < 5; i++) {
    const x1 = Math.floor(Math.random() * width);
    const y1 = Math.floor(Math.random() * height);
    const x2 = Math.floor(Math.random() * width);
    const y2 = Math.floor(Math.random() * height);
    const stroke = noiseColors[i % noiseColors.length];
    noise += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="1.8" stroke-dasharray="4,3" />`;
  }

  // Noise dots
  for (let i = 0; i < 20; i++) {
    const cx = Math.floor(Math.random() * width);
    const cy = Math.floor(Math.random() * height);
    const r = Math.floor(Math.random() * 2) + 1;
    noise += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#94a3b8" opacity="0.4" />`;
  }

  // Draw characters with distinct colors, offsets, and slight rotation
  const textColors = ['#b91c1c', '#c2410c', '#4338ca', '#0f766e', '#1e293b', '#7c2d12'];
  let textSvg = '';
  const charSpacing = (width - 30) / length;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const x = 16 + i * charSpacing;
    const y = 38 + (Math.random() * 6 - 3);
    const rotate = Math.floor(Math.random() * 26) - 13; // -13 to +13 deg
    const color = textColors[Math.floor(Math.random() * textColors.length)];

    textSvg += `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="900" fill="${color}" transform="rotate(${rotate}, ${x}, ${y})">${char}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background-color: #f8fafc; border-radius: 8px; border: 1.5px solid #e2e8f0; user-select: none;">${noise}${textSvg}</svg>`;
  const base64 = Buffer.from(svg).toString('base64');
  const dataUrl = `data:image/svg+xml;base64,${base64}`;

  return {
    text,
    svg,
    dataUrl,
  };
}

/**
 * Generate Captcha, store in Redis with 5 minutes TTL, and return payload for frontend
 */
async function createAndStoreCaptcha(length = 5) {
  const { text, svg, dataUrl } = generateSvgCaptcha(length);
  const captchaId = crypto.randomUUID();
  const ttlSeconds = 300; // 5 minutes

  // Store lowercase answer in Redis
  await redisService.set(`captcha:${captchaId}`, text.toLowerCase(), ttlSeconds);

  return {
    captchaId,
    captchaImage: dataUrl,
    captchaSvg: svg,
    expiresInSeconds: ttlSeconds,
  };
}

/**
 * Verify a Captcha attempt (case-insensitive, one-time use)
 * @param {string} captchaId
 * @param {string} userAnswer
 * @returns {Promise<{ valid: boolean, message?: string }>}
 */
async function verifyCaptcha(captchaId, userAnswer) {
  if (!captchaId || typeof captchaId !== 'string') {
    return { valid: false, message: 'captchaId is required.' };
  }

  if (!userAnswer || typeof userAnswer !== 'string') {
    return { valid: false, message: 'captchaAnswer is required.' };
  }

  const cacheKey = `captcha:${captchaId.trim()}`;
  const storedAnswer = await redisService.get(cacheKey);

  if (!storedAnswer) {
    return {
      valid: false,
      message: 'Captcha has expired or is invalid. Please refresh and try again.',
    };
  }

  // Delete captcha immediately to prevent replay attacks
  await redisService.del(cacheKey);

  const isMatch = storedAnswer.trim().toLowerCase() === userAnswer.trim().toLowerCase();
  if (!isMatch) {
    return {
      valid: false,
      message: 'Incorrect captcha code. Please try again with a new captcha.',
    };
  }

  return { valid: true };
}

module.exports = {
  generateSvgCaptcha,
  createAndStoreCaptcha,
  verifyCaptcha,
};

