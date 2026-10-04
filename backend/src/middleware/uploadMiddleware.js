const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Storage configuration with sanitized, randomized filenames
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeName = `evidence_${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`;
        cb(null, safeName);
    }
});

// Whitelist safe image, video, and audio types for emergency evidence
const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mpeg',
        'audio/wav', 'audio/webm', 'audio/mpeg', 'audio/ogg', 'audio/x-m4a', 'audio/mp4', 'audio/aac'
    ];
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.mov', '.avi', '.wav', '.mp3', '.ogg', '.m4a', '.aac'];

    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG/PNG/WEBP/GIF images, MP4/WEBM/MOV videos, and WAV/MP3/WEBM audio recordings are permitted.'), false);
    }
};

const uploadEvidence = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 25 * 1024 * 1024 // 25 MB max payload for photo/video
    }
});

module.exports = {
    uploadEvidence
};
