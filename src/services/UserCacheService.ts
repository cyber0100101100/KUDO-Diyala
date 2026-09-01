import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

class UserCacheService {
  private cache: Record<string, string> = {};
  private pending: Record<string, Promise<string>> = {};

  async getUserName(userId: string): Promise<string> {
    if (this.cache[userId]) return this.cache[userId];
    if (this.pending[userId]) return this.pending[userId];

    this.pending[userId] = (async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        const name = userDoc.exists() ? (userDoc.data().displayName || 'موظف') : 'موظف';
        this.cache[userId] = name;
        delete this.pending[userId];
        return name;
      } catch (err) {
        delete this.pending[userId];
        return 'موظف';
      }
    })();

    return this.pending[userId];
  }

  // Pre-fill cache from a list of users
  fill(users: any[]) {
    users.forEach(u => {
      if (u.uid && u.displayName) {
        this.cache[u.uid] = u.displayName;
      }
    });
  }
}

export const userCache = new UserCacheService();
