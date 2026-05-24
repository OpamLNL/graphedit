import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../firebase';
import { usersApi } from '../api/users';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    token: string | null;
    role: string | null;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    token: null,
    role: null,
    refreshProfile: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<string | null>(null);

    const refreshProfile = useCallback(async () => {
        if (!localStorage.getItem('token')) return;
        try {
            const me = await usersApi.me();
            setRole(me.role);
            localStorage.setItem('role', me.role);
        } catch {
            setRole(null);
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
                localStorage.removeItem('token');
                localStorage.removeItem('role');
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [refreshProfile]);

    return (
        <AuthContext.Provider value={{ user, loading, token, role, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
