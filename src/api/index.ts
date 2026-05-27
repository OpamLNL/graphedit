import { signInWithPopup, type User } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { usersApi } from './users';

export async function loginWithGoogle(): Promise<{ user: User; role: string }> {
    const result = await signInWithPopup(auth, googleProvider);
    const token = await result.user.getIdToken();
    localStorage.setItem('token', token);

    await usersApi.saveAfterGoogle({
        email: result.user.email ?? '',
        name: result.user.displayName ?? result.user.email ?? 'User',
        avatarUrl: result.user.photoURL,
    });

    const me = await usersApi.me();
    localStorage.setItem('role', me.role);
    localStorage.setItem(
        'firebaseUser',
        JSON.stringify({ uid: result.user.uid, email: result.user.email }),
    );

    return { user: result.user, role: me.role };
}

export async function logoutUser(): Promise<void> {
    await auth.signOut();
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('firebaseUser');
}

export { apiFetch, ApiError } from './client';
export { usersApi } from './users';
export { progressApi } from './progress';
export { nodesApi } from './nodes';
export { topicsApi } from './topics';
export { adminApi } from './admin';
export { graphEditMapsApi } from './graphEditMaps';
