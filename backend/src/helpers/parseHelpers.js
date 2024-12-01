function parseDigOutput(output) {
    const records = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
        if (!line.trim() || line.startsWith(';')) {
            continue;
        }

        try {
            const parts = line.split(/\s+/);
            if (parts.length < 4) continue;

            records.push({
                name: parts[0],
                ttl: parseInt(parts[1], 10),
                class: parts[2],
                type: parts[3],
                value: parts.slice(4).join(' ')
            });
        } catch (error) {
            console.error('Error parsing line:', line, error);
        }
    }
    
    return records;
}

function parseSOARecord(lines) {
    const soaText = lines.join(' ').trim();
    const [nameServer, adminEmail] = soaText.split(/\s+/).slice(0, 2);
    
    const numbers = soaText.match(/\(([^)]+)\)/);
    const [serial, refresh, retry, expire, minimum] = numbers ? 
        numbers[1].split(/[;\s]+/).filter(n => !isNaN(parseInt(n))) : [];

    return {
        mname: nameServer,
        rname: adminEmail,
        serial: parseInt(serial) || 0,
        refresh: parseInt(refresh) || 0,
        retry: parseInt(retry) || 0,
        expire: parseInt(expire) || 0,
        minimum: parseInt(minimum) || 0
    };
}

module.exports = {
    parseDigOutput,
    parseSOARecord
}; 