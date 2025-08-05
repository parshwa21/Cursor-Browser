// Security utilities for Clinical Research Form Filler
class SecurityManager {
  constructor() {
    this.keyDerivationRounds = 100000;
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
  }

  // Generate a secure random key for encryption
  async generateKey() {
    return await crypto.subtle.generateKey(
      {
        name: this.algorithm,
        length: this.keyLength
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  // Derive key from password using PBKDF2
  async deriveKeyFromPassword(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.keyDerivationRounds,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: this.algorithm, length: this.keyLength },
      true,
      ['encrypt', 'decrypt']
    );
  }

  // Encrypt sensitive data
  async encryptData(data, key) {
    try {
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(JSON.stringify(data));
      
      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const encryptedData = await crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        key,
        encodedData
      );

      return {
        encrypted: Array.from(new Uint8Array(encryptedData)),
        iv: Array.from(iv)
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  // Decrypt sensitive data
  async decryptData(encryptedData, key) {
    try {
      const decryptedData = await crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: new Uint8Array(encryptedData.iv)
        },
        key,
        new Uint8Array(encryptedData.encrypted)
      );

      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decryptedData));
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  // Generate secure salt
  generateSalt() {
    return crypto.getRandomValues(new Uint8Array(32));
  }

  // Hash sensitive information for comparison
  async hashData(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return Array.from(new Uint8Array(hashBuffer));
  }

  // Sanitize input data
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove potential XSS vectors
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  // Validate site data structure
  validateSiteData(siteData) {
    const requiredFields = ['name', 'data'];
    const maxLengths = {
      name: 200,
      data: 10000
    };

    for (const field of requiredFields) {
      if (!siteData[field] || typeof siteData[field] !== 'string') {
        throw new Error(`Invalid or missing field: ${field}`);
      }

      if (siteData[field].length > maxLengths[field]) {
        throw new Error(`Field ${field} exceeds maximum length`);
      }
    }

    // Sanitize data
    siteData.name = this.sanitizeInput(siteData.name);
    siteData.data = this.sanitizeInput(siteData.data);

    return siteData;
  }

  // Check for sensitive data patterns
  containsSensitiveData(text) {
    const sensitivePatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
      /\b[A-Z]{2}\d{6,7}\b/, // License patterns
      /password/i,
      /secret/i,
      /key/i
    ];

    return sensitivePatterns.some(pattern => pattern.test(text));
  }

  // Secure storage interface
  async secureStore(key, data, password = null) {
    try {
      let processedData = data;

      // Encrypt if password provided
      if (password) {
        const salt = this.generateSalt();
        const encryptionKey = await this.deriveKeyFromPassword(password, salt);
        const encrypted = await this.encryptData(data, encryptionKey);
        
        processedData = {
          encrypted: true,
          salt: Array.from(salt),
          data: encrypted
        };
      }

      // Store with timestamp and integrity check
      const storageData = {
        data: processedData,
        timestamp: Date.now(),
        checksum: await this.hashData(JSON.stringify(processedData))
      };

      return chrome.storage.local.set({ [key]: storageData });
    } catch (error) {
      console.error('Secure storage failed:', error);
      throw new Error('Failed to store data securely');
    }
  }

  // Secure retrieval interface
  async secureRetrieve(key, password = null) {
    try {
      const result = await chrome.storage.local.get([key]);
      const storageData = result[key];

      if (!storageData) {
        return null;
      }

      // Verify integrity
      const expectedChecksum = await this.hashData(JSON.stringify(storageData.data));
      const actualChecksum = storageData.checksum;
      
      if (!this.compareArrays(expectedChecksum, actualChecksum)) {
        throw new Error('Data integrity check failed');
      }

      let data = storageData.data;

      // Decrypt if encrypted
      if (data.encrypted && password) {
        const salt = new Uint8Array(data.salt);
        const decryptionKey = await this.deriveKeyFromPassword(password, salt);
        data = await this.decryptData(data.data, decryptionKey);
      } else if (data.encrypted && !password) {
        throw new Error('Password required for encrypted data');
      }

      return data;
    } catch (error) {
      console.error('Secure retrieval failed:', error);
      throw new Error('Failed to retrieve data securely');
    }
  }

  // Helper to compare arrays (for checksum verification)
  compareArrays(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((value, index) => value === arr2[index]);
  }

  // Clean sensitive data from memory
  wipeSensitiveData(obj) {
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (typeof obj[key] === 'string') {
            // Overwrite string data
            obj[key] = '*'.repeat(obj[key].length);
          } else if (typeof obj[key] === 'object') {
            this.wipeSensitiveData(obj[key]);
          }
        }
      }
    }
  }

  // Rate limiting for security operations
  checkRateLimit(operation, maxAttempts = 5, timeWindow = 300000) { // 5 minutes
    const now = Date.now();
    const storageKey = `rateLimit_${operation}`;
    
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([storageKey], (result) => {
        let attempts = result[storageKey] || [];
        
        // Clean old attempts
        attempts = attempts.filter(timestamp => now - timestamp < timeWindow);
        
        if (attempts.length >= maxAttempts) {
          reject(new Error('Rate limit exceeded. Please try again later.'));
          return;
        }
        
        attempts.push(now);
        chrome.storage.local.set({ [storageKey]: attempts }, () => {
          resolve();
        });
      });
    });
  }

  // Generate secure session token
  generateSessionToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Validate session token
  validateSessionToken(token) {
    return token && typeof token === 'string' && token.length === 64 && /^[a-f0-9]+$/.test(token);
  }
}

// Privacy compliance utilities
class PrivacyManager {
  constructor() {
    this.dataRetentionPeriod = 365 * 24 * 60 * 60 * 1000; // 1 year
  }

  // Check if user has consented to data processing
  async hasUserConsent() {
    const result = await chrome.storage.local.get(['userConsent']);
    return result.userConsent === true;
  }

  // Record user consent
  async recordConsent() {
    await chrome.storage.local.set({
      userConsent: true,
      consentTimestamp: Date.now()
    });
  }

  // Revoke user consent and clean data
  async revokeConsent() {
    await this.cleanAllUserData();
    await chrome.storage.local.set({
      userConsent: false,
      consentTimestamp: Date.now()
    });
  }

  // Clean old data based on retention policy
  async cleanOldData() {
    const cutoffDate = Date.now() - this.dataRetentionPeriod;
    const result = await chrome.storage.local.get(['clinicalSites', 'learningData']);
    
    // Clean old sites
    if (result.clinicalSites) {
      const filteredSites = result.clinicalSites.filter(site => {
        const lastUsed = new Date(site.lastUsed || site.createdAt).getTime();
        return lastUsed > cutoffDate;
      });
      await chrome.storage.local.set({ clinicalSites: filteredSites });
    }

    // Clean old learning data
    if (result.learningData) {
      const cleanedLearningData = {};
      for (const [siteId, data] of Object.entries(result.learningData)) {
        const recentInteractions = data.interactions.filter(interaction => {
          return new Date(interaction.timestamp).getTime() > cutoffDate;
        });
        
        if (recentInteractions.length > 0) {
          cleanedLearningData[siteId] = {
            ...data,
            interactions: recentInteractions
          };
        }
      }
      await chrome.storage.local.set({ learningData: cleanedLearningData });
    }
  }

  // Complete data cleanup
  async cleanAllUserData() {
    await chrome.storage.local.clear();
  }

  // Export user data for compliance (GDPR, etc.)
  async exportUserData() {
    const result = await chrome.storage.local.get();
    
    // Remove sensitive system data
    const { rateLimit_login, rateLimit_decrypt, ...userData } = result;
    
    return {
      exported: Date.now(),
      data: userData
    };
  }
}

// Audit logging for security events
class AuditLogger {
  constructor() {
    this.maxLogEntries = 1000;
  }

  async logEvent(eventType, details) {
    const logEntry = {
      timestamp: Date.now(),
      type: eventType,
      details: details,
      session: this.getCurrentSession()
    };

    const result = await chrome.storage.local.get(['auditLog']);
    let auditLog = result.auditLog || [];
    
    auditLog.push(logEntry);
    
    // Keep only recent entries
    if (auditLog.length > this.maxLogEntries) {
      auditLog = auditLog.slice(-this.maxLogEntries);
    }

    await chrome.storage.local.set({ auditLog });
  }

  getCurrentSession() {
    // Simple session identifier
    return Date.now().toString(36);
  }

  async getAuditLog(eventType = null, days = 30) {
    const result = await chrome.storage.local.get(['auditLog']);
    let auditLog = result.auditLog || [];
    
    const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);
    auditLog = auditLog.filter(entry => entry.timestamp > cutoffDate);
    
    if (eventType) {
      auditLog = auditLog.filter(entry => entry.type === eventType);
    }
    
    return auditLog;
  }
}

// Export classes for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SecurityManager, PrivacyManager, AuditLogger };
}