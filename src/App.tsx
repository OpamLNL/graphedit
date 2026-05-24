import './App.css';
import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar.tsx';
import Home from './pages/Home';
import Map from './pages/MapPage.tsx';
import MapsPage from './pages/MapsPage';
import EditorPage from './pages/EditorPage';
import Topics from './pages/Topics';
import About from './pages/About';
import Contact from './pages/Contact';
import Progress from './pages/Progress';
import Login from './pages/Login';
import AdminPage from './pages/admin/AdminPage.tsx';

function App() {
    return (
        <div className="min-h-screen flex flex-col bg-base-100 text-base-content">
            <Navbar />
            <main className="flex-1">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/maps" element={<MapsPage />} />
                    <Route path="/map/:mapId" element={<Map />} />
                    <Route path="/map" element={<Navigate to="/maps" replace />} />
                    <Route path="/editor/:mapId" element={<EditorPage />} />
                    <Route path="/editor" element={<Navigate to="/maps" replace />} />
                    <Route path="/topics" element={<Topics />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/progress" element={<Progress />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/admin/adminPage" element={<AdminPage />} />
                </Routes>
            </main>
        </div>
    );
}

export default App;
