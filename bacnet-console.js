const bacnet = require('bacstack');

// Create BACnet client
const client = new bacnet({
  port: 47808,
  interface: '192.168.3.81', // your IP address
  broadcastAddress: '192.168.3.255',
  adpuTimeout: 6000
});

// const targetIp = '192.168.3.156';
const targetIp = '192.168.3.86';

// Common object types and small instance range to probe
const objectTypes = [
  bacnet.enum.ObjectType.BINARY_OUTPUT,
  bacnet.enum.ObjectType.BINARY_INPUT,
  bacnet.enum.ObjectType.ANALOG_OUTPUT,
  bacnet.enum.ObjectType.ANALOG_INPUT,
];

const maxInstancesToTry = 10;

// Function to try next object type and instance
function tryNext(typeIndex = 0, instance = 0) {
  if (typeIndex >= objectTypes.length) {
    console.log('Finished testing all object types.');
    client.close();
    return;
  }

  const type = objectTypes[typeIndex];
  const objectId = {type, instance};

  // Try reading the PRESENT_VALUE property of the current object
  client.readProperty(targetIp, objectId, bacnet.enum.PropertyIdentifier.PRESENT_VALUE, (err, value) => {
    const typeName = Object.keys(bacnet.enum.ObjectType).find(k => bacnet.enum.ObjectType[k] === type);
    if (!err) {
      console.log(`✅ FOUND: Type ${typeName}, Instance ${instance}, Value: ${JSON.stringify(value.values[0].value)}`);
    } else {
      console.log(`❌ Not found: Type ${typeName}, Instance ${instance} - ${err.message}`);
    }

    // Move to the next instance if within range
    const nextInstance = instance + 1;
    if (nextInstance < maxInstancesToTry) {
      tryNext(typeIndex, nextInstance);
    } else {
      // Move to the next object type and start from instance 0
      tryNext(typeIndex + 1, 0);
    }
  });
}

// Start probing
tryNext();
