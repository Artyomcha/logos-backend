// const sgMail = require('@sendgrid/mail');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Create reusable transporter using Gmail SMTP or generic SMTP
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpSecure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : smtpPort === 465;
const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_PASS;
const fromEmail = process.env.SMTP_FROM || process.env.GMAIL_FROM || 'noreply@yourdomain.com';

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
});

async function send2FACode(to, code) {
  const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Код доступа Logos AI</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #00e0d3; margin: 0; font-size: 24px;">Logos AI</h1>
              <p style="color: #666; margin: 10px 0 0 0;">Система управления звонками</p>
            </div>
            <h2 style="color: #333; margin-bottom: 20px;">Ваш код доступа</h2>
            <p style="margin-bottom: 20px;">Здравствуйте!</p>
            <p style="margin-bottom: 20px;">Вы запросили код доступа для входа в систему Logos AI.</p>
            <div style="background-color: #f8f9fa; border: 2px solid #00e0d3; border-radius: 8px; padding: 25px; text-align: center; margin: 25px 0;">
              <h1 style="color: #333; font-size: 36px; letter-spacing: 8px; margin: 0; font-weight: bold;">${code}</h1>
            </div>
            <p style="color: #666; font-size: 14px; margin-bottom: 20px;"><strong>⚠️ Важно:</strong> Этот код действителен в течение 10 минут.</p>
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #856404; font-size: 13px;"><strong>Безопасность:</strong> Если вы не запрашивали этот код, проигнорируйте это письмо.</p>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <div style="text-align: center; color: #999; font-size: 12px;">
              <p style="margin: 0;">С уважением,<br>Команда Logos AI</p>
              <p style="margin: 10px 0 0 0;">Это автоматическое письмо, не отвечайте на него</p>
            </div>
          </div>
        </body>
        </html>
      `;

  const mailOptions = {
    to,
    from: { name: 'Logos AI System', address: fromEmail },
    subject: 'Ваш код доступа в Logos AI',
    text: `Здравствуйте!\n\nВы запросили код доступа для входа в систему Logos AI.\n\nВаш код: ${code}\n\nКод действителен 10 минут.\n\nЕсли вы не запрашивали этот код, проигнорируйте это письмо.\n\nС уважением, Команда Logos AI`,
    html,
  };

  return transporter.sendMail(mailOptions);
}

async function sendLoginCredentials(to, email, password, companyName, firstName, lastName) {
  const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #00e0d3;">Добро пожаловать в систему!</h2>
          <p>Здравствуйте, ${firstName} ${lastName}!</p>
          <p>Ваш аккаунт был успешно создан администратором. Используйте следующие данные для входа в систему:</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Данные для входа:</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Пароль:</strong> ${password}</p>
            <p><strong>Компания:</strong> ${companyName}</p>
          </div>
          <p style="color: #666; font-size: 14px;"><strong>Важно:</strong> После первого входа рекомендуется сменить пароль в настройках профиля.</p>
          <p style="margin-top: 30px; color: #999; font-size: 12px;">Если у вас возникли вопросы, обратитесь к администратору системы.</p>
        </div>
      `;

  const mailOptions = {
    to,
    from: fromEmail,
    subject: 'Ваши данные для входа в систему',
    html,
    text: `Добро пожаловать в систему!\n\nЗдравствуйте, ${firstName} ${lastName}!\n\nВаш аккаунт был успешно создан администратором.\nEmail: ${email}\nПароль: ${password}\nКомпания: ${companyName}\n\nВажно: После первого входа рекомендуется сменить пароль в настройках профиля.\n\nЕсли у вас возникли вопросы, обратитесь к администратору системы.`,
  };

  return transporter.sendMail(mailOptions);
}

async function sendPasswordResetCode(to, code) {
  const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #00e0d3;">Сброс пароля</h2>
          <p>Вы запросили сброс пароля для вашего аккаунта.</p>
          <p>Используйте следующий код для подтверждения:</p>
          <div style="background-color: #f5f5f5; padding: 30px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h1 style="color: #333; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h1>
          </div>
          <p style="color: #666; font-size: 14px;"><strong>Важно:</strong> Этот код действителен в течение 10 минут.</p>
          <p style="color: #999; text-align: center; font-size: 12px; margin-top: 30px;">Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</p>
        </div>
      `;

  const mailOptions = {
    to,
    from: fromEmail,
    subject: 'Код для сброса пароля',
    html,
    text: `Сброс пароля\n\nВы запросили сброс пароля для вашего аккаунта.\nКод: ${code}\n\nВажно: Код действителен 10 минут.\n\nЕсли вы не запрашивали сброс, проигнорируйте это письмо.`,
  };

  return transporter.sendMail(mailOptions);
}

// Keep the function name for compatibility, now verifies SMTP transport
async function verifySendGridConnection() {
  try {
    await transporter.verify();
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  send2FACode,
  sendLoginCredentials,
  sendPasswordResetCode,
  verifySendGridConnection,
};