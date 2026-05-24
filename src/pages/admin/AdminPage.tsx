import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminApi, type AdminDashboard } from '../../api/admin';
import { usersApi } from '../../api/users';
import { nodesApi } from '../../api/nodes';
import { apiFetch } from '../../api/client';

interface UserType {
    id: number;
    email: string;
    name: string;
    role: string;
}

interface NodeType {
    id: number;
    title: string;
}

interface ConnectionType {
    id: number;
    fromNodeId: number;
    toNodeId: number;
    type: string;
}

export default function AdminPage() {
    const { user, role } = useAuth();
    const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
    const [nodes, setNodes] = useState<NodeType[]>([]);
    const [connections, setConnections] = useState<ConnectionType[]>([]);
    const [users, setUsers] = useState<UserType[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        if (!user) return navigate('/');
        if (role !== 'admin') return navigate('/');

        Promise.all([
            adminApi.getDashboard(),
            nodesApi.getAll(),
            apiFetch<ConnectionType[]>('/node-connections'),
            usersApi.getAll(),
        ])
            .then(([dash, n, c, u]) => {
                setDashboard(dash);
                setNodes(n as NodeType[]);
                setConnections(c);
                setUsers(u as UserType[]);
            })
            .catch(console.error);
    }, [user, role, navigate]);

    const handleRoleChange = async (userId: number, newRole: string) => {
        await usersApi.updateRole(userId, newRole);
        setUsers((prev) =>
            prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
        );
    };

    const filteredNodes = searchTerm
        ? nodes.filter((n) => n.title.toLowerCase().includes(searchTerm.toLowerCase()))
        : nodes.slice(0, 50);

    if (!dashboard) {
        return <div className="p-8 text-center opacity-60">Завантаження панелі адміна...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            <h1 className="text-3xl font-bold">Панель адміністратора</h1>

            {/* Dashboard stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Користувачів', value: dashboard.users.total },
                    { label: 'Студентів', value: dashboard.users.students },
                    { label: 'Тем', value: dashboard.content.topics },
                    { label: 'Вузлів', value: dashboard.content.nodes },
                    { label: 'Ребер', value: dashboard.content.edges },
                    { label: 'Карт', value: dashboard.maps.total },
                    { label: 'Сер. прогрес', value: `${dashboard.progress.averageCompletionPercent}%` },
                    { label: 'Активних', value: dashboard.users.activeWithProgress },
                ].map((s) => (
                    <div key={s.label} className="glass-card p-4 text-center">
                        <div className="text-2xl font-bold text-primary">{s.value}</div>
                        <div className="text-xs opacity-60">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Users */}
            <section>
                <h2 className="text-xl font-bold mb-4">Користувачі</h2>
                <div className="overflow-x-auto rounded-xl border border-base-content/10">
                    <table className="table table-sm">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Email</th>
                                <th>Ім'я</th>
                                <th>Роль</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.id}>
                                    <td>{u.id}</td>
                                    <td>{u.email}</td>
                                    <td>{u.name}</td>
                                    <td>
                                        <select
                                            className="select select-bordered select-xs"
                                            value={u.role}
                                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                        >
                                            <option value="student">student</option>
                                            <option value="teacher">teacher</option>
                                            <option value="admin">admin</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Nodes search */}
            <section>
                <h2 className="text-xl font-bold mb-4">Вузли ({nodes.length})</h2>
                <input
                    className="input input-bordered w-full max-w-md mb-4"
                    placeholder="Пошук вузла..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="overflow-x-auto rounded-xl border border-base-content/10 max-h-64">
                    <table className="table table-xs">
                        <thead><tr><th>ID</th><th>Title</th></tr></thead>
                        <tbody>
                            {filteredNodes.map((n) => (
                                <tr key={n.id}><td>{n.id}</td><td>{n.title}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Connections */}
            <section>
                <h2 className="text-xl font-bold mb-4">Зв'язки ({connections.length})</h2>
                <div className="overflow-x-auto rounded-xl border border-base-content/10 max-h-48">
                    <table className="table table-xs">
                        <thead><tr><th>From</th><th>To</th><th>Type</th></tr></thead>
                        <tbody>
                            {connections.slice(0, 100).map((c) => (
                                <tr key={c.id}>
                                    <td>{c.fromNodeId}</td>
                                    <td>{c.toNodeId}</td>
                                    <td>{c.type}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
