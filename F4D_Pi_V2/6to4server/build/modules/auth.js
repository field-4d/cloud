"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bigquery_1 = require("@google-cloud/bigquery");
const dotenv = __importStar(require("dotenv"));
const crypto_1 = __importDefault(require("crypto"));
const cloudAuthService_1 = require("../services/cloudAuthService");
dotenv.config();
const router = express_1.default.Router();
// Initialize BigQuery client with credentials if needed
const bigquery = new bigquery_1.BigQuery({
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || '/home/pi/6to4/MongoUpload/credentials/read_BQ.json',
    projectId: 'iucc-f4d',
});
// Hash password with SHA-256 and Base64
const hashPassword = (password) => crypto_1.default.createHash('sha256').update(password).digest('base64');
// Login route
router.post('/login', async (req, res) => {
    console.log('[LOGIN] Received body:', req.body); // 👈 Add this line
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Missing email or password' });
    }
    // Get the device MAC address from environment
    const deviceMac = process.env.BUCKET_NAME;
    if (!deviceMac) {
        console.error('[LOGIN] BUCKET_NAME (MAC address) not found in environment variables');
        return res.status(500).json({ success: false, message: 'Device configuration error' });
    }
    console.log('[LOGIN] Checking access for device MAC:', deviceMac);
    // ✅ Hardcoded fallback login (admin bypass)
    if (email === 'admin' && password === 'field4d') {
        console.log('[LOGIN] Admin login successful for device:', deviceMac);
        return res.status(200).json({ success: true, email: 'admin', deviceMac });
    }
    // ✅ Additional fallback users for development/testing
    const fallbackUsers = [
        { email: 'test@example.com', password: 'test123' },
        // Add more fallback users as needed
    ];
    // Check fallback users first
    const fallbackUser = fallbackUsers.find(user => user.email === email && user.password === password);
    if (fallbackUser) {
        console.log('[LOGIN] Using fallback authentication for:', email);
        return res.status(200).json({ success: true, email, source: 'fallback', deviceMac });
    }
    // 🔄 NEW: Cloud Function Validation
    const hashedPassword = hashPassword(password);
    const cloudAuthResult = await (0, cloudAuthService_1.validateWithCloudFunction)(email, hashedPassword);
    if (!cloudAuthResult.success) {
        console.log('[LOGIN] Cloud function authentication failed for:', email, 'Message:', cloudAuthResult.message);
        return res.status(401).json({
            success: false,
            message: cloudAuthResult.message
        });
    }
    console.log('[LOGIN] Cloud function authentication successful for:', email);
    // ✅ Continue with BigQuery device permission check
    const permissionQuery = `
    SELECT p.email, p.mac_address, p.role, p.experiment, p.valid_until
    FROM \`iucc-f4d.user_device_permission.permissions\` p
    WHERE p.email = @email AND p.mac_address = @deviceMac
    AND (p.valid_until IS NULL OR p.valid_until > CURRENT_TIMESTAMP())
    LIMIT 1
  `;
    try {
        // Then, check device permissions
        const [permissionRows] = await bigquery.query({
            query: permissionQuery,
            params: {
                email,
                deviceMac,
            },
        });
        if (permissionRows.length === 0) {
            console.log('[LOGIN] User authenticated but no device permission:', email, 'for device:', deviceMac);
            return res.status(403).json({
                success: false,
                message: 'Access denied. You do not have permission to access this device.'
            });
        }
        const permission = permissionRows[0];
        console.log('[LOGIN] User authenticated and authorized:', email, 'role:', permission.role, 'device:', deviceMac);
        return res.status(200).json({
            success: true,
            email,
            source: 'cloud_function',
            deviceMac,
            role: permission.role,
            experiment: permission.experiment,
            token: cloudAuthResult.token // Include JWT token if provided by cloud function
        });
    }
    catch (err) {
        console.error('BigQuery device permission check error:', err.message);
        // If BigQuery fails due to permissions, log it but don't fail the request
        if (err.message.includes('Access Denied') || err.message.includes('permission')) {
            console.log('[LOGIN] BigQuery access denied for device permission check:', email);
            return res.status(500).json({
                success: false,
                message: 'Device permission service temporarily unavailable. Please contact administrator.'
            });
        }
        // For other BigQuery errors, return server error
        return res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});
exports.default = router;
