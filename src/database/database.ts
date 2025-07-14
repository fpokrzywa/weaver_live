import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const dbPath = 'database.sqlite';
const db = new Database(dbPath);

// Initialize database with schema directly
const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role_id INTEGER,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  FOREIGN KEY (role_id) REFERENCES roles (id)
);

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  permissions TEXT, -- JSON string of permissions
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default roles
INSERT OR IGNORE INTO roles (id, name, description, permissions) VALUES 
(1, 'Admin', 'Full system access', '["user_management", "role_management", "system_settings"]'),
(2, 'User', 'Standard user access', '["basic_access"]'),
(3, 'Manager', 'Manager level access', '["basic_access", "team_management"]');

-- Insert default admin user (password: admin123)
INSERT OR IGNORE INTO users (id, email, password_hash, first_name, last_name, role_id) VALUES 
(1, 'freddie@3cpublish.com', '$2a$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQ', 'Freddie', 'Admin', 1);
`;

// Execute schema
db.exec(schema);

// Hash the default admin password properly
const hashPassword = (password: string): string => {
  return bcrypt.hashSync(password, 10);
};

// Update admin password with proper hash
const updateAdminPassword = db.prepare(`
  UPDATE users SET password_hash = ? WHERE email = 'freddie@3cpublish.com'
`);
try {
  updateAdminPassword.run(hashPassword('Appdev2025!'));
  console.log('Database initialized successfully');
} catch (error) {
  console.log('Database already initialized or error:', error.message);
}

export interface User {
  id: number;
  email: string;
  password_hash: string;
  first_name?: string;
  last_name?: string;
  role_id: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
  role_name?: string;
}

export interface Role {
  id: number;
  name: string;
  description?: string;
  permissions: string;
  created_at: string;
  updated_at: string;
}

export interface CreateUserData {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  role_id: number;
}

export interface UpdateUserData {
  email?: string;
  first_name?: string;
  last_name?: string;
  role_id?: number;
  is_active?: boolean;
}

export interface CreateRoleData {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateRoleData {
  name?: string;
  description?: string;
  permissions?: string[];
}

// User operations
export const userOperations = {
  getAll: (): User[] => {
    const stmt = db.prepare(`
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      ORDER BY u.created_at DESC
    `);
    return stmt.all() as User[];
  },

  getById: (id: number): User | undefined => {
    const stmt = db.prepare(`
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id = ?
    `);
    return stmt.get(id) as User | undefined;
  },

  getByEmail: (email: string): User | undefined => {
    const stmt = db.prepare(`
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.email = ?
    `);
    return stmt.get(email) as User | undefined;
  },

  create: (userData: CreateUserData): User => {
    const hashedPassword = hashPassword(userData.password);
    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash, first_name, last_name, role_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      userData.email,
      hashedPassword,
      userData.first_name || null,
      userData.last_name || null,
      userData.role_id
    );
    
    return userOperations.getById(result.lastInsertRowid as number)!;
  },

  update: (id: number, userData: UpdateUserData): User | undefined => {
    const updates: string[] = [];
    const values: any[] = [];

    if (userData.email !== undefined) {
      updates.push('email = ?');
      values.push(userData.email);
    }
    if (userData.first_name !== undefined) {
      updates.push('first_name = ?');
      values.push(userData.first_name);
    }
    if (userData.last_name !== undefined) {
      updates.push('last_name = ?');
      values.push(userData.last_name);
    }
    if (userData.role_id !== undefined) {
      updates.push('role_id = ?');
      values.push(userData.role_id);
    }
    if (userData.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(userData.is_active);
    }

    if (updates.length === 0) return userOperations.getById(id);

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = db.prepare(`
      UPDATE users SET ${updates.join(', ')} WHERE id = ?
    `);
    
    stmt.run(...values);
    return userOperations.getById(id);
  },

  delete: (id: number): boolean => {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  updateLastLogin: (id: number): void => {
    const stmt = db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(id);
  },

  verifyPassword: (password: string, hash: string): boolean => {
    return bcrypt.compareSync(password, hash);
  }
};

// Role operations
export const roleOperations = {
  getAll: (): Role[] => {
    const stmt = db.prepare('SELECT * FROM roles ORDER BY name');
    return stmt.all() as Role[];
  },

  getById: (id: number): Role | undefined => {
    const stmt = db.prepare('SELECT * FROM roles WHERE id = ?');
    return stmt.get(id) as Role | undefined;
  },

  create: (roleData: CreateRoleData): Role => {
    const stmt = db.prepare(`
      INSERT INTO roles (name, description, permissions)
      VALUES (?, ?, ?)
    `);
    
    const result = stmt.run(
      roleData.name,
      roleData.description || null,
      JSON.stringify(roleData.permissions)
    );
    
    return roleOperations.getById(result.lastInsertRowid as number)!;
  },

  update: (id: number, roleData: UpdateRoleData): Role | undefined => {
    const updates: string[] = [];
    const values: any[] = [];

    if (roleData.name !== undefined) {
      updates.push('name = ?');
      values.push(roleData.name);
    }
    if (roleData.description !== undefined) {
      updates.push('description = ?');
      values.push(roleData.description);
    }
    if (roleData.permissions !== undefined) {
      updates.push('permissions = ?');
      values.push(JSON.stringify(roleData.permissions));
    }

    if (updates.length === 0) return roleOperations.getById(id);

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = db.prepare(`
      UPDATE roles SET ${updates.join(', ')} WHERE id = ?
    `);
    
    stmt.run(...values);
    return roleOperations.getById(id);
  },

  delete: (id: number): boolean => {
    // Check if role is in use
    const checkStmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE role_id = ?');
    const result = checkStmt.get(id) as { count: number };
    
    if (result.count > 0) {
      throw new Error('Cannot delete role that is assigned to users');
    }

    const stmt = db.prepare('DELETE FROM roles WHERE id = ?');
    const deleteResult = stmt.run(id);
    return deleteResult.changes > 0;
  }
};

export default db;