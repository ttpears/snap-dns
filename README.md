# Snap DNS

A web-based DNS management interface for managing DNS zones and records using BIND's nsupdate utility.

## Features

- 🔄 Real-time DNS record management
- 💾 Backup and restore functionality
- 📝 Multi-line record support (SOA, TXT, etc.)
- 🔔 Mattermost webhook notifications
- 📋 Pending changes management
- 🔒 TSIG key authentication
- 📱 Responsive design

## Prerequisites

- Docker and Docker Compose
- BIND DNS Server with nsupdate utility
- TSIG keys configured for zones
- Access to DNS server(s)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/ttpears/snap-dns.git
cd snap-dns
```

2. Start the application:
```bash
docker-compose up --build -d
```

The frontend application will be available at http://localhost:3001. Use the Settings page to configure your DNS keys and webhook notifications.

## Configuration

All configuration is handled through the web interface under Settings, including:
- TSIG key management
- Zone assignments
- Webhook notifications

## Usage

### Managing Records
1. Select a zone from the dropdown
2. View, add, modify, or delete DNS records
3. Changes are staged in the pending changes drawer
4. Review and apply changes

### Backup & Restore
1. Select a zone to backup
2. Choose between:
   - Download JSON backup
   - Store backup in browser
3. Restore options:
   - Import from file
   - Restore from stored backup
   - Selective record restoration

### Multi-line Records
Special handling for:
- SOA records
- TXT records
- MX records with preferences
- SRV records

## Development

### Project Structure
```
dns-manager/
├── src/
│   ├── components/      # React components
│   ├── services/        # API and business logic
│   ├── context/         # React context providers
│   ├── utils/          # Helper functions
│   └── types/          # TypeScript definitions
├── backend/            # Express.js backend
└── public/            # Static assets
```

### Key Components
- ZoneEditor: Main interface for record management
- BackupImport: Handles backup/restore functionality
- PendingChangesDrawer: Stages changes before applying

### Services
- dnsService: Handles DNS record operations
- backupService: Manages backup operations
- notificationService: Handles webhook notifications

## Security Considerations

1. TSIG Key Protection
   - Keys stored securely
   - Transmitted only when needed
   - Used for authentication with DNS server

2. Input Validation
   - Record validation before submission
   - Sanitization of DNS values
   - Protection against invalid records

3. Access Control
   - Zone-specific key restrictions
   - Operation logging
   - Change tracking

## Error Handling

The application includes comprehensive error handling for:
- DNS server communication
- Record validation
- Backup/restore operations
- Configuration issues

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - See LICENSE file for details

## Support

For issues and feature requests, please use the GitHub issue tracker.
