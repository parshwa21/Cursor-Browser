# Clinical Research Form Filler - Chrome Extension

🏥 **AI-Powered Form Automation for Clinical Research Sites**

A Chrome extension that streamlines form-filling tasks for clinical research sites by leveraging AI to intelligently interpret unstructured data and populate web forms automatically.

## 🚀 Features

### Core Functionality
- **AI-Powered Data Interpretation**: Reads and understands unstructured text data from research sites
- **Intelligent Form Mapping**: Automatically maps site information to form fields using contextual AI
- **Multi-Site Management**: Store and manage multiple research sites with custom data fields
- **Real-Time Form Detection**: Automatically detects fillable forms on any webpage
- **Learning System**: Continuously improves accuracy based on user interactions

### Advanced Features
- **Secure Data Storage**: All data is encrypted and stored locally in the browser
- **Privacy Compliant**: GDPR-ready with data export and deletion capabilities
- **Visual Feedback**: Real-time highlighting and confidence indicators
- **Accessibility Support**: Full keyboard navigation and screen reader compatibility
- **Responsive Design**: Works across different screen sizes and devices

## 📋 Installation

### From Source (Development)
1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension will appear in your Chrome toolbar

### Chrome Web Store (Coming Soon)
The extension will be available on the Chrome Web Store once approved.

## 🎯 How to Use

### 1. Adding Research Sites
1. Click the extension icon in your Chrome toolbar
2. Click "Manage Sites" to open the site management interface
3. Click "Add New Site" to create a new research site profile
4. Enter the site name and paste all relevant information in natural language format:

```
Site Name: Memorial Hospital Clinical Research Center
Principal Investigator: Dr. Sarah Johnson, MD
Phone: (555) 123-4567
Email: sarah.johnson@memorial.edu
Address: 123 Medical Center Drive, Suite 400, Boston, MA 02115
IRB Contact: Jennifer Martinez, Phone: (555) 123-4568
Coordinator: Mike Chen, mike.chen@memorial.edu
License Numbers: MA-12345, DEA-AB1234567
Tax ID: 12-3456789

Additional Notes:
- Oncology department specialization
- IRB meets monthly on the 3rd Tuesday
- Preferred contact method: email
```

### 2. Filling Forms
1. Navigate to any webpage with forms
2. Click the extension icon to open the popup
3. Select the appropriate research site from the dropdown
4. Click "Fill Forms" to automatically populate detected form fields
5. Review and adjust any filled information as needed

### 3. Learning from Corrections
- The AI learns from your corrections to improve future accuracy
- Fields that you modify are remembered for similar forms
- Confidence scores increase over time with successful form fills

## 🔧 Technical Architecture

### Components

#### Manifest (manifest.json)
- Chrome Extension v3 manifest
- Defines permissions and entry points
- Configures content scripts and background workers

#### Popup Interface (popup.html + js/popup.js + styles/popup.css)
- Main user interface for site management
- Form statistics and controls
- Modal dialogs for adding/editing sites

#### Content Script (content.js)
- Injected into web pages to detect and fill forms
- Handles form field analysis and population
- Provides visual feedback and learning data collection

#### Background Service Worker (background.js)
- AI processing engine for data interpretation
- Learning system for improving accuracy
- Secure data management and storage

#### Security Layer (js/security.js)
- AES-GCM encryption for sensitive data
- PBKDF2 key derivation for password protection
- Data integrity verification and sanitization

### AI Processing Pipeline

1. **Data Extraction**: Regex patterns extract structured data from unstructured text
2. **Field Mapping**: Intelligent matching between extracted data and form fields
3. **Confidence Scoring**: Each mapping gets a confidence score based on multiple factors
4. **Learning Integration**: User corrections improve future mappings
5. **Security Validation**: All data is sanitized and validated before use

## 🔒 Security & Privacy

### Data Protection
- **Local Storage Only**: All data remains in your browser, never sent to external servers
- **Encryption**: Sensitive data can be encrypted with user-provided passwords
- **Data Integrity**: Checksums verify data hasn't been tampered with
- **Automatic Cleanup**: Old data is automatically removed based on retention policies

### Privacy Compliance
- **No External Communication**: Extension works completely offline
- **User Consent**: Explicit consent required for data processing
- **Data Export**: Full data export available for GDPR compliance
- **Right to Deletion**: Complete data removal with one click

### Security Features
- **Input Sanitization**: All user inputs are sanitized to prevent XSS attacks
- **Rate Limiting**: Protection against brute force attacks
- **Audit Logging**: Security events are logged for monitoring
- **Content Security Policy**: Strict CSP prevents malicious code execution

## 🧪 Supported Form Types

The extension works with most standard web forms including:

- **Contact Information Forms**: Name, email, phone, address fields
- **Registration Forms**: User account creation and profile setup
- **Application Forms**: Job applications, study enrollments
- **Survey Forms**: Research questionnaires and feedback forms
- **Medical Forms**: Patient intake, clinical trial enrollment
- **Administrative Forms**: License applications, regulatory submissions

## 🤖 AI Capabilities

### Pattern Recognition
- **Contact Information**: Emails, phone numbers, addresses
- **Personnel Data**: Principal investigators, coordinators, contacts
- **Regulatory Info**: License numbers, DEA numbers, tax IDs
- **Institution Details**: Hospital names, departments, affiliations

### Learning System
- **Interaction Tracking**: Records successful and failed mappings
- **Pattern Refinement**: Improves regex patterns based on usage
- **Confidence Adjustment**: Adapts confidence scoring over time
- **Site-Specific Learning**: Customizes behavior for each research site

## 🛠️ Development

### Prerequisites
- Chrome Browser (version 88+)
- Basic understanding of JavaScript and Chrome Extensions

### File Structure
```
clinical-research-form-filler/
├── manifest.json              # Extension manifest
├── popup.html                 # Main popup interface
├── content.js                 # Content script for form interaction
├── background.js              # Service worker with AI processing
├── js/
│   ├── popup.js              # Popup interface logic
│   └── security.js           # Security and encryption utilities
├── styles/
│   ├── popup.css             # Popup styling
│   └── inject.css            # Injected page styles
├── icons/                    # Extension icons
└── README.md                 # This file
```

### Building and Testing
1. Make changes to the source files
2. Reload the extension in `chrome://extensions/`
3. Test on various websites with forms
4. Check console logs for debugging information

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📈 Performance

### Optimization Features
- **Lazy Loading**: Components load only when needed
- **Efficient Storage**: Optimized data structures for minimal memory usage
- **Background Processing**: Heavy AI work happens in service worker
- **Caching**: Frequently used patterns are cached for speed

### Browser Compatibility
- **Chrome**: Full support (version 88+)
- **Edge**: Compatible with Chromium-based Edge
- **Other Browsers**: May work with modification

## 🐛 Troubleshooting

### Common Issues

**Extension not detecting forms:**
- Ensure the page has finished loading completely
- Check that forms contain standard input fields
- Verify the extension has necessary permissions

**Form filling not working:**
- Check that a research site is selected
- Verify the site data contains relevant information
- Look for console errors in developer tools

**Security warnings:**
- Review site data for sensitive information patterns
- Use encryption for highly sensitive data
- Check audit logs for security events

### Debug Mode
Enable debug logging by setting `DEBUG = true` in the background script.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Support

For support, questions, or feature requests:
- Open an issue on GitHub
- Check the troubleshooting section above
- Review the extension's audit logs for errors

## 🔮 Roadmap

### Upcoming Features
- **Cloud Sync**: Optional encrypted cloud synchronization
- **Template System**: Pre-built templates for common research sites
- **Bulk Operations**: Fill multiple forms simultaneously
- **Advanced Analytics**: Detailed accuracy and usage statistics
- **Integration APIs**: Connect with popular research management systems

### Long-term Goals
- **Machine Learning**: Advanced ML models for better accuracy
- **Multi-language Support**: International research site support
- **Mobile Companion**: Mobile app for data entry and management
- **Enterprise Features**: Team collaboration and admin controls

---

**Made with ❤️ for Clinical Research Professionals**

*This extension is designed to improve efficiency in clinical research workflows while maintaining the highest standards of data security and privacy.*
