const nodemailer = require('nodemailer');
require('dotenv').config();

// Проверяем наличие SMTP настроек
console.log('=== SMTP CONFIGURATION ===');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_PORT:', process.env.SMTP_PORT);
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_PASS:', process.env.SMTP_PASS ? 'SET' : 'NOT_SET');
console.log('========================');

// Создаем transporter с базовыми настройками
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  }
});

async function send2FACode(to, code) {
  console.log('=== SENDING 2FA CODE ===');
  console.log('To:', to);
  console.log('From:', process.env.SMTP_USER);
  console.log('Host:', process.env.SMTP_HOST);
  console.log('Port:', process.env.SMTP_PORT);
  
  try {
    console.log('Attempting to send email...');
    const result = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject: 'Your verification code',
      text: `Your verification code: ${code}`,
    });
    console.log('Email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('=== SMTP ERROR ===');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error command:', error.command);
    console.error('Error response:', error.response);
    console.error('==================');
    
    // Если SMTP недоступен, возвращаем специальную ошибку
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'EAUTH') {
      throw new Error('SMTP_UNAVAILABLE');
    }
    throw error;
  }
}

async function sendLoginCredentials(to, email, password, companyName, firstName, lastName) {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject: 'Ваши данные для входа в систему',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #00e0d3;">Добро пожаловать в систему!</h2>
          <p>Здравствуйте, ${firstName} ${lastName}!</p>
          <p>Ваш аккаунт был успешно создан администратором. Используйте следующие данные для входа в систему:</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">Данные для входа:</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Пароль:</strong> ${password}</p>
            <p><strong>Компания:</strong> ${companyName}</p>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            <strong>Важно:</strong> После первого входа рекомендуется сменить пароль в настройках профиля.
          </p>
          
          <p style="margin-top: 30px; color: #999; font-size: 12px;">
            Если у вас возникли вопросы, обратитесь к администратору системы.
          </p>
        </div>
      `,
      text: `
Добро пожаловать в систему!

Здравствуйте, ${firstName} ${lastName}!

Ваш аккаунт был успешно создан администратором. Используйте следующие данные для входа в систему:

Email: ${email}
Пароль: ${password}
Компания: ${companyName}

Важно: После первого входа рекомендуется сменить пароль в настройках профиля.

Если у вас возникли вопросы, обратитесь к администратору системы.
      `,
    });
  } catch (error) {
    console.error('Error sending login credentials:', error);
    throw error;
  }
}

async function sendPasswordResetCode(to, code) {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject: 'Код для сброса пароля',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #00e0d3;">Сброс пароля</h2>
          <p>Вы запросили сброс пароля для вашего аккаунта.</p>
          <p>Используйте следующий код для подтверждения:</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <h3 style="margin-top: 0; color: #333; font-size: 24px;">${code}</h3>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            <strong>Важно:</strong> Код действителен в течение 10 минут. Если вы не запрашивали сброс пароля, проигнорируйте это письмо.
          </p>
        </div>
      `,
      text: `
Сброс пароля

Вы запросили сброс пароля для вашего аккаунта.
Используйте следующий код для подтверждения: ${code}

Важно: Код действителен в течение 10 минут. Если вы не запрашивали сброс пароля, проигнорируйте это письмо.
      `,
    });
  } catch (error) {
    console.error('Error sending password reset code:', error);
    throw error;
  }
}

module.exports = {
  send2FACode,
  sendLoginCredentials,
  sendPasswordResetCode
};