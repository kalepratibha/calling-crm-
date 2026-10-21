const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

module.exports = {
  PORT: process.env.PORT || 5000,
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-secret-in-production',
  TZ: process.env.APP_TZ || 'Asia/Kolkata',
  DB: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'calling_crm',
  },
  // An Interested client whose account is still not opened after this many days goes back into every executive's "All Clients".
  POOL_RETURN_DAYS: Number(process.env.POOL_RETURN_DAYS || 10),
  // false (default) = the shared pool holds Call back + Not pickup clients (and Interested clients after POOL_RETURN_DAYS).
  // true = Not interested clients are also visible to every executive.
  POOL_INCLUDE_NOT_INTERESTED: String(process.env.POOL_INCLUDE_NOT_INTERESTED || 'false').toLowerCase() === 'true',
  MIN_CALLS: Number(process.env.MIN_CALLS || 6),
  SYNC_MINUTES: Number(process.env.SYNC_MINUTES || 15),
  // Login OTP: executives must enter an OTP the first time they sign in on a new PC / browser.
  //   OTP_MODE=admin  -> OTP is shown to the admin (Executives page) who tells it to the executive   (default, works without SMS)
  //   OTP_MODE=sms    -> OTP is sent by SMS through Powerstext (set SMS_AUTH_KEY)
  //   OTP_MODE=both   -> both
  OTP_MODE: (process.env.OTP_MODE || 'admin').toLowerCase(),
  OTP_FOR_ADMIN: String(process.env.OTP_FOR_ADMIN || 'false').toLowerCase() === 'true',
  // true = the OTP is asked at EVERY sign-in (sent to the executive's mobile by SMS). false = only the first time on a new PC / browser / phone.
  OTP_EVERY_LOGIN: String(process.env.OTP_EVERY_LOGIN || 'false').toLowerCase() === 'true',
  OTP_TTL_MIN: Number(process.env.OTP_TTL_MIN || 10),
  // SMS gateway (Powerstext, DLT registered). Used for the login OTP when OTP_MODE is sms / both.
  SMS: {
    authKey: process.env.SMS_AUTH_KEY || '',
    senderId: process.env.SMS_SENDER_ID || 'DSAENT',
    templateId: process.env.SMS_TEMPLATE_ID || '1607100000000367692',
    route: process.env.SMS_ROUTE || '1',
    apiUrl: process.env.SMS_API_URL || 'http://sms1.powerstext.in/http-tokenkeyapi.php',
    // Must match the DLT-approved template word for word. {otp} is replaced by the code.
    otpText: process.env.SMS_OTP_TEXT || 'Use this verification code {otp} to verify your mobile number on WealthFunds2x DE',
  },
  // Weekly off days for attendance (0 = Sunday ... 6 = Saturday), comma separated. Empty = none.
  WEEKLY_OFF: String(process.env.WEEKLY_OFF ?? '0').split(',').map((s) => s.trim()).filter((s) => s !== '').map(Number),
  // Fresh-client distribution: BEFORE this hour (local time) clients are shared between ALL executives who are not marked absent/leave;
  // FROM this hour only the executives who have signed in (present) share them — absentees' untouched clients go to the present ones.
  DISTRIBUTION_CUTOFF_HOUR: Math.min(23, Math.max(0, Number(process.env.DISTRIBUTION_CUTOFF_HOUR ?? 12))),
  DAY_START_HOUR: 10,
  DAY_END_HOUR: 18,
};
