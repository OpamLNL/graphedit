import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../firebase';
import { usersApi } from '../api/users';
import { apiAssetUrl } from '../api/client';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    token: string | null;
    role: string | null;
    avatarUrl: string | null;
    profileName: string | null;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    token: null,
    role: null,
    avatarUrl: null,
    profileName: null,
    refreshProfile: async () => {},
});

function resolveAvatarUrl(stored: string | null | undefined, googleUrl: string | null | undefined): string | null {
    const url = stored ?? googleUrl ?? null;
    if (!url) return null;
    if (url.startsWith('/api/')) return apiAssetUrl(url);
    return url;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<string | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [profileName, setProfileName] = useState<string | null>(null);

    const refreshProfile = useCallback(async () => {
        if (!localStorage.getItem('token')) return;
        try {
            const me = await usersApi.me();
            setRole(me.role);
            setProfileName(me.name ?? null);
            setAvatarUrl(resolveAvatarUrl(me.avatarUrl, auth.currentUser?.photoURL));
            localStorage.setItem('role', me.role);
        } catch {
            setRole(null);
            setProfileName(auth.currentUser?.displayName ?? null);
            setAvatarUrl(auth.currentUser?.photoURL ?? null);
        }
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);

            if (currentUser) {
                const t = await currentUser.getIdToken();
                setToken(t);
                localStorage.setItem('token', t);
                await refreshProfile();
            } else {
                setToken(null);
                setRole(null);
                setAvatarUrl(null);
                setProfileName(null);
                localStorage.removeItem('token');
                localStorage.removeItem('role');
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [refreshProfile]);

    return (
        <AuthContext.Provider value={{ user, loading, token, role, avatarUrl, profileName, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
