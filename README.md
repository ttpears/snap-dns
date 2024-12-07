# Snap DNS

A web-based DNS management interface for managing DNS zones and records using BIND's nsupdate utility.

## Features

- 🔄 Real-time DNS record management
- 💾 Backup and restore functionality
- 📝 Multi-line record support (SOA, TXT, etc.)
- 🔔 Webhook notifications (Slack, Discord, Teams, Mattermost)
- 📋 Pending changes management with undo/redo
- 🔒 TSIG key authentication
- 📱 Responsive design
- 🔍 Advanced record filtering and sorting
- 🔄 Reverse DNS (PTR) record management with live preview
- 📊 Record comparison and diff views
- 💡 Intelligent record validation

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
- TSIG key management with zone assignments
- Webhook notifications (multiple providers)
- Default TTL and display settings
- Import/Export functionality

## Usage

### Managing Records
1. Select a zone from the dropdown
2. View, add, modify, or delete DNS records
3. Changes are staged in the pending changes drawer
4. Review and apply changes with undo/redo support

### PTR Records
- Automatic reverse DNS formatting
- Live preview of PTR record structure
- Validation for reverse DNS zones
- IP address to PTR name conversion

### Record Types
Support for all common DNS record types:
- A/AAAA records
- CNAME records
- MX records with priority
- TXT records (including service verification records)
- SRV records
- PTR records
- CAA records
- SSHFP records
- SOA records

### Backup & Restore
1. Create snapshots of zones
2. Compare snapshots with current zone state
3. Selective record restoration
4. Export/Import functionality
5. Automatic backup before changes

### Multi-line Records
Special handling for:
- SOA records with field validation
- TXT records with proper quoting
- MX records with preferences
- SRV records with service definitions

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
- AddDNSRecord: Intelligent record creation
- PendingChangesDrawer: Change management with undo/redo
- Snapshots: Backup and comparison functionality

### Services
- dnsService: DNS record operations with error handling
- backupService: Snapshot and restore operations
- notificationService: Multi-provider webhook support
- validationService: Record validation and formatting

## Security Considerations

1. TSIG Key Protection
   - Secure key storage
   - Encrypted transmission
   - Per-zone authentication

2. Input Validation
   - Comprehensive record validation
   - Safe handling of special characters
   - Protection against invalid records

3. Access Control
   - Zone-specific key restrictions
   - Operation logging
   - Change tracking and history

## Error Handling

- User-friendly error messages
- Detailed validation feedback
- Specific error codes and descriptions
- Development mode debugging
- Operation rollback support

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
