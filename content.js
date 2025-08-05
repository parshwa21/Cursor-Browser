// Content script for Clinical Research Form Filler
class FormFiller {
  constructor() {
    this.forms = [];
    this.fields = [];
    this.filledFields = new Map();
    this.learningData = new Map();
    this.isActive = false;
    
    this.init();
  }

  init() {
    this.setupMessageListener();
    this.detectForms();
    this.setupFormObserver();
    this.setupFieldValidation();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'fillForms':
          await this.fillForms(request.siteData);
          sendResponse({ success: true });
          break;

        case 'getFormStats':
          const stats = this.getFormStats();
          sendResponse(stats);
          break;

        case 'highlightFields':
          this.highlightCompatibleFields(request.siteData);
          sendResponse({ success: true });
          break;

        case 'clearHighlights':
          this.clearHighlights();
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Content script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  detectForms() {
    this.forms = Array.from(document.querySelectorAll('form'));
    this.fields = [];

    this.forms.forEach((form, formIndex) => {
      const formFields = this.extractFormFields(form, formIndex);
      this.fields.push(...formFields);
    });

    // Also detect standalone fields not in forms
    const standaloneFields = this.extractStandaloneFields();
    this.fields.push(...standaloneFields);

    console.log(`Detected ${this.forms.length} forms with ${this.fields.length} total fields`);
  }

  extractFormFields(form, formIndex) {
    const fields = [];
    const formElements = form.querySelectorAll('input, textarea, select');

    formElements.forEach((element, elementIndex) => {
      if (this.isValidFormField(element)) {
        const fieldInfo = this.createFieldInfo(element, formIndex, elementIndex);
        if (fieldInfo) {
          fields.push(fieldInfo);
        }
      }
    });

    return fields;
  }

  extractStandaloneFields() {
    const fields = [];
    const standaloneElements = document.querySelectorAll('input:not(form input), textarea:not(form textarea), select:not(form select)');

    standaloneElements.forEach((element, index) => {
      if (this.isValidFormField(element)) {
        const fieldInfo = this.createFieldInfo(element, -1, index, true);
        if (fieldInfo) {
          fields.push(fieldInfo);
        }
      }
    });

    return fields;
  }

  isValidFormField(element) {
    // Skip hidden, disabled, or readonly fields
    if (element.type === 'hidden' || 
        element.disabled || 
        element.readOnly ||
        element.style.display === 'none' ||
        element.style.visibility === 'hidden') {
      return false;
    }

    // Skip buttons and submits
    if (['button', 'submit', 'reset', 'image'].includes(element.type)) {
      return false;
    }

    // Skip CAPTCHA and security fields
    if (element.name && element.name.toLowerCase().includes('captcha')) {
      return false;
    }

    return true;
  }

  createFieldInfo(element, formIndex, elementIndex, isStandalone = false) {
    const rect = element.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;

    if (!isVisible) return null;

    // Get field label
    const label = this.getFieldLabel(element);
    
    // Get field context (surrounding text)
    const context = this.getFieldContext(element);

    return {
      id: element.id || `field_${formIndex}_${elementIndex}`,
      name: element.name || element.id || element.placeholder || label || `unnamed_${elementIndex}`,
      type: element.type || element.tagName.toLowerCase(),
      tagName: element.tagName.toLowerCase(),
      placeholder: element.placeholder || '',
      label: label,
      context: context,
      value: element.value || '',
      element: element,
      formIndex: isStandalone ? -1 : formIndex,
      elementIndex: elementIndex,
      isStandalone: isStandalone,
      position: rect,
      required: element.required || element.hasAttribute('required'),
      maxLength: element.maxLength || null,
      pattern: element.pattern || null,
      classList: Array.from(element.classList),
      attributes: this.getElementAttributes(element)
    };
  }

  getFieldLabel(element) {
    // Try multiple methods to find the label
    let label = '';

    // Method 1: Associated label element
    if (element.id) {
      const labelElement = document.querySelector(`label[for="${element.id}"]`);
      if (labelElement) {
        label = labelElement.textContent.trim();
      }
    }

    // Method 2: Parent label
    if (!label) {
      const parentLabel = element.closest('label');
      if (parentLabel) {
        label = parentLabel.textContent.replace(element.value || '', '').trim();
      }
    }

    // Method 3: Previous sibling text
    if (!label) {
      const prevElement = element.previousElementSibling;
      if (prevElement && ['label', 'span', 'div', 'p'].includes(prevElement.tagName.toLowerCase())) {
        label = prevElement.textContent.trim();
      }
    }

    // Method 4: aria-label or title
    if (!label) {
      label = element.getAttribute('aria-label') || element.title || '';
    }

    return label;
  }

  getFieldContext(element) {
    const context = [];
    
    // Get text from parent containers
    let parent = element.parentElement;
    let depth = 0;
    
    while (parent && depth < 3) {
      const directText = Array.from(parent.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .filter(text => text.length > 0)
        .join(' ');
      
      if (directText) {
        context.push(directText);
      }
      
      parent = parent.parentElement;
      depth++;
    }
    
    return context.join(' ').substring(0, 200); // Limit context length
  }

  getElementAttributes(element) {
    const attributes = {};
    for (const attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }
    return attributes;
  }

  setupFormObserver() {
    // Watch for dynamic form changes
    const observer = new MutationObserver((mutations) => {
      let shouldRedetect = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          const addedNodes = Array.from(mutation.addedNodes);
          const hasFormElements = addedNodes.some(node => 
            node.nodeType === Node.ELEMENT_NODE && 
            (node.tagName === 'FORM' || node.querySelector('input, textarea, select'))
          );
          
          if (hasFormElements) {
            shouldRedetect = true;
          }
        }
      });
      
      if (shouldRedetect) {
        setTimeout(() => this.detectForms(), 500); // Debounce
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  setupFieldValidation() {
    // Setup validation and learning for filled fields
    document.addEventListener('input', (e) => {
      if (this.isActive && this.filledFields.has(e.target)) {
        this.validateAndLearn(e.target);
      }
    });

    document.addEventListener('blur', (e) => {
      if (this.isActive && this.filledFields.has(e.target)) {
        this.validateAndLearn(e.target);
      }
    });
  }

  async fillForms(siteData) {
    try {
      this.isActive = true;
      this.showProcessingIndicator();

      // Update site usage
      chrome.runtime.sendMessage({
        action: 'updateSiteUsage',
        siteId: siteData.id
      });

      // Get field mappings from background script
      const response = await chrome.runtime.sendMessage({
        action: 'getFieldMappings',
        fields: this.fields.map(f => ({
          id: f.id,
          name: f.name,
          type: f.type,
          label: f.label,
          context: f.context,
          placeholder: f.placeholder
        })),
        siteData: siteData
      });

      if (!response.success) {
        throw new Error(response.error);
      }

      const mappings = response.mappings;
      let filledCount = 0;

      // Apply mappings to form fields
      for (const mapping of mappings) {
        const field = this.fields.find(f => f.id === mapping.fieldId);
        if (field && field.element) {
          if (await this.fillField(field, mapping, siteData)) {
            filledCount++;
          }
        }
      }

      this.hideProcessingIndicator();
      this.showCompletionNotification(filledCount, this.fields.length);

    } catch (error) {
      console.error('Error filling forms:', error);
      this.hideProcessingIndicator();
      this.showErrorNotification('Failed to fill forms: ' + error.message);
    }
  }

  async fillField(field, mapping, siteData) {
    try {
      const element = field.element;
      const value = mapping.mappedValue;

      // Add visual indication
      this.highlightField(element, mapping.confidence);

      // Handle different field types
      let success = false;
      
      switch (field.type) {
        case 'email':
          if (this.isValidEmail(value)) {
            element.value = value;
            success = true;
          }
          break;
          
        case 'tel':
          const cleanedPhone = this.formatPhone(value);
          if (cleanedPhone) {
            element.value = cleanedPhone;
            success = true;
          }
          break;
          
        case 'textarea':
          element.value = value;
          success = true;
          break;
          
        case 'select-one':
          success = this.fillSelectField(element, value);
          break;
          
        case 'checkbox':
          // Handle checkbox based on context
          if (this.shouldCheckBox(value, field.label, field.context)) {
            element.checked = true;
            success = true;
          }
          break;
          
        default:
          // For text and other input types
          element.value = value;
          success = true;
      }

      if (success) {
        // Trigger change events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));

        // Store for learning
        this.filledFields.set(element, {
          mapping: mapping,
          siteData: siteData,
          originalValue: value,
          timestamp: Date.now()
        });

        return true;
      }

    } catch (error) {
      console.error('Error filling field:', error);
    }

    return false;
  }

  fillSelectField(selectElement, value) {
    const options = Array.from(selectElement.options);
    
    // Try exact match first
    let matchedOption = options.find(option => 
      option.value.toLowerCase() === value.toLowerCase() ||
      option.textContent.toLowerCase() === value.toLowerCase()
    );

    // Try partial match
    if (!matchedOption) {
      matchedOption = options.find(option => 
        option.textContent.toLowerCase().includes(value.toLowerCase()) ||
        value.toLowerCase().includes(option.textContent.toLowerCase())
      );
    }

    if (matchedOption) {
      selectElement.value = matchedOption.value;
      return true;
    }

    return false;
  }

  shouldCheckBox(value, label, context) {
    const positiveIndicators = ['yes', 'true', '1', 'agree', 'accept', 'confirm'];
    const checkContext = `${label} ${context}`.toLowerCase();
    
    // If the context suggests this should be checked based on the value
    return positiveIndicators.some(indicator => 
      value.toLowerCase().includes(indicator) ||
      (checkContext.includes('agree') && value.toLowerCase() === 'yes')
    );
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  formatPhone(phone) {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Format US phone numbers
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    
    return phone; // Return original if can't format
  }

  async validateAndLearn(element) {
    const filledData = this.filledFields.get(element);
    if (!filledData) return;

    const currentValue = element.value;
    const originalValue = filledData.originalValue;
    const wasCorrect = currentValue === originalValue;
    
    // Record interaction for learning
    const interaction = {
      siteId: filledData.siteData.id,
      fieldId: filledData.mapping.fieldId,
      predictedValue: originalValue,
      actualValue: currentValue,
      wasCorrect: wasCorrect,
      confidence: filledData.mapping.confidence,
      userFeedback: this.getUserFeedback(element),
      timestamp: Date.now()
    };

    // Send to background for learning
    chrome.runtime.sendMessage({
      action: 'learnFromInteraction',
      interaction: interaction
    });

    // Update field highlighting based on correctness
    if (wasCorrect) {
      this.highlightField(element, 1.0, 'success');
    } else if (currentValue !== originalValue) {
      this.highlightField(element, 0.5, 'corrected');
    }
  }

  getUserFeedback(element) {
    // Simple heuristics for user feedback
    const value = element.value.trim();
    
    if (!value) return 'cleared';
    if (element.classList.contains('error') || element.getAttribute('aria-invalid') === 'true') {
      return 'invalid';
    }
    
    return 'accepted';
  }

  highlightField(element, confidence, status = 'filled') {
    element.classList.remove('crff-highlight', 'crff-success', 'crff-corrected', 'crff-error');
    
    const className = status === 'success' ? 'crff-success' :
                     status === 'corrected' ? 'crff-corrected' :
                     status === 'error' ? 'crff-error' : 'crff-highlight';
    
    element.classList.add(className);
    
    // Add confidence indicator
    element.style.setProperty('--crff-confidence', confidence.toString());
    
    // Remove highlight after delay
    if (status === 'filled') {
      setTimeout(() => {
        element.classList.remove('crff-highlight');
      }, 3000);
    }
  }

  highlightCompatibleFields(siteData) {
    // Highlight fields that can be filled
    this.fields.forEach(field => {
      // Simple highlighting for demonstration
      field.element.classList.add('crff-compatible');
    });
  }

  clearHighlights() {
    const highlightedElements = document.querySelectorAll('.crff-highlight, .crff-compatible, .crff-success, .crff-corrected, .crff-error');
    highlightedElements.forEach(element => {
      element.classList.remove('crff-highlight', 'crff-compatible', 'crff-success', 'crff-corrected', 'crff-error');
    });
  }

  getFormStats() {
    return {
      forms: this.forms.length,
      fields: this.fields.length,
      fillableFields: this.fields.filter(f => f.type !== 'checkbox').length
    };
  }

  showProcessingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'crff-processing';
    indicator.innerHTML = `
      <div class="crff-indicator-content">
        <div class="crff-spinner"></div>
        <span>🧠 AI Processing Forms...</span>
      </div>
    `;
    document.body.appendChild(indicator);
  }

  hideProcessingIndicator() {
    const indicator = document.getElementById('crff-processing');
    if (indicator) {
      indicator.remove();
    }
  }

  showCompletionNotification(filled, total) {
    this.showNotification(`✅ Successfully filled ${filled} out of ${total} fields`, 'success');
  }

  showErrorNotification(message) {
    this.showNotification(`❌ ${message}`, 'error');
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `crff-notification crff-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('crff-show');
    }, 100);

    setTimeout(() => {
      notification.classList.remove('crff-show');
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }
}

// Initialize form filler when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new FormFiller();
  });
} else {
  new FormFiller();
}

// Inject CSS styles
const injectStyles = () => {
  if (document.getElementById('crff-styles')) return;
  
  const styles = document.createElement('style');
  styles.id = 'crff-styles';
  styles.textContent = `
    .crff-highlight {
      background-color: rgba(79, 70, 229, 0.1) !important;
      border: 2px solid rgba(79, 70, 229, 0.5) !important;
      box-shadow: 0 0 5px rgba(79, 70, 229, 0.3) !important;
      transition: all 0.3s ease !important;
    }

    .crff-compatible {
      outline: 2px dashed rgba(34, 197, 94, 0.5) !important;
      outline-offset: 2px !important;
    }

    .crff-success {
      background-color: rgba(34, 197, 94, 0.1) !important;
      border: 2px solid rgba(34, 197, 94, 0.5) !important;
      box-shadow: 0 0 5px rgba(34, 197, 94, 0.3) !important;
    }

    .crff-corrected {
      background-color: rgba(245, 158, 11, 0.1) !important;
      border: 2px solid rgba(245, 158, 11, 0.5) !important;
      box-shadow: 0 0 5px rgba(245, 158, 11, 0.3) !important;
    }

    .crff-error {
      background-color: rgba(239, 68, 68, 0.1) !important;
      border: 2px solid rgba(239, 68, 68, 0.5) !important;
      box-shadow: 0 0 5px rgba(239, 68, 68, 0.3) !important;
    }

    #crff-processing {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: white;
      padding: 15px 20px;
      border-radius: 10px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      animation: crff-slideIn 0.3s ease;
    }

    .crff-indicator-content {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .crff-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top: 2px solid white;
      border-radius: 50%;
      animation: crff-spin 1s linear infinite;
    }

    .crff-notification {
      position: fixed;
      top: 70px;
      right: 20px;
      z-index: 10000;
      padding: 12px 16px;
      border-radius: 8px;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      transform: translateX(100%);
      transition: transform 0.3s ease;
      max-width: 350px;
    }

    .crff-notification.crff-success {
      background-color: #10b981;
    }

    .crff-notification.crff-error {
      background-color: #ef4444;
    }

    .crff-notification.crff-info {
      background-color: #3b82f6;
    }

    .crff-notification.crff-show {
      transform: translateX(0);
    }

    @keyframes crff-slideIn {
      from {
        opacity: 0;
        transform: translateX(100%);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes crff-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  
  document.head.appendChild(styles);
};

// Inject styles when script loads
injectStyles();