export const localConfig = {
    defaultServer: 'dns.example.com',
    keys: [
        {
            id: 'internal',
            name: 'Internal View',
            server: 'internal.dns.example.com',
            keyName: 'internal-key-name',
            keyValue: 'base64-encoded-key-value==',
            algorithm: 'hmac-sha512',
            zones: ['example.internal']
        }
    ]
}; 