import './App.css';
import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar.tsx';
import Home from './pages/Home';
import Map from './pages/MapPage.tsx';
import MapsPage from './pages/MapsPage';
import MyMapsPage from './pages/MyMapsPage';
import EditorPage from './pages/EditorPage';
import Topics from './pages/Topics';
import About from './pages/About';
import Contact from './pages/Contact';
import ProfilePage from './pages/ProfilePage';
import Login from './pages/Login';
import AdminPage from './pages/admin/AdminPage.tsx';
import TeachingStatsPage from './pages/teaching/TeachingStatsPage';
import TeachingUsersPage from './pages/teaching/TeachingUsersPage';
import MapLearnersPage from './pages/teaching/MapLearnersPage';
import UserPublicProfilePage from './pages/UserPublicProfilePage';

function App() {
    return (
        <div className="min-h-screen flex flex-col bg-base-100 text-base-content">
            <Navbar />
            <main className="flex-1">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/maps" element={<MapsPage />} />
                    <Route path="/my-maps" element={<MyMapsPage />} />
                    <Route path="/map/:mapId" element={<Map />} />
                    <Route path="/map" element={<Navigate to="/maps" replace />} />
                    <Route path="/editor/:mapId" element={<EditorPage />} />
                    <Route path="/editor" element={<Navigate to="/maps" replace />} />
                    <Route path="/topics" element={<Topics />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/users/:userId" element={<UserPublicProfilePage />} />
                    <Route path="/teaching" element={<TeachingStatsPage />} />
                    <Route path="/teaching/users" element={<TeachingUsersPage />} />
                    <Route path="/teaching/maps/:mapId" element={<MapLearnersPage />} />
                    <Route path="/progress" element={<Navigate to="/profile" replace />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/admin/adminPage" element={<AdminPage />} />
                </Routes>
            </main>
        </div>
    );
}

export default App;
