/**
 * Dummy email sender — logs to console.
 * Replace with Nodemailer/SendGrid when ready.
 */
export const sendMail = (to, subject, text) => {
  console.log('=== EMAIL (dummy) ===');
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body:\n${text}`);
  console.log('====================');
};
