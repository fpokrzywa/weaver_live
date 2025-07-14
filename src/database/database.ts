import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import { promisify } from 'util';

const dbPath = 'aw_build.db';
const db = new sqlite3.Database(dbPath);

// Promisify database methods for easier async/await usage
const dbRun = promisify(db.run.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

// Initialize database with schema directly
const initializeDatabase = async () => {
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
  `;

  try {
    // Execute schema
    await dbRun(schema);

    // Insert default roles
    await dbRun(`INSERT OR IGNORE INTO roles (id, name, description, permissions) VALUES 
      (1, 'Admin', 'Full system access', '["user_management", "role_management", "system_settings"]'),
      (2, 'User', 'Standard user access', '["basic_access"]'),
      (3, 'Manager', 'Manager level access', '["basic_access", "team_management"]')`);

    // Hash the default admin password properly
    const hashedPassword = bcrypt.hashSync('Appdev2025!', 10);
    
    // Insert default admin user
    await dbRun(`INSERT OR IGNORE INTO users (id, email, password_hash, first_name, last_name, role_id) VALUES 
      (1, 'freddie@3cpublish.com', ?, 'Freddie', 'Admin', 1)`, [hashedPassword]);

    console.log('Database initialized successfully');
  } catch (error) {
    console.log('Database initialization error:', error.message);
  }
};

// Initialize database
initializeDatabase();

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

// Hash password helper
const hashPassword = (password: string): string => {
  return bcrypt.hashSync(password, 10);
};

// User operations
export const userOperations = {
  getAll: async (): Promise<User[]> => {
    const query = `
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      ORDER BY u.created_at DESC
    `;
    return await dbAll(query) as User[];
  },

  getById: async (id: number): Promise<User | undefined> => {
    const query = `
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id = ?
    `;
    return await dbGet(query, [id]) as User | undefined;
  },

  getByEmail: async (email: string): Promise<User | undefined> => {
    const query = `
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.email = ?
    `;
    return await dbGet(query, [email]) as User | undefined;
  },

  create: async (userData: CreateUserData): Promise<User> => {
    const hashedPassword = hashPassword(userData.password);
    const query = `
      INSERT INTO users (email, password_hash, first_name, last_name, role_id)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const result = await dbRun(query, [
      userData.email,
      hashedPassword,
      userData.first_name || null,
      userData.last_name || null,
      userData.role_id
    ]);
    
    return await userOperations.getById((result as any).lastID);
  },

  update: async (id: number, userData: UpdateUserData): Promise<User | undefined> => {
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

    if (updates.length === 0) return await userOperations.getById(id);

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    await dbRun(query, values);
    
    return await userOperations.getById(id);
  },

  delete: async (id: number): Promise<boolean> => {
    const query = 'DELETE FROM users WHERE id = ?';
    const result = await dbRun(query, [id]);
    return (result as any).changes > 0;
  },

  updateLastLogin: async (id: number): Promise<void> => {
    const query = 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?';
    await dbRun(query, [id]);
  },

  verifyPassword: (password: string, hash: string): boolean => {
    return bcrypt.compareSync(password, hash);
  }
};

// Role operations
export const roleOperations = {
  getAll: async (): Promise<Role[]> => {
    const query = 'SELECT * FROM roles ORDER BY name';
    return await dbAll(query) as Role[];
  },

  getById: async (id: number): Promise<Role | undefined> => {
    const query = 'SELECT * FROM roles WHERE id = ?';
    return await dbGet(query, [id]) as Role | undefined;
  },

  create: async (roleData: CreateRoleData): Promise<Role> => {
    const query = `
      INSERT INTO roles (name, description, permissions)
      VALUES (?, ?, ?)
    `;
    
    const result = await dbRun(query, [
      roleData.name,
      roleData.description || null,
      JSON.stringify(roleData.permissions)
    ]);
    
    return await roleOperations.getById((result as any).lastID);
  },

  update: async (id: number, roleData: UpdateRoleData): Promise<Role | undefined> => {
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

    if (updates.length === 0) return await roleOperations.getById(id);

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `UPDATE roles SET ${updates.join(', ')} WHERE id = ?`;
    await dbRun(query, values);
    
    return await roleOperations.getById(id);
  },

  delete: async (id: number): Promise<boolean> => {
    // Check if role is in use
    const checkQuery = 'SELECT COUNT(*) as count FROM users WHERE role_id = ?';
    const result = await dbGet(checkQuery, [id]) as { count: number };
    
    if (result.count > 0) {
      throw new Error('Cannot delete role that is assigned to users');
    }

    const deleteQuery = 'DELETE FROM roles WHERE id = ?';
    const deleteResult = await dbRun(deleteQuery, [id]);
    return (deleteResult as any).changes > 0;
  }
};

export default db;