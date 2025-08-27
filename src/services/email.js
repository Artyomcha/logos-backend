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
      from: fromEmail,
      subject: 'Код подтверждения',
      text: `Ваш код подтверждения: ${code}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #00e0d3; text-align: center;">Код подтверждения</h2>
          <div style="background-color: #f5f5f5; padding: 30px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h1 style="color: #333; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h1>
          </div>
          <p style="color: #666; text-align: center; font-size: 14px;">
            Введите этот код для завершения входа в систему.
          </p>
          <p style="color: #999; text-align: center; font-size: 12px; margin-top: 30px;">
            Если вы не запрашивали этот код, проигнорируйте это письмо.
          </p>
        </div>
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