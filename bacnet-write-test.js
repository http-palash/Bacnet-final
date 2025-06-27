const bacnet = require('bacstack');

// BACnet client configuration
const client = new bacnet({
  interface: '192.168.3.81',         // Your local IP address
  broadcastAddress: '192.168.3.255', // Broadcast for your subnet
  adpuTimeout: 10000,                // Timeout in ms
});

// Target device configuration
const deviceIp = '192.168.3.86';       // BACnet device IP
const objectType = bacnet.enum.ObjectType.ANALOG_VALUE;  // Change to BINARY_OUTPUT if needed
const objectInstance = 54;             // Object instance
const valueToWrite = 0;                // The value to write

// Automatically select proper BACnet tag type
let bacnetValue;
if (objectType === bacnet.enum.ObjectType.BINARY_OUTPUT || objectType === bacnet.enum.ObjectType.BINARY_VALUE) {
  bacnetValue = [{ type: bacnet.enum.ApplicationTags.ENUMERATED, value: valueToWrite }];
} else {
  bacnetValue = [{ type: bacnet.enum.ApplicationTags.REAL, value: parseFloat(valueToWrite) }];
}

const objectId = { type: objectType, instance: objectInstance };

console.log(`Checking if object ${objectInstance} exists on device ${deviceIp}...`);

client.readProperty(deviceIp, objectId, bacnet.enum.PropertyIdentifier.PRESENT_VALUE, (readErr, readValue) => {
  if (readErr) {
    console.error('Read failed. Object might not exist or is unreachable.');
    console.error(readErr.message || readErr);
    client.close();
    return;
  }

  console.log(`Current value of object:`, JSON.stringify(readValue.values, null, 2));

  console.log(`Writing value ${valueToWrite} to device at IP ${deviceIp}, object instance ${objectInstance}...`);

  client.writeProperty(deviceIp, objectId, bacnet.enum.PropertyIdentifier.PRESENT_VALUE, bacnetValue,  { priority: 8 },(err, result) => {
    if (err) {
      if (err.message && err.message.includes('Abort')) {
        console.error(`Device aborted the request. Possible causes:\n- Wrong object type or instance\n- Access denied\n- Wrong value type`);
      }
      console.error('Write failed:', err.message || err);
    } else {
      console.log('Write successful:', result);
    }

    client.close();
  });
});
