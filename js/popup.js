// Popup script for Clinical Research Form Filler
class PopupManager {
  constructor() {
    this.sites = [];
    this.currentSite = null;
    this.formStats = { forms: 0, fields: 0 };
    this.editingSiteId = null;
    
    this.initializeElements();
    this.setupEventListeners();
    this.loadSites();
    this.updateFormStats();
  }

  initializeElements() {
    // Main elements
    this.siteSelect = document.getElementById('siteSelect');
    this.fillFormsBtn = document.getElementById('fillFormsBtn');
    this.manageSitesBtn = document.getElementById('manageSitesBtn');
    this.formsCount = document.getElementById('formsCount');
    this.fieldsCount = document.getElementById('fieldsCount');
    this.learningStatus = document.getElementById('learningStatus');

    // Modal elements
    this.siteModal = document.getElementById('siteModal');
    this.siteListModal = document.getElementById('siteListModal');
    this.closeModal = document.getElementById('closeModal');
    this.closeSiteListModal = document.getElementById('closeSiteListModal');
    this.modalTitle = document.getElementById('modalTitle');
    this.siteForm = document.getElementById('siteForm');
    this.siteName = document.getElementById('siteName');
    this.siteData = document.getElementById('siteData');
    this.cancelBtn = document.getElementById('cancelBtn');
    this.addNewSiteBtn = document.getElementById('addNewSiteBtn');
    this.sitesList = document.getElementById('sitesList');
  }

  setupEventListeners() {
    // Site selection
    this.siteSelect.addEventListener('change', (e) => {
      this.selectSite(e.target.value);
    });

    // Action buttons
    this.fillFormsBtn.addEventListener('click', () => {
      this.fillForms();
    });

    this.manageSitesBtn.addEventListener('click', () => {
      this.showSiteListModal();
    });

    // Modal controls
    this.closeModal.addEventListener('click', () => {
      this.hideSiteModal();
    });

    this.closeSiteListModal.addEventListener('click', () => {
      this.hideSiteListModal();
    });

    this.addNewSiteBtn.addEventListener('click', () => {
      this.showAddSiteModal();
    });

    this.cancelBtn.addEventListener('click', () => {
      this.hideSiteModal();
    });

    // Form submission
    this.siteForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSite();
    });

    // Close modals on background click
    this.siteModal.addEventListener('click', (e) => {
      if (e.target === this.siteModal) {
        this.hideSiteModal();
      }
    });

    this.siteListModal.addEventListener('click', (e) => {
      if (e.target === this.siteListModal) {
        this.hideSiteListModal();
      }
    });
  }

  async loadSites() {
    try {
      const result = await chrome.storage.local.get(['clinicalSites']);
      this.sites = result.clinicalSites || [];
      this.updateSiteSelect();
      this.updateSitesList();
    } catch (error) {
      console.error('Error loading sites:', error);
      this.showNotification('Error loading sites', 'error');
    }
  }

  updateSiteSelect() {
    // Clear existing options except the first one
    while (this.siteSelect.children.length > 1) {
      this.siteSelect.removeChild(this.siteSelect.lastChild);
    }

    // Add site options
    this.sites.forEach(site => {
      const option = document.createElement('option');
      option.value = site.id;
      option.textContent = site.name;
      this.siteSelect.appendChild(option);
    });

    // Restore selected site
    if (this.currentSite) {
      this.siteSelect.value = this.currentSite.id;
    }
  }

  selectSite(siteId) {
    if (!siteId) {
      this.currentSite = null;
      this.fillFormsBtn.disabled = true;
      return;
    }

    this.currentSite = this.sites.find(site => site.id === siteId);
    this.fillFormsBtn.disabled = false;

    // Save selected site
    chrome.storage.local.set({ selectedSiteId: siteId });
  }

  async fillForms() {
    if (!this.currentSite) {
      this.showNotification('Please select a site first', 'warning');
      return;
    }

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Send message to content script to fill forms
      await chrome.tabs.sendMessage(tab.id, {
        action: 'fillForms',
        siteData: this.currentSite
      });

      this.showNotification('Form filling initiated!', 'success');
      window.close();
    } catch (error) {
      console.error('Error filling forms:', error);
      this.showNotification('Error filling forms. Make sure the page is loaded.', 'error');
    }
  }

  showSiteListModal() {
    this.updateSitesList();
    this.siteListModal.classList.remove('hidden');
    this.siteListModal.classList.add('fade-in');
  }

  hideSiteListModal() {
    this.siteListModal.classList.add('hidden');
    this.siteListModal.classList.remove('fade-in');
  }

  showAddSiteModal() {
    this.editingSiteId = null;
    this.modalTitle.textContent = 'Add New Site';
    this.siteName.value = '';
    this.siteData.value = '';
    this.hideSiteListModal();
    this.siteModal.classList.remove('hidden');
    this.siteModal.classList.add('fade-in');
    this.siteName.focus();
  }

  showEditSiteModal(siteId) {
    const site = this.sites.find(s => s.id === siteId);
    if (!site) return;

    this.editingSiteId = siteId;
    this.modalTitle.textContent = 'Edit Site';
    this.siteName.value = site.name;
    this.siteData.value = site.data;
    this.hideSiteListModal();
    this.siteModal.classList.remove('hidden');
    this.siteModal.classList.add('fade-in');
    this.siteName.focus();
  }

  hideSiteModal() {
    this.siteModal.classList.add('hidden');
    this.siteModal.classList.remove('fade-in');
    this.editingSiteId = null;
  }

  async saveSite() {
    const name = this.siteName.value.trim();
    const data = this.siteData.value.trim();

    if (!name || !data) {
      this.showNotification('Please fill in all fields', 'warning');
      return;
    }

    try {
      if (this.editingSiteId) {
        // Update existing site
        const siteIndex = this.sites.findIndex(s => s.id === this.editingSiteId);
        if (siteIndex !== -1) {
          this.sites[siteIndex] = {
            ...this.sites[siteIndex],
            name,
            data,
            updatedAt: new Date().toISOString()
          };
        }
      } else {
        // Add new site
        const newSite = {
          id: this.generateId(),
          name,
          data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          usageCount: 0,
          learningData: {}
        };
        this.sites.push(newSite);
      }

      // Save to storage
      await chrome.storage.local.set({ clinicalSites: this.sites });
      
      this.updateSiteSelect();
      this.hideSiteModal();
      this.showNotification('Site saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving site:', error);
      this.showNotification('Error saving site', 'error');
    }
  }

  async deleteSite(siteId) {
    if (!confirm('Are you sure you want to delete this site?')) {
      return;
    }

    try {
      this.sites = this.sites.filter(site => site.id !== siteId);
      await chrome.storage.local.set({ clinicalSites: this.sites });
      
      // Clear selection if deleted site was selected
      if (this.currentSite && this.currentSite.id === siteId) {
        this.currentSite = null;
        this.siteSelect.value = '';
        this.fillFormsBtn.disabled = true;
      }

      this.updateSiteSelect();
      this.updateSitesList();
      this.showNotification('Site deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting site:', error);
      this.showNotification('Error deleting site', 'error');
    }
  }

  updateSitesList() {
    this.sitesList.innerHTML = '';

    if (this.sites.length === 0) {
      this.sitesList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #64748b;">
          <p>No research sites added yet.</p>
          <p style="font-size: 12px; margin-top: 8px;">Click "Add New Site" to get started.</p>
        </div>
      `;
      return;
    }

    this.sites.forEach(site => {
      const siteItem = document.createElement('div');
      siteItem.className = 'site-item';
      siteItem.innerHTML = `
        <div class="site-info">
          <h3>${this.escapeHtml(site.name)}</h3>
          <p>Created: ${new Date(site.createdAt).toLocaleDateString()}</p>
          <p>Used: ${site.usageCount || 0} times</p>
        </div>
        <div class="site-actions">
          <button class="btn secondary edit-btn" data-site-id="${site.id}">Edit</button>
          <button class="btn secondary delete-btn" data-site-id="${site.id}">Delete</button>
        </div>
      `;

      // Add event listeners
      const editBtn = siteItem.querySelector('.edit-btn');
      const deleteBtn = siteItem.querySelector('.delete-btn');

      editBtn.addEventListener('click', () => {
        this.showEditSiteModal(site.id);
      });

      deleteBtn.addEventListener('click', () => {
        this.deleteSite(site.id);
      });

      this.sitesList.appendChild(siteItem);
    });
  }

  async updateFormStats() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      chrome.tabs.sendMessage(tab.id, { action: 'getFormStats' }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not loaded or page not compatible
          this.formStats = { forms: 0, fields: 0 };
        } else if (response) {
          this.formStats = response;
        }
        
        this.formsCount.textContent = this.formStats.forms;
        this.fieldsCount.textContent = this.formStats.fields;
      });
    } catch (error) {
      console.error('Error updating form stats:', error);
    }
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      z-index: 10000;
      animation: slideIn 0.3s ease;
      max-width: 300px;
    `;

    // Set background color based on type
    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    };
    notification.style.backgroundColor = colors[type] || colors.info;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});

// Add CSS for notification animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
`;
document.head.appendChild(style);