const express = require('express');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// App & Middleware Configuration
// ==========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configure Multer memory storage and file filter
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB Limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE'));
    }
  }
});

// ==========================================
// Helper Utilities
// ==========================================

/**
 * Converts an image buffer to clean PNG buffers in standard favicon dimensions.
 * @param {Buffer} inputBuffer 
 * @param {number[]} sizes 
 * @returns {Promise<Buffer[]>}
 */
async function generatePngSizes(inputBuffer, sizes = [16, 32, 48]) {
  return Promise.all(
    sizes.map((size) =>
      sharp(inputBuffer)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );
}

/**
 * Packs raw PNG buffers into a valid binary .ICO file container
 * @param {Buffer[]} pngBuffers 
 * @returns {Buffer}
 */
function buildIcoBuffer(pngBuffers) {
  const HEADER_SIZE = 6;
  const DIRECTORY_ENTRY_SIZE = 16;
  const totalHeaderSize = HEADER_SIZE + DIRECTORY_ENTRY_SIZE * pngBuffers.length;

  let currentOffset = totalHeaderSize;
  const entries = pngBuffers.map((buffer) => {
    const entry = { size: buffer.length, offset: currentOffset };
    currentOffset += buffer.length;
    return entry;
  });

  const icoBuffer = Buffer.alloc(currentOffset);

  // 1. Write ICONDIR Header
  icoBuffer.writeUInt16LE(0, 0);                 // Reserved (must be 0)
  icoBuffer.writeUInt16LE(1, 2);                 // Image type: 1 = ICO
  icoBuffer.writeUInt16LE(pngBuffers.length, 4); // Number of embedded images

  // 2. Write Directory Entries & Raw PNG Data
  pngBuffers.forEach((png, index) => {
    const entryOffset = HEADER_SIZE + index * DIRECTORY_ENTRY_SIZE;
    const entry = entries[index];

    icoBuffer.writeUInt8(0, entryOffset + 0);                // Width (0 = 256px or dynamic)
    icoBuffer.writeUInt8(0, entryOffset + 1);                // Height (0 = 256px or dynamic)
    icoBuffer.writeUInt8(0, entryOffset + 2);                // Color palette count
    icoBuffer.writeUInt8(0, entryOffset + 3);                // Reserved
    icoBuffer.writeUInt16LE(1, entryOffset + 4);             // Color planes
    icoBuffer.writeUInt16LE(32, entryOffset + 6);            // Bits per pixel
    icoBuffer.writeUInt32LE(entry.size, entryOffset + 8);    // Resource size in bytes
    icoBuffer.writeUInt32LE(entry.offset, entryOffset + 12); // Resource offset in file

    png.copy(icoBuffer, entry.offset);
  });

  return icoBuffer;
}

// ==========================================
// Route Handlers
// ==========================================

// GET / - Home Page
app.get('/', (req, res) => {
  res.render('index', { error: null });
});

// POST /convert - Image to ICO Conversion
app.post('/convert', upload.single('imageFile'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.render('index', { error: 'Please upload an image file.' });
    }

    // Generate multi-resolution PNG buffers (16x16, 32x32, 48x48)
    const pngBuffers = await generatePngSizes(req.file.buffer, [16, 32, 48]);

    // Build ICO binary file
    const icoBuffer = buildIcoBuffer(pngBuffers);

    // Stream download response
    res.setHeader('Content-Type', 'image/x-icon');
    res.setHeader('Content-Disposition', 'attachment; filename="favicon.ico"');
    return res.send(icoBuffer);

  } catch (error) {
    next(error);
  }
});

// ==========================================
// Global Error Handler Middleware
// ==========================================
app.use((err, req, res, _next) => {
  console.error('Conversion Error:', err.message);

  let userError = 'Failed to convert the image. Please try again.';
  if (err.message === 'INVALID_FILE_TYPE') {
    userError = 'Invalid file format! Please upload an image (PNG, JPG, WebP, GIF, SVG, BMP).';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    userError = 'File size too large! Maximum allowed size is 10MB.';
  }

  res.render('index', { error: userError });
});

// ==========================================
// Server Start
// ==========================================
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
