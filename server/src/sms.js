// SMS sender (Powerstext HTTP API, DLT template). One place for the sender / template settings — see config.js (SMS).
const http = require('http');
const https = require('https');
const { SMS } = require('./config');

// "+91 98765 43210" / "919876543210" / "9876543210" -> "9876543210" (null if it is not a 10-digit Indian mobile)
function tenDigit(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^\d{10}$/.test(d) ? d : null;
}

function sendSms(phone, message) {
  const number = tenDigit(phone);
  if (!number) return Promise.reject(new Error(`"${phone}" is not a valid 10-digit mobile number`));
  if (!SMS.authKey) return Promise.reject(new Error('SMS_AUTH_KEY is missing in server/.env'));
  const params = new URLSearchParams({
    'authentic-key': SMS.authKey, senderid: SMS.senderId, route: SMS.route, number, message, templateid: SMS.templateId,
  });
  const url = `${SMS.apiUrl}?${params.toString()}`;
  const client = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode === 200) { console.log(`[SMS] ${number} -> gateway replied: ${body.trim().slice(0, 200)}`); resolve(body); }
        else reject(new Error(`SMS API failed (${res.statusCode}): ${body.slice(0, 200)}`));
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error('SMS gateway timed out')));
    req.on('error', reject);
  });
}

const sendOtpSms = (phone, otp) => sendSms(phone, SMS.otpText.replace('{otp}', otp));

module.exports = { sendSms, sendOtpSms, tenDigit };
