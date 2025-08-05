// Background service worker for Clinical Research Form Filler
class BackgroundService {
  constructor() {
    this.aiProcessor = new AIProcessor();
    this.learningSystem = new LearningSystem();
    this.setupMessageHandlers();
    this.setupStorageHandlers();
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });
  }

  setupStorageHandlers() {
    // Initialize default settings
    chrome.runtime.onInstalled.addListener(() => {
      chrome.storage.local.set({
        clinicalSites: [],
        learningData: {},
        settings: {
          aiProcessingEnabled: true,
          learningEnabled: true,
          autoFillEnabled: true,
          confidenceThreshold: 0.7
        }
      });
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'processFormData':
          const processedData = await this.aiProcessor.processFormData(request.formData, request.siteData);
          sendResponse({ success: true, data: processedData });
          break;

        case 'learnFromInteraction':
          await this.learningSystem.recordInteraction(request.interaction);
          sendResponse({ success: true });
          break;

        case 'getFieldMappings':
          const mappings = await this.aiProcessor.getFieldMappings(request.fields, request.siteData);
          sendResponse({ success: true, mappings });
          break;

        case 'updateSiteUsage':
          await this.updateSiteUsage(request.siteId);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Background service error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async updateSiteUsage(siteId) {
    const result = await chrome.storage.local.get(['clinicalSites']);
    const sites = result.clinicalSites || [];
    
    const siteIndex = sites.findIndex(site => site.id === siteId);
    if (siteIndex !== -1) {
      sites[siteIndex].usageCount = (sites[siteIndex].usageCount || 0) + 1;
      sites[siteIndex].lastUsed = new Date().toISOString();
      await chrome.storage.local.set({ clinicalSites: sites });
    }
  }
}

// AI Processing class for interpreting unstructured data
class AIProcessor {
  constructor() {
    this.fieldPatterns = this.initializeFieldPatterns();
    this.confidence = new ConfidenceCalculator();
  }

  initializeFieldPatterns() {
    return {
      // Contact Information
      principalInvestigator: [
        /principal\s+investigator[:\s]*([^,\n]+)/i,
        /pi[:\s]*([^,\n]+)/i,
        /dr\.?\s+([^,\n]+)/i,
        /investigator[:\s]*([^,\n]+)/i
      ],
      phone: [
        /phone[:\s]*(\(?[\d\s\-\.\(\)]{10,})/i,
        /tel[:\s]*(\(?[\d\s\-\.\(\)]{10,})/i,
        /(\(\d{3}\)\s*\d{3}-\d{4})/,
        /(\d{3}[-\.\s]?\d{3}[-\.\s]?\d{4})/
      ],
      email: [
        /email[:\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
      ],
      fax: [
        /fax[:\s]*(\(?[\d\s\-\.\(\)]{10,})/i,
        /facsimile[:\s]*(\(?[\d\s\-\.\(\)]{10,})/i
      ],
      
      // Address Information
      address: [
        /address[:\s]*([^,\n]+(?:,\s*[^,\n]+)*)/i,
        /location[:\s]*([^,\n]+(?:,\s*[^,\n]+)*)/i,
        /(\d+\s+[^,\n]+(?:,\s*[^,\n]+)*)/
      ],
      city: [
        /city[:\s]*([^,\n]+)/i,
        /,\s*([A-Za-z\s]+),\s*[A-Z]{2}/,
        /address[^,\n]*,\s*([^,\n]+),/i
      ],
      state: [
        /state[:\s]*([A-Z]{2}|[A-Za-z\s]+)/i,
        /,\s*([A-Z]{2})\s+\d{5}/,
        /,\s*([A-Za-z\s]+)\s+\d{5}/
      ],
      zipCode: [
        /zip[:\s]*(\d{5}(?:-\d{4})?)/i,
        /postal[:\s]*(\d{5}(?:-\d{4})?)/i,
        /(\d{5}(?:-\d{4})?)/
      ],
      
      // Institution Information
      institutionName: [
        /institution[:\s]*([^,\n]+)/i,
        /hospital[:\s]*([^,\n]+)/i,
        /center[:\s]*([^,\n]+)/i,
        /clinic[:\s]*([^,\n]+)/i,
        /university[:\s]*([^,\n]+)/i
      ],
      department: [
        /department[:\s]*([^,\n]+)/i,
        /dept[:\s]*([^,\n]+)/i,
        /division[:\s]*([^,\n]+)/i
      ],
      
      // Regulatory Information
      irbContact: [
        /irb[:\s]*([^,\n]+)/i,
        /institutional\s+review\s+board[:\s]*([^,\n]+)/i,
        /ethics[:\s]*([^,\n]+)/i
      ],
      licenseNumber: [
        /license[:\s]*([A-Z0-9\-]+)/i,
        /license\s+number[:\s]*([A-Z0-9\-]+)/i,
        /lic[:\s]*([A-Z0-9\-]+)/i
      ],
      deaNumber: [
        /dea[:\s]*([A-Z0-9\-]+)/i,
        /dea\s+number[:\s]*([A-Z0-9\-]+)/i
      ],
      taxId: [
        /tax\s+id[:\s]*([0-9\-]+)/i,
        /ein[:\s]*([0-9\-]+)/i,
        /federal\s+id[:\s]*([0-9\-]+)/i
      ],
      
      // Personnel
      coordinator: [
        /coordinator[:\s]*([^,\n]+)/i,
        /study\s+coordinator[:\s]*([^,\n]+)/i,
        /research\s+coordinator[:\s]*([^,\n]+)/i
      ],
      subInvestigator: [
        /sub[:\s]*investigator[:\s]*([^,\n]+)/i,
        /co[:\s]*investigator[:\s]*([^,\n]+)/i,
        /associate[:\s]*investigator[:\s]*([^,\n]+)/i
      ]
    };
  }

  async processFormData(formData, siteData) {
    const extractedData = this.extractStructuredData(siteData.data);
    const mappings = await this.generateFieldMappings(formData.fields, extractedData);
    
    return {
      extractedData,
      mappings,
      confidence: this.confidence.calculateOverallConfidence(mappings)
    };
  }

  extractStructuredData(unstructuredData) {
    const extracted = {};
    
    for (const [fieldType, patterns] of Object.entries(this.fieldPatterns)) {
      for (const pattern of patterns) {
        const match = unstructuredData.match(pattern);
        if (match) {
          extracted[fieldType] = {
            value: match[1] ? match[1].trim() : match[0].trim(),
            confidence: this.confidence.calculatePatternConfidence(pattern, match),
            pattern: pattern.toString()
          };
          break; // Use first match for each field type
        }
      }
    }
    
    return extracted;
  }

  async generateFieldMappings(formFields, extractedData) {
    const mappings = [];
    
    for (const field of formFields) {
      const bestMatch = this.findBestMatch(field, extractedData);
      if (bestMatch) {
        mappings.push({
          fieldId: field.id,
          fieldName: field.name,
          fieldType: field.type,
          mappedValue: bestMatch.value,
          confidence: bestMatch.confidence,
          extractedFrom: bestMatch.fieldType
        });
      }
    }
    
    return mappings;
  }

  findBestMatch(formField, extractedData) {
    const fieldName = formField.name.toLowerCase();
    const fieldId = formField.id.toLowerCase();
    const fieldText = `${fieldName} ${fieldId}`;
    
    let bestMatch = null;
    let highestScore = 0;
    
    for (const [dataType, data] of Object.entries(extractedData)) {
      const score = this.calculateFieldMatchScore(fieldText, dataType, formField.type);
      if (score > highestScore && score > 0.3) { // Minimum confidence threshold
        highestScore = score;
        bestMatch = {
          ...data,
          fieldType: dataType,
          confidence: score
        };
      }
    }
    
    return bestMatch;
  }

  calculateFieldMatchScore(fieldText, dataType, fieldType) {
    // Keyword matching
    const keywords = {
      principalInvestigator: ['investigator', 'pi', 'principal', 'doctor', 'dr'],
      phone: ['phone', 'tel', 'telephone', 'contact'],
      email: ['email', 'mail', 'contact'],
      fax: ['fax', 'facsimile'],
      address: ['address', 'street', 'location'],
      city: ['city', 'town'],
      state: ['state', 'province'],
      zipCode: ['zip', 'postal', 'code'],
      institutionName: ['institution', 'hospital', 'center', 'clinic', 'organization'],
      department: ['department', 'dept', 'division'],
      coordinator: ['coordinator', 'manager'],
      licenseNumber: ['license', 'lic', 'permit'],
      deaNumber: ['dea', 'drug'],
      taxId: ['tax', 'ein', 'federal']
    };
    
    const dataKeywords = keywords[dataType] || [];
    let score = 0;
    
    // Check for keyword matches
    for (const keyword of dataKeywords) {
      if (fieldText.includes(keyword)) {
        score += 0.4;
      }
    }
    
    // Boost score for exact matches
    if (fieldText.includes(dataType.toLowerCase())) {
      score += 0.6;
    }
    
    // Field type compatibility
    const typeCompatibility = this.getTypeCompatibility(fieldType, dataType);
    score *= typeCompatibility;
    
    return Math.min(score, 1.0);
  }

  getTypeCompatibility(formFieldType, dataType) {
    const compatibility = {
      email: { email: 1.0 },
      tel: { phone: 1.0, fax: 0.8 },
      text: { '*': 0.8 }, // Text fields can accept most data
      textarea: { address: 1.0, '*': 0.6 },
      number: { zipCode: 1.0, licenseNumber: 0.7, taxId: 0.7 }
    };
    
    const fieldCompat = compatibility[formFieldType];
    if (!fieldCompat) return 0.5; // Default compatibility
    
    return fieldCompat[dataType] || fieldCompat['*'] || 0.3;
  }

  async getFieldMappings(fields, siteData) {
    const extractedData = this.extractStructuredData(siteData.data);
    return await this.generateFieldMappings(fields, extractedData);
  }
}

// Confidence calculation system
class ConfidenceCalculator {
  calculatePatternConfidence(pattern, match) {
    let confidence = 0.5; // Base confidence
    
    // Higher confidence for more specific patterns
    if (pattern.source.includes('\\d')) confidence += 0.2; // Contains digit requirements
    if (pattern.source.includes('+')) confidence += 0.1; // Quantifiers
    if (pattern.source.includes('[A-Z]')) confidence += 0.1; // Case sensitivity
    if (pattern.flags.includes('i')) confidence -= 0.05; // Case insensitive reduces confidence
    
    // Length-based confidence
    if (match[1] && match[1].length > 3) confidence += 0.1;
    if (match[1] && match[1].length > 10) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  calculateOverallConfidence(mappings) {
    if (!mappings.length) return 0;
    
    const totalConfidence = mappings.reduce((sum, mapping) => sum + mapping.confidence, 0);
    return totalConfidence / mappings.length;
  }
}

// Learning system for improving accuracy over time
class LearningSystem {
  constructor() {
    this.interactions = [];
  }

  async recordInteraction(interaction) {
    const { siteId, fieldId, predictedValue, actualValue, wasCorrect, userFeedback } = interaction;
    
    const interactionRecord = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      siteId,
      fieldId,
      predictedValue,
      actualValue,
      wasCorrect,
      userFeedback,
      confidence: interaction.confidence || 0
    };
    
    // Store interaction
    this.interactions.push(interactionRecord);
    
    // Update learning data in storage
    const result = await chrome.storage.local.get(['learningData']);
    const learningData = result.learningData || {};
    
    if (!learningData[siteId]) {
      learningData[siteId] = {
        interactions: [],
        patterns: {},
        accuracy: 0
      };
    }
    
    learningData[siteId].interactions.push(interactionRecord);
    learningData[siteId].accuracy = this.calculateSiteAccuracy(learningData[siteId].interactions);
    
    // Update patterns based on successful interactions
    if (wasCorrect) {
      this.updateSuccessPatterns(learningData[siteId], interaction);
    }
    
    await chrome.storage.local.set({ learningData });
  }

  calculateSiteAccuracy(interactions) {
    if (!interactions.length) return 0;
    
    const correctInteractions = interactions.filter(i => i.wasCorrect).length;
    return correctInteractions / interactions.length;
  }

  updateSuccessPatterns(siteData, interaction) {
    const { fieldId, actualValue } = interaction;
    
    if (!siteData.patterns[fieldId]) {
      siteData.patterns[fieldId] = {
        successfulValues: [],
        commonPatterns: []
      };
    }
    
    siteData.patterns[fieldId].successfulValues.push(actualValue);
    
    // Extract common patterns (simplified)
    if (siteData.patterns[fieldId].successfulValues.length >= 3) {
      const patterns = this.extractCommonPatterns(siteData.patterns[fieldId].successfulValues);
      siteData.patterns[fieldId].commonPatterns = patterns;
    }
  }

  extractCommonPatterns(values) {
    // Simplified pattern extraction
    const patterns = [];
    
    // Check for common prefixes/suffixes
    const prefixes = {};
    const suffixes = {};
    
    values.forEach(value => {
      if (typeof value === 'string' && value.length > 3) {
        const prefix = value.substring(0, 3);
        const suffix = value.substring(value.length - 3);
        
        prefixes[prefix] = (prefixes[prefix] || 0) + 1;
        suffixes[suffix] = (suffixes[suffix] || 0) + 1;
      }
    });
    
    // Add common patterns
    Object.entries(prefixes).forEach(([prefix, count]) => {
      if (count >= 2) {
        patterns.push({ type: 'prefix', pattern: prefix, frequency: count });
      }
    });
    
    return patterns;
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// Initialize background service
const backgroundService = new BackgroundService();