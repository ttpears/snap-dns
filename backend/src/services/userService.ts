// backend/src/services/userService.ts
import bcrypt from 'bcrypt';
import { promises as fs } from 'fs';
import path from 'path';
import { User, UserCreateData, UserResponse, UserRole } from '../types/auth';

const SALT_ROUNDS = 12;
const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

class UserService {
  private users: Map<string, User> = new Map();
  private initialized = false;
  private initializing = false;

  /**
   * Initialize the user service and load users from disk
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Prevent concurrent initialization
    if (this.initializing) {
      // Wait for the other initialization to complete
      while (this.initializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.initializing = true;

    try {
      // Ensure data directory exists
      await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });

      // Try to load existing users
      try {
        const data = await fs.readFile(USERS_FILE, 'utf-8');
        const usersArray: User[] = JSON.parse(data);

        // Convert dates from strings
        usersArray.forEach(user => {
          user.createdAt = new Date(user.createdAt);
          if (user.lastLogin) {
            user.lastLogin = new Date(user.lastLogin);
          }
          this.users.set(user.id, user);
        });

        console.log(`Loaded ${this.users.size} users from disk`);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.log('No existing users file, creating default admin user');
          await this.createDefaultAdmin();
        } else {
          throw error;
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize user service:', error);
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Create default admin user for initial setup
   * Note: This bypasses createUser() to avoid initialization deadlock
   */
  private async createDefaultAdmin(): Promise<void> {
    try {
      const password = 'changeme123';

      // Hash password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Create user directly without calling createUser() to avoid deadlock
      const user: User = {
        id: this.generateUserId(),
        username: 'admin',
        passwordHash,
        role: UserRole.ADMIN,
        email: 'admin@localhost',
        createdAt: new Date(),
        allowedKeyIds: [] // Admin has access to all keys
      };

      this.users.set(user.id, user);
      await this.saveUsers();

      console.warn('⚠️  Default admin user created with username: admin, password: changeme123');
      console.warn('⚠️  PLEASE CHANGE THIS PASSWORD IMMEDIATELY!');
    } catch (error) {
      console.error('Failed to create default admin user:', error);
      throw error;
    }
  }

  /**
   * Save users to disk
   */
  private async saveUsers(): Promise<void> {
    try {
      const usersArray = Array.from(this.users.values());
      await fs.writeFile(USERS_FILE, JSON.stringify(usersArray, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save users:', error);
      throw error;
    }
  }

  /**
   * Create a new user
   */
  async createUser(userData: UserCreateData): Promise<UserResponse> {
    if (!this.initialized) await this.initialize();

    // Check if username already exists
    const existingUser = Array.from(this.users.values()).find(
      u => u.username.toLowerCase() === userData.username.toLowerCase()
    );

    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(userData.password, SALT_ROUNDS);

    // Create user
    const user: User = {
      id: this.generateUserId(),
      username: userData.username,
      passwordHash,
      role: userData.role,
      email: userData.email,
      createdAt: new Date(),
      allowedKeyIds: userData.allowedKeyIds || []
    };

    this.users.set(user.id, user);
    await this.saveUsers();

    console.log(`User created: ${user.username} (${user.role})`);
    return this.toUserResponse(user);
  }

  /**
   * Authenticate user with username and password
   */
  async authenticate(username: string, password: string): Promise<User | null> {
    if (!this.initialized) await this.initialize();

    const user = Array.from(this.users.values()).find(
      u => u.username.toLowerCase() === username.toLowerCase()
    );

    if (!user) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    // Update last login
    user.lastLogin = new Date();
    await this.saveUsers();

    return user;
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    if (!this.initialized) await this.initialize();
    return this.users.get(userId) || null;
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | null> {
    if (!this.initialized) await this.initialize();
    return Array.from(this.users.values()).find(
      u => u.username.toLowerCase() === username.toLowerCase()
    ) || null;
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.saveUsers();
  }

  /**
   * Update user role
   */
  async updateUserRole(userId: string, role: UserRole): Promise<void> {
    if (!this.initialized) await this.initialize();

    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.role = role;
    await this.saveUsers();
  }

  /**
   * Update user's allowed key IDs
   */
  async updateAllowedKeys(userId: string, keyIds: string[]): Promise<void> {
    if (!this.initialized) await this.initialize();

    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.allowedKeyIds = keyIds;
    await this.saveUsers();
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    if (!this.users.has(userId)) {
      throw new Error('User not found');
    }

    this.users.delete(userId);
    await this.saveUsers();
  }

  /**
   * List all users
   */
  async listUsers(): Promise<UserResponse[]> {
    if (!this.initialized) await this.initialize();
    return Array.from(this.users.values()).map(u => this.toUserResponse(u));
  }

  /**
   * Check if user has access to a key
   */
  hasKeyAccess(user: User, keyId: string): boolean {
    // Admins have access to all keys
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    // Check if key is in user's allowed list
    return user.allowedKeyIds.includes(keyId);
  }

  /**
   * Convert User to UserResponse (remove sensitive data)
   */
  private toUserResponse(user: User): UserResponse {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      lastLogin: user.lastLogin,
      allowedKeyIds: user.allowedKeyIds
    };
  }

  /**
   * Generate a unique user ID
   */
  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

export const userService = new UserService();
