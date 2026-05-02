// Using native fetch to communicate with Brevo API
const sendEmail = async (options) => {
  try {
    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
      console.warn('BREVO_API_KEY is not defined. Skipping email dispatch to:', options.email);
      return;
    }

    const payload = {
      sender: {
        name: 'Ceylon Scholars Academy',
        email: process.env.FROM_EMAIL || 'no-reply@ceylonscholars.com'
      },
      to: [
        {
          email: options.email,
          name: options.name || 'User'
        }
      ],
      subject: options.subject,
      htmlContent: options.htmlContent
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Brevo API Error:', errorData);
      throw new Error(`Email sending failed: ${response.statusText}`);
    }

    console.log(`Email sent successfully to ${options.email}`);
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't crash the server if email fails, just log it
  }
};

/**
 * Send welcome email with temporary password
 */
const sendWelcomeEmail = async (userEmail, name, username, tempPassword) => {
  const htmlContent = `
    <h1>Welcome to Ceylon Scholars Academy</h1>
    <p>Hello ${name},</p>
    <p>Your account has been successfully created. Here are your login details:</p>
    <p><b>Username:</b> ${username}</p>
    <p><b>Temporary Password:</b> ${tempPassword}</p>
    <br/>
    <p>Please login using these credentials. You will be prompted to reset your password immediately upon your first login.</p>
    <p>Best Regards,<br/>Admin Team</p>
  `;

  await sendEmail({
    email: userEmail,
    name,
    subject: 'Welcome - Your Account Credentials',
    htmlContent
  });
};

/**
 * Send OTP for password reset
 */
const sendOtpEmail = async (userEmail, name, otp) => {
  const htmlContent = `
    <h1>Password Reset Request</h1>
    <p>Hello ${name},</p>
    <p>We received a request to reset your password. Here is your One Time Password (OTP):</p>
    <h2>${otp}</h2>
    <p>This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
  `;

  await sendEmail({
    email: userEmail,
    name,
    subject: 'Password Reset OTP',
    htmlContent
  });
};

/**
 * Send confirmation of successful password reset
 */
const sendResetSuccessEmail = async (userEmail, name) => {
  const htmlContent = `
    <h1>Password Reset Successful</h1>
    <p>Hello ${name},</p>
    <p>Your password has been successfully reset. If you did not perform this action, please contact the administrator immediately.</p>
  `;

  await sendEmail({
    email: userEmail,
    name,
    subject: 'Password Reset Confirmation',
    htmlContent
  });
};

module.exports = {
  sendWelcomeEmail,
  sendOtpEmail,
  sendResetSuccessEmail
};
