const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Set up Multer for in-memory file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only PNG images are allowed!'));
    }
  }
});

// Render the main EJS page
app.get('/', (req, res) => {
  res.render('index', { error: null });
});

// Handle PNG to ICO conversion
app.post('/convert', upload.single('pngFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.render('index', { error: 'Please upload a valid PNG file.' });
    }

    const pngBuffer = req.file.buffer;
    
    // Construct ICO binary container from the PNG buffer
    const icoBuffer = createIcoContainer([pngBuffer]);

    // Send downloadable .ico file
    res.setHeader('Content-Type', 'image/x-icon');
    res.setHeader('Content-Disposition', 'attachment; filename="favicon.ico"');
    return res.send(icoBuffer);

  } catch (err) {
    console.error(err);
    res.render('index', { error: 'Failed to convert image.' });
  }
});

/**
 * Packs raw PNG buffer(s) into a valid ICO binary stream
 * @param {Buffer[]} pngBuffers - Array of PNG image buffers
 * @returns {Buffer} ICO binary buffer
 */
function createIcoContainer(pngBuffers) {
  const headerSize = 6;
  const directoryEntrySize = 16;
  const totalHeaderSize = headerSize + directoryEntrySize * pngBuffers.length;

  let currentOffset = totalHeaderSize;
  const entries = [];

  // 1. Calculate entry offsets
  for (const buffer of pngBuffers) {
    entries.push({
      size: buffer.length,
      offset: currentOffset,
    });
    currentOffset += buffer.length;
  }

  // 2. Allocate combined buffer
  const icoBuffer = Buffer.alloc(currentOffset);

  // 3. Write ICONDIR Header
  icoBuffer.writeUInt16LE(0, 0);                 // Reserved
  icoBuffer.writeUInt16LE(1, 2);                 // Type 1 = ICO
  icoBuffer.writeUInt16LE(pngBuffers.length, 4); // Number of images

  // 4. Write ICONDIRENTRY Directory & Image Data
  let entryOffset = headerSize;
  for (let i = 0; i < pngBuffers.length; i++) {
    const png = pngBuffers[i];
    const entry = entries[i];

    icoBuffer.writeUInt8(0, entryOffset + 0);               // Width (0 = 256px or dynamic)
    icoBuffer.writeUInt8(0, entryOffset + 1);               // Height (0 = 256px or dynamic)
    icoBuffer.writeUInt8(0, entryOffset + 2);               // Palette count
    icoBuffer.writeUInt8(0, entryOffset + 3);               // Reserved
    icoBuffer.writeUInt16LE(1, entryOffset + 4);            // Color planes
    icoBuffer.writeUInt16LE(32, entryOffset + 6);           // Bits per pixel
    icoBuffer.writeUInt32LE(entry.size, entryOffset + 8);   // Data length
    icoBuffer.writeUInt32LE(entry.offset, entryOffset + 12);// Offset location

    // Copy raw PNG buffer into the ICO container
    png.copy(icoBuffer, entry.offset);

    entryOffset += directoryEntrySize;
  }

  return icoBuffer;
}

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
