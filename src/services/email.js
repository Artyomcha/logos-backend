const sgMail = require('@sendgrid/mail');
require('dotenv').config();

// Проверяем наличие SendGrid API ключа
console.log('=== SENDGRID CONFIGURATION ===');
console.log('SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'SET' : 'NOT_SET');
console.log('SENDGRID_FROM_EMAIL:', process.env.SENDGRID_FROM_EMAIL || 'NOT_SET');
console.log('=============================');

// Инициализируем SendGrid с API ключом
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

async function send2FACode(to, code) {
  try {
    // Проверяем конфигурацию
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SENDGRID_NOT_CONFIGURED');
    }

    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@yourdomain.com';
    
    console.log('=== SENDGRID EMAIL DETAILS ===');
    console.log('To:', to);
    console.log('From:', fromEmail);
    console.log('Subject: Код подтверждения');
    console.log('Code:', code);
    console.log('=============================');
    
    const msg = {
      to: to,
      from: {
        email: fromEmail,
        name: 'Logos AI System'
      },
      subject: 'Ваш код доступа в Logos AI',
      text: `Здравствуйте!

Вы запросили код доступа для входа в систему Logos AI.

Ваш код: ${code}

Этот код действителен в течение 10 минут.

Если вы не запрашивали этот код, проигнорируйте это письмо.

С уважением,
Команда Logos AI`,
      html: `
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
            
            <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
              <strong>⚠️ Важно:</strong> Этот код действителен в течение 10 минут.
            </p>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #856404; font-size: 13px;">
                <strong>Безопасность:</strong> Если вы не запрашивали этот код, проигнорируйте это письмо и убедитесь, что ваш аккаунт защищен.
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <div style="text-align: center; color: #999; font-size: 12px;">
              <p style="margin: 0;">С уважением,<br>Команда Logos AI</p>
              <p style="margin: 10px 0 0 0;">Это автоматическое письмо, не отвечайте на него</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const result = await sgMail.send(msg);
    console.log('2FA code sent successfully via SendGrid');
    console.log('SendGrid Response:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Error sending 2FA code via SendGrid:', error);
    if (error.response) {
      console.error('SendGrid API Error Details:', JSON.stringify(error.response.body, null, 2));
    }
    throw error;
  }
}

async function sendLoginCredentials(to, email, password, companyName, firstName, lastName) {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SENDGRID_NOT_CONFIGURED');
    }

    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@yourdomain.com';
    
    const msg = {
      to: to,
      from: fromEmail,
      subject: 'Ваши данные для входа в систему',
      html: `
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
    };

    await sgMail.send(msg);
    console.log('Login credentials sent successfully via SendGrid');
  } catch (error) {
    console.error('Error sending login credentials via SendGrid:', error);
    throw error;
  }
}

async function sendPasswordResetCode(to, code) {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SENDGRID_NOT_CONFIGURED');
    }

    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@yourdomain.com';
    
    const msg = {
      to: to,
      from: fromEmail,
      subject: 'Код для сброса пароля',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #00e0d3;">Сброс пароля</h2>
          <p>Вы запросили сброс пароля для вашего аккаунта.</p>
          <p>Используйте следующий код для подтверждения:</p>
          
          <div style="background-color: #f5f5f5; padding: 30px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h1 style="color: #333; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h1>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            <strong>Важно:</strong> Этот код действителен в течение 10 минут.
          </p>
          
          <p style="color: #999; text-align: center; font-size: 12px; margin-top: 30px;">
            Если вы не запрашивали сброс пароля, проигнорируйте это письмо.
          </p>
        </div>
      `,
      text: `
Сброс пароля

Вы запросили сброс пароля для вашего аккаунта.
Используйте следующий код для подтверждения:

${code}

Важно: Этот код действителен в течение 10 минут.

Если вы не запрашивали сброс пароля, проигнорируйте это письмо.
      `,
    };

    await sgMail.send(msg);
    console.log('Password reset code sent successfully via SendGrid');
  } catch (error) {
    console.error('Error sending password reset code via SendGrid:', error);
    throw error;
  }
}

// Функция для проверки конфигурации SendGrid
async function verifySendGridConnection() {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.error('SendGrid API key not configured');
      return false;
    }

    // Простая проверка - попробуем отправить тестовое письмо
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@yourdomain.com';
    const msg = {
      to: 'artyomswim@gmail.com',
      from: fromEmail,
      subject: 'SendGrid Test',
      text: 'This is a test email to verify SendGrid configuration',
    };

    await sgMail.send(msg);
    console.log('SendGrid connection verified successfully');
    return true;
  } catch (error) {
    console.error('SendGrid connection failed:', error.message);
    return false;
  }
}

module.exports = {
  send2FACode,
  sendLoginCredentials,
  sendPasswordResetCode,
  verifySendGridConnection,
};