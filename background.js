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
        /investigator[:\s]*([^,\n]+)/i,
        /physician[:\s]*([^,\n]+)/i,
        /doctor[:\s]*([^,\n]+)/i
      ],
      firstName: [
        /first\s+name[:\s]*([^,\n]+)/i,
        /fname[:\s]*([^,\n]+)/i,
        /given\s+name[:\s]*([^,\n]+)/i
      ],
      lastName: [
        /last\s+name[:\s]*([^,\n]+)/i,
        /lname[:\s]*([^,\n]+)/i,
        /surname[:\s]*([^,\n]+)/i,
        /family\s+name[:\s]*([^,\n]+)/i
      ],
      fullName: [
        /name[:\s]*([^,\n]+)/i,
        /contact[:\s]*([^,\n]+)/i
      ],
      phone: [
        /phone[:\s]*(\(?[\d\s\-\.\(\)]{10,})/i,
        /tel[:\s]*(\(?[\d\s\-\.\(\)]{10,})/i,
        /telephone[:\s]*(\(?[\d\s\-\.\(\)]{10,})/i,
        /mobile[:\s]*(\(?[\d\s\-\.\(\)]{10,})/i,
        /cell[:\s]*(\(?[\d\s\-\.\(\)]{10,})/i,
        /(\(\d{3}\)\s*\d{3}-\d{4})/,
        /(\d{3}[-\.\s]?\d{3}[-\.\s]?\d{4})/
      ],
      email: [
        /email[:\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        /mail[:\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        /e-mail[:\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
      ],
      fax: [
        /fax[:\s]*(\(?[\d\s\-\.\(\)]{10,})/i,
        /facsimile[:\s]*(\(?[\d\s\-\.\(\)]{10,})/i
      ],
      
      // Address Information
      address: [
        /address[:\s]*([^,\n]+(?:,\s*[^,\n]+)*)/i,
        /street[:\s]*([^,\n]+(?:,\s*[^,\n]+)*)/i,
        /location[:\s]*([^,\n]+(?:,\s*[^,\n]+)*)/i,
        /(\d+\s+[^,\n]+(?:,\s*[^,\n]+)*)/
      ],
      city: [
        /city[:\s]*([^,\n]+)/i,
        /town[:\s]*([^,\n]+)/i,
        /,\s*([A-Za-z\s]+),\s*[A-Z]{2}/,
        /address[^,\n]*,\s*([^,\n]+),/i
      ],
      state: [
        /state[:\s]*([A-Z]{2}|[A-Za-z\s]+)/i,
        /province[:\s]*([A-Z]{2}|[A-Za-z\s]+)/i,
        /,\s*([A-Z]{2})\s+\d{5}/,
        /,\s*([A-Za-z\s]+)\s+\d{5}/
      ],
      zipCode: [
        /zip[:\s]*(\d{5}(?:-\d{4})?)/i,
        /postal[:\s]*(\d{5}(?:-\d{4})?)/i,
        /zip\s+code[:\s]*(\d{5}(?:-\d{4})?)/i,
        /(\d{5}(?:-\d{4})?)/
      ],
      country: [
        /country[:\s]*([^,\n]+)/i,
        /nation[:\s]*([^,\n]+)/i
      ],
      
      // Institution Information
      institutionName: [
        /institution[:\s]*([^,\n]+)/i,
        /hospital[:\s]*([^,\n]+)/i,
        /center[:\s]*([^,\n]+)/i,
        /centre[:\s]*([^,\n]+)/i,
        /clinic[:\s]*([^,\n]+)/i,
        /university[:\s]*([^,\n]+)/i,
        /college[:\s]*([^,\n]+)/i,
        /organization[:\s]*([^,\n]+)/i,
        /organisation[:\s]*([^,\n]+)/i,
        /company[:\s]*([^,\n]+)/i
      ],
      department: [
        /department[:\s]*([^,\n]+)/i,
        /dept[:\s]*([^,\n]+)/i,
        /division[:\s]*([^,\n]+)/i,
        /unit[:\s]*([^,\n]+)/i,
        /section[:\s]*([^,\n]+)/i
      ],
      
      // Regulatory Information
      irbContact: [
        /irb[:\s]*([^,\n]+)/i,
        /institutional\s+review\s+board[:\s]*([^,\n]+)/i,
        /ethics[:\s]*([^,\n]+)/i,
        /review\s+board[:\s]*([^,\n]+)/i
      ],
      licenseNumber: [
        /license[:\s]*([A-Z0-9\-]+)/i,
        /licence[:\s]*([A-Z0-9\-]+)/i,
        /license\s+number[:\s]*([A-Z0-9\-]+)/i,
        /lic[:\s]*([A-Z0-9\-]+)/i,
        /permit[:\s]*([A-Z0-9\-]+)/i
      ],
      deaNumber: [
        /dea[:\s]*([A-Z0-9\-]+)/i,
        /dea\s+number[:\s]*([A-Z0-9\-]+)/i,
        /drug\s+enforcement[:\s]*([A-Z0-9\-]+)/i
      ],
      taxId: [
        /tax\s+id[:\s]*([0-9\-]+)/i,
        /ein[:\s]*([0-9\-]+)/i,
        /federal\s+id[:\s]*([0-9\-]+)/i,
        /tax\s+number[:\s]*([0-9\-]+)/i
      ],
      npiNumber: [
        /npi[:\s]*([0-9]+)/i,
        /npi\s+number[:\s]*([0-9]+)/i,
        /national\s+provider[:\s]*([0-9]+)/i
      ],
      
      // Personnel
      coordinator: [
        /coordinator[:\s]*([^,\n]+)/i,
        /study\s+coordinator[:\s]*([^,\n]+)/i,
        /research\s+coordinator[:\s]*([^,\n]+)/i,
        /clinical\s+coordinator[:\s]*([^,\n]+)/i,
        /trial\s+coordinator[:\s]*([^,\n]+)/i
      ],
      subInvestigator: [
        /sub[:\s]*investigator[:\s]*([^,\n]+)/i,
        /co[:\s]*investigator[:\s]*([^,\n]+)/i,
        /associate[:\s]*investigator[:\s]*([^,\n]+)/i,
        /assistant[:\s]*investigator[:\s]*([^,\n]+)/i
      ],
      title: [
        /title[:\s]*([^,\n]+)/i,
        /position[:\s]*([^,\n]+)/i,
        /role[:\s]*([^,\n]+)/i,
        /designation[:\s]*([^,\n]+)/i
      ],
      
      // Additional common fields
      website: [
        /website[:\s]*([^\s\n]+)/i,
        /url[:\s]*([^\s\n]+)/i,
        /(https?:\/\/[^\s\n]+)/i
      ],
      specialty: [
        /specialty[:\s]*([^,\n]+)/i,
        /specialization[:\s]*([^,\n]+)/i,
        /focus[:\s]*([^,\n]+)/i
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
    
    // First pass: exact pattern matching
    for (const [fieldType, patterns] of Object.entries(this.fieldPatterns)) {
      for (const pattern of patterns) {
        const match = unstructuredData.match(pattern);
        if (match) {
          extracted[fieldType] = {
            value: match[1] ? match[1].trim() : match[0].trim(),
            confidence: this.confidence.calculatePatternConfidence(pattern, match),
            pattern: pattern.toString(),
            method: 'regex'
          };
          break; // Use first match for each field type
        }
      }
    }

    // Second pass: flexible text extraction for common patterns
    this.extractFlexiblePatterns(unstructuredData, extracted);
    
    return extracted;
  }

  extractFlexiblePatterns(text, extracted) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    for (const line of lines) {
      // Try to extract key-value pairs from lines like "Key: Value"
      const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
      if (colonMatch) {
        const key = colonMatch[1].trim().toLowerCase();
        const value = colonMatch[2].trim();
        
        if (value.length > 0 && value.length < 200) {
          // Map common field names to our data types
          const fieldMapping = this.getFieldMapping(key);
          if (fieldMapping && !extracted[fieldMapping]) {
            extracted[fieldMapping] = {
              value: value,
              confidence: 0.7,
              pattern: 'flexible_colon',
              method: 'flexible'
            };
          }
        }
      }
      
      // Extract standalone emails and phones that might be missed
      if (!extracted.email) {
        const emailMatch = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) {
          extracted.email = {
            value: emailMatch[1],
            confidence: 0.9,
            pattern: 'standalone_email',
            method: 'flexible'
          };
        }
      }
      
      if (!extracted.phone) {
        const phoneMatch = line.match(/(\(?[\d\s\-\.\(\)]{10,})/);
        if (phoneMatch && phoneMatch[1].replace(/\D/g, '').length >= 10) {
          extracted.phone = {
            value: phoneMatch[1],
            confidence: 0.8,
            pattern: 'standalone_phone',
            method: 'flexible'
          };
        }
      }
    }
  }

  getFieldMapping(key) {
    const mappings = {
      'name': 'fullName',
      'full name': 'fullName',
      'contact name': 'fullName',
      'first name': 'firstName',
      'last name': 'lastName',
      'email': 'email',
      'e-mail': 'email',
      'mail': 'email',
      'phone': 'phone',
      'telephone': 'phone',
      'tel': 'phone',
      'mobile': 'phone',
      'cell': 'phone',
      'fax': 'fax',
      'address': 'address',
      'street': 'address',
      'location': 'address',
      'city': 'city',
      'state': 'state',
      'zip': 'zipCode',
      'postal': 'zipCode',
      'country': 'country',
      'institution': 'institutionName',
      'hospital': 'institutionName',
      'organization': 'institutionName',
      'company': 'institutionName',
      'department': 'department',
      'dept': 'department',
      'title': 'title',
      'position': 'title',
      'role': 'title',
      'coordinator': 'coordinator',
      'investigator': 'principalInvestigator',
      'pi': 'principalInvestigator',
      'doctor': 'principalInvestigator',
      'license': 'licenseNumber',
      'dea': 'deaNumber',
      'tax id': 'taxId',
      'ein': 'taxId',
      'npi': 'npiNumber',
      'website': 'website',
      'url': 'website',
      'specialty': 'specialty'
    };
    
    return mappings[key] || null;
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
    const fieldLabel = formField.label ? formField.label.toLowerCase() : '';
    const fieldContext = formField.context ? formField.context.toLowerCase() : '';
    const fieldSearchText = formField.searchText || '';
    const fieldCategory = formField.fieldCategory || 'general';
    
    // Combine all text for matching
    const fieldText = `${fieldName} ${fieldId} ${fieldLabel} ${fieldContext} ${fieldSearchText}`;
    
    let bestMatch = null;
    let highestScore = 0;
    
    for (const [dataType, data] of Object.entries(extractedData)) {
      let score = this.calculateFieldMatchScore(fieldText, dataType, formField.type, fieldCategory);
      
      // Boost score for category matches
      if (this.categoryMatches(fieldCategory, dataType)) {
        score += 0.3;
      }
      
      // Lower threshold for better coverage - was 0.3, now 0.15
      if (score > highestScore && score > 0.15) {
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

  categoryMatches(fieldCategory, dataType) {
    const categoryMappings = {
      'email': ['email'],
      'phone': ['phone', 'fax'],
      'name': ['firstName', 'lastName', 'fullName', 'principalInvestigator'],
      'address': ['address', 'city', 'state', 'zipCode', 'country'],
      'organization': ['institutionName', 'department'],
      'title': ['title', 'specialty'],
      'identifier': ['licenseNumber', 'deaNumber', 'taxId', 'npiNumber']
    };
    
    const mappedTypes = categoryMappings[fieldCategory] || [];
    return mappedTypes.includes(dataType);
  }

  calculateFieldMatchScore(fieldText, dataType, fieldType, fieldCategory) {
    // Enhanced keyword matching with more comprehensive coverage
    const keywords = {
      principalInvestigator: ['investigator', 'pi', 'principal', 'doctor', 'dr', 'physician', 'md', 'phd'],
      firstName: ['first', 'fname', 'given', 'forename'],
      lastName: ['last', 'lname', 'surname', 'family', 'lastname'],
      fullName: ['name', 'fullname', 'contact', 'person', 'individual'],
      phone: ['phone', 'tel', 'telephone', 'contact', 'mobile', 'cell', 'number'],
      email: ['email', 'mail', 'contact', '@'],
      fax: ['fax', 'facsimile'],
      address: ['address', 'street', 'location', 'addr', 'avenue', 'road', 'drive', 'lane'],
      city: ['city', 'town', 'municipality'],
      state: ['state', 'province', 'region'],
      zipCode: ['zip', 'postal', 'code', 'postcode'],
      country: ['country', 'nation'],
      institutionName: ['institution', 'hospital', 'center', 'clinic', 'organization', 'org', 'company', 'university', 'college'],
      department: ['department', 'dept', 'division', 'unit', 'section'],
      coordinator: ['coordinator', 'manager', 'admin', 'assistant'],
      licenseNumber: ['license', 'licence', 'lic', 'permit', 'certification', 'cert'],
      deaNumber: ['dea', 'drug', 'enforcement'],
      taxId: ['tax', 'ein', 'federal', 'employer'],
      npiNumber: ['npi', 'provider', 'national'],
      title: ['title', 'position', 'role', 'job', 'designation'],
      specialty: ['specialty', 'specialization', 'focus', 'area'],
      website: ['website', 'url', 'site', 'web', 'http'],
      irbContact: ['irb', 'review', 'board', 'ethics', 'committee'],
      subInvestigator: ['sub', 'co', 'associate', 'assistant', 'secondary']
    };
    
    const dataKeywords = keywords[dataType] || [];
    let score = 0;
    
    // Check for keyword matches with partial scoring
    for (const keyword of dataKeywords) {
      if (fieldText.includes(keyword)) {
        score += 0.4;
        // Bonus for exact word matches
        const wordRegex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (wordRegex.test(fieldText)) {
          score += 0.2;
        }
      }
    }
    
    // Boost score for exact data type matches
    if (fieldText.includes(dataType.toLowerCase())) {
      score += 0.6;
    }
    
    // Special handling for common abbreviations and variations
    const abbreviations = {
      firstName: ['fn', 'f_name', 'firstname'],
      lastName: ['ln', 'l_name', 'lastname'],
      email: ['e_mail', 'email_address', 'mail_address'],
      phone: ['ph', 'tel_no', 'phone_no', 'contact_no'],
      address: ['addr', 'address_1', 'address1', 'street_addr'],
      zipCode: ['zip_code', 'postal_code', 'postcode'],
      institutionName: ['inst', 'hosp', 'org_name', 'company_name']
    };
    
    const abbrevs = abbreviations[dataType] || [];
    for (const abbrev of abbrevs) {
      if (fieldText.includes(abbrev)) {
        score += 0.3;
      }
    }
    
    // Field type compatibility scoring
    const typeCompatibility = this.getTypeCompatibility(fieldType, dataType);
    score *= typeCompatibility;
    
    // Category bonus (if provided)
    if (fieldCategory && this.categoryMatches(fieldCategory, dataType)) {
      score += 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  getTypeCompatibility(formFieldType, dataType) {
    const compatibility = {
      email: { 
        email: 1.0,
        fullName: 0.3 // Sometimes name fields accept emails
      },
      tel: { 
        phone: 1.0, 
        fax: 0.9,
        npiNumber: 0.7,
        licenseNumber: 0.6
      },
      text: { 
        '*': 0.9 // Text fields can accept most data
      },
      textarea: { 
        address: 1.0,
        specialty: 0.9,
        '*': 0.7
      },
      number: { 
        zipCode: 1.0, 
        npiNumber: 0.9,
        licenseNumber: 0.8, 
        taxId: 0.8,
        deaNumber: 0.7
      },
      url: {
        website: 1.0,
        email: 0.3
      },
      date: {
        '*': 0.2 // Dates rarely match our text data
      },
      // Handle input types without explicit type
      input: {
        '*': 0.8
      }
    };
    
    const fieldCompat = compatibility[formFieldType] || compatibility['input'];
    if (!fieldCompat) return 0.6; // Default compatibility
    
    return fieldCompat[dataType] || fieldCompat['*'] || 0.4;
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