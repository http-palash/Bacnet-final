document.addEventListener('DOMContentLoaded', () => {
    const discoverButton = document.getElementById('discover-btn');
    const deviceList = document.getElementById('device-list');
  
    discoverButton.addEventListener('click', () => {
      discoverDevices();
    });
  
    function discoverDevices() {
      deviceList.innerHTML = '<p>🔄 Scanning for BACnet devices...</p>';
  
      fetch('/discover-bacnet')
        .then(response => {
          if (!response.ok) throw new Error('Failed to fetch BACnet devices');
          return response.json();
        })
        .then(devices => {
          deviceList.innerHTML = '';
  
          if (!devices.length) {
            deviceList.innerHTML = '<p>No devices found.</p>';
            return;
          }
  
          devices.forEach(device => {
            const div = document.createElement('div');
            div.className = 'device-card';
            div.innerHTML = `
              <h3>📡 Device ID: ${device.deviceId}</h3>
              <p><strong>IP:</strong> ${device.address}</p>
              <label>Instance: <input type="number" class="instance-input" placeholder="e.g. 53" /></label>
              <br/>
              <label>Value: <input type="number" class="value-input" placeholder="e.g. 0 to 100" /></label>
              <br/>
              <button class="send-btn">Send</button>
              <p class="status-msg" style="margin-top: 10px;"></p>
            `;
  
            div.querySelector('.send-btn').addEventListener('click', async () => {
              const instance = div.querySelector('.instance-input').value;
              const value = div.querySelector('.value-input').value;
              const statusMsg = div.querySelector('.status-msg');
  
              if (instance === '' || value === '') {
                statusMsg.style.color = 'red';
                statusMsg.textContent = '❗ Please enter both instance and value.';
                return;
              }
  
              try {
                statusMsg.style.color = 'black';
                statusMsg.textContent = '📤 Sending...';
  
                const res = await fetch('/control-bacnet', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    deviceId: device.deviceId,
                    ip: device.address,
                    instance: parseInt(instance),
                    value: parseFloat(value),
                    objectType: 'analogValue' // Can change if you need binaryOutput etc
                  })
                });
  
                const result = await res.json();
  
                if (res.ok) {
                  statusMsg.style.color = 'green';
                  statusMsg.textContent = `✅ ${result.message}`;
                } else {
                  statusMsg.style.color = 'red';
                  statusMsg.textContent = `❌ ${result.error || 'Unknown error from server'}`;
                }
              } catch (err) {
                statusMsg.style.color = 'red';
                statusMsg.textContent = '❌ Network error. See console for details.';
                console.error(err);
              }
            });
  
            deviceList.appendChild(div);
          });
        })
        .catch(err => {
          deviceList.innerHTML = `<p style="color:red;">❌ Error: ${err.message}</p>`;
        });
    }
  });
  