const CompanyDatabaseService = require('../services/companyDatabaseService');

const createUser = async ({ email, passwordHash, firstName, lastName, avatarUrl, role, companyName }) => {
  const res = await CompanyDatabaseService.executeCompanyQuery(companyName,
    `INSERT INTO user_auth (email, password_hash, first_name, last_name, avatar_url, role, company_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [email, passwordHash, firstName, lastName, avatarUrl, role, companyName]
  );
  return res.rows[0];
};

const getUserByEmail = async (email, companyName) => {
  try {
    const res = await CompanyDatabaseService.executeCompanyQuery(companyName,
      `SELECT * FROM user_auth WHERE email = $1`,
      [email]
    );
    return res.rows[0];
  } catch (error) {
    console.error(`Error getting user by email ${email} in company ${companyName}:`, error);
    // Return null if user not found or database doesn't exist
    return null;
  }ч
};

const getUserById = async (id, companyName) => {
  const res = await CompanyDatabaseService.executeCompanyQuery(companyName,
    `SELECT * FROM user_auth WHERE id = $1`,
    [id]
  );
  return res.rows[0];
};

const getUsersByCompany = async (companyName) => {
  const res = await CompanyDatabaseService.executeCompanyQuery(companyName,
    `SELECT * FROM user_auth ORDER BY created_at DESC`
  );
  return res.rows;
};

const updateUser = async (id, updates, companyName) => {
  const fields = Object.keys(updates);
  const values = Object.values(updates);
  
  const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
  const query = `UPDATE user_auth SET ${setClause} WHERE id = $1 RETURNING *`;
  
  const res = await CompanyDatabaseService.executeCompanyQuery(companyName, query, [id, ...values]);
  return res.rows[0];
};

const deleteUser = async (id, companyName) => {
  const res = await CompanyDatabaseService.executeCompanyQuery(companyName,
    `DELETE FROM user_auth WHERE id = $1 RETURNING *`,
    [id]
  );
  return res.rows[0];
};

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  getUsersByCompany,
  updateUser,
  deleteUser,
};