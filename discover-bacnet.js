const bacnet = require('bacstack');

// Create a BACnet client
const client = new bacnet({
  port: 47808,                      // Default BACnet port
  interface: '0.0.0.0',        // Replace with your local IP
  broadcastAddress: '192.168.3.255',// Use your subnet broadcast address
  adpuTimeout: 6000
});

// Listen for I-Am responses
client.on('iAm', (device) => {
  console.log(`BACnet Device Found:
  - Device ID: ${device.deviceId}
  - IP Address: ${device.address}
  `);
});

// Send Who-Is after short delay
setTimeout(() => {
  console.log('Sending Who-Is...');
  client.whoIs();
}, 1000);

// Auto-close after 30 seconds
setTimeout(() => {
  client.close();
  console.log('Scan complete. Closing...');
}, 30000);
