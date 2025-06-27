const express = require('express');
const bodyParser = require('body-parser');
const dns = require('dns').promises;
const arp = require('node-arp');
const axios = require('axios');
const { exec } = require('child_process');
const bacnet = require('bacstack');
const cheerio = require('cheerio');

const app = express();
const port = 3000;

// Middleware to parse JSON requests and serve static files
app.use(bodyParser.json());
app.use(express.static('public'));

// Utility: Get manufacturer from MAC address
async function getManufacturer(mac) {
  if (!mac || mac === 'Unknown') return 'Unknown';
  try {
    const url = `https://maclookup.app/search/result?mac=${mac}`;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const metaContent = $('meta[name="description"]').attr('content');
    if (!metaContent) return 'Unknown';

    const match = metaContent.match(/Vendor\/Company:\s*([^,]+)/);
    const manufacturer = match ? match[1].trim() : 'Unknown';

    return manufacturer;
  } catch (err) {
    console.error(`Error fetching vendor for MAC ${mac}:`, err.message);
    return 'Unknown';
  }
}

// Utility: Get MAC from IP using ARP
function getMacFromIP(ip) {
  return new Promise((resolve, reject) => {
    arp.getMAC(ip, (err, mac) => {
      if (err || !mac) resolve('Unknown');
      else resolve(mac);
    });
  });
}

// Utility: Reverse DNS lookup for hostname
async function getHostname(ip) {
  try {
    const hostnames = await dns.reverse(ip);
    return hostnames[0] || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// Utility: Ping IP to check if it's reachable
function pingIP(ip) {
  return new Promise((resolve, reject) => {
    exec(`ping -n 1 -w 1000 ${ip}`, (error, stdout, stderr) => {
      if (error || stderr) reject('unreachable');
      else resolve('reachable');
    });
  });
}

// Generate IP list in range
function generateIPs(startIP, endIP) {
  const ips = [];
  const base = startIP.split('.').slice(0, 3).join('.');
  const start = parseInt(startIP.split('.')[3]);
  const end = parseInt(endIP.split('.')[3]);

  for (let i = start; i <= end; i++) {
    ips.push(`${base}.${i}`);
  }
  return ips;
}

// Core scan function
async function scanIPRange(startIP, endIP) {
  const ips = generateIPs(startIP, endIP);
  const results = [];

  const batchSize = 10;
  for (let i = 0; i < ips.length; i += batchSize) {
    const batch = ips.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(async (ip) => {
      try {
        const pingStatus = await pingIP(ip);
        if (pingStatus === 'reachable') {
          const mac = await getMacFromIP(ip);
          const hostname = await getHostname(ip);
          const manufacturer = await getManufacturer(mac);
          const status = mac === 'Unknown' ? 'Inactive' : 'Active';
          return { IP: ip, MAC: mac, Status: status, Hostname: hostname, Manufacturer: manufacturer };
        } else {
          return { IP: ip, Status: 'Unreachable', MAC: 'Unknown', Hostname: 'Unknown', Manufacturer: 'Unknown' };
        }
      } catch {
        return { IP: ip, Status: 'Error', MAC: 'Unknown', Hostname: 'Unknown', Manufacturer: 'Unknown' };
      }
    }));

    results.push(...batchResults);
  }

  return results;
}

// Serve the root route and render scanip.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/scanip.html');
});

// POST /scan endpoint with macOnly support
app.post('/scan', async (req, res) => {
  const { startIP, endIP, macOnly } = req.body;

  if (!startIP || !endIP) {
    return res.status(400).json({ error: 'Start and end IP are required' });
  }

  try {
    const results = await scanIPRange(startIP, endIP);
    const filteredResults = macOnly
      ? results.filter(device => device.MAC && device.MAC !== 'Unknown')
      : results;

    res.json(filteredResults);
  } catch (err) {
    res.status(500).json({ error: 'Error scanning IP range' });
  }
});

// BACnet Device Discovery
app.get('/discover-bacnet', async (req, res) => {
  const client = new bacnet({
    port: 47808,
    interface: '192.168.3.81',  // Adjust the interface address
    broadcastAddress: '192.168.3.255',  // Adjust the broadcast address
    adpuTimeout: 5000,  // Adjust the timeout if necessary
  });

  const discovered = [];

  client.on('iAm', (device) => {
    discovered.push({
      deviceId: device.deviceId,
      address: device.address,
      instance: device.deviceId, // This is typically the device instance
    });
  });

  client.whoIs();  // Send Who-Is request

  // Wait for responses for 5 seconds
  setTimeout(() => {
    client.close();  // Close the connection after waiting
    res.json(discovered);  // Send discovered devices with detailed information
  }, 5000); // Adjust the timeout if necessary
});

// Control BACnet device
app.post('/control-bacnet', async (req, res) => {
  const { deviceId, ip, instance, value, objectType } = req.body;

  console.log("Received BACnet control payload:", req.body);

  // Parse and validate
  const deviceIdInt = parseInt(deviceId);
  const instanceInt = parseInt(instance);
  const valueParsed = parseFloat(value);

  if (isNaN(deviceIdInt) || isNaN(instanceInt) || isNaN(valueParsed)) {
    return res.status(400).json({ error: 'Invalid deviceId, instance, or value' });
  }

  const client = new bacnet({
    interface: '192.168.3.81',          // ✅ Match your working interface
    broadcastAddress: '192.168.3.255',
    adpuTimeout: 15000,
  });

  const objectTypeEnum = {
    analogValue: bacnet.enum.ObjectType.ANALOG_VALUE,
    binaryOutput: bacnet.enum.ObjectType.BINARY_OUTPUT,
    binaryValue: bacnet.enum.ObjectType.BINARY_VALUE,
  };

  const selectedType = objectTypeEnum[objectType] || bacnet.enum.ObjectType.ANALOG_VALUE;

  const objectId = {
    type: selectedType,
    instance: instanceInt,
  };

  // Determine value type for BACnet
  let bacnetValue;
  if (selectedType === bacnet.enum.ObjectType.BINARY_OUTPUT || selectedType === bacnet.enum.ObjectType.BINARY_VALUE) {
    bacnetValue = [{ type: bacnet.enum.ApplicationTags.ENUMERATED, value: parseInt(valueParsed) }];
  } else {
    bacnetValue = [{ type: bacnet.enum.ApplicationTags.REAL, value: parseFloat(valueParsed) }];
  }

  console.log(`Attempting to write value ${valueParsed} to ${ip}, object instance ${instanceInt}, type ${objectType}...`);

  client.writeProperty(ip, objectId, bacnet.enum.PropertyIdentifier.PRESENT_VALUE, bacnetValue, { priority: 8 }, (err, result) => {
    client.close();  // Always close client after operation
    if (err) {
      console.error('BACnet write failed:', err.message || err);
      return res.status(500).json({
        error: `BACnet write error: ${err.message || 'Unknown error'}`
      });
    }
    console.log('BACnet write successful:', result);
    return res.json({ message: `Successfully wrote value ${valueParsed} to device ${deviceIdInt}` });
  });
});
    
//   } catch (err) {
//     console.error(`Caught error: ${err.message}`);
//     return res.status(500).json({
//       error: `Exception: ${(err && err.message) || 'Unknown error'}`
//     });
//   } finally {
//     client.close();
//   }
// });

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
