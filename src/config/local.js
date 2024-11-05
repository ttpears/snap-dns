export const localConfig = {
    defaultServer: '10.0.0.1',  // Your DNS server IP
    keys: [
        {
            id: 'internal',
            name: 'Internal View',
            server: '10.0.0.1',  // Your internal DNS server
            keyName: 'internal-key',
            keyValue: 'your-internal-key-secret==',
            algorithm: 'hmac-sha512',
            zones: ['example.internal', 'other.internal']  // Your internal zones
        },
        {
            id: 'external',
            name: 'External View',
            server: '10.0.0.1',  // Your external DNS server
            keyName: 'external-key',
            keyValue: 'your-external-key-secret==',
            algorithm: 'hmac-sha512',
            zones: ['example.com', 'other.com']  // Your external zones
        }
    ]
}; 