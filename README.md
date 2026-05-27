# GraphEdit — Frontend

Клієнтська частина **GraphEdit**: перегляд і проходження карт знань, редактор для викладачів, кабінет і статистика.

> Backend знаходиться в сусідній папці **`graphedit-server/`** (не `knowledgemap-server`).

## Технології

- React 18, TypeScript, Vite
- React Router, Tailwind CSS, DaisyUI
- vis-network — візуалізація графа (перегляд і редактор)
- Firebase Auth — вхід через Google
- REST API → `graphedit-server`

## Встановлення

```bash
npm install
cp .env.example .env
npm run dev
```

За замовчуванням UI: `http://localhost:5173`

## Змінні середовища

| Змінна | Опис |
|--------|------|
| `VITE_API_BASE_URL` | URL API з префіксом `/api`, напр. `http://localhost:3002/api` |

Firebase-конфіг — у `src/firebase.ts` (проєкт Firebase залишається окремим).

## Скрипти

```bash
npm run dev      # розробка
npm run build    # production-збірка
npm run preview  # перегляд збірки
```

## Маршрути

| Шлях | Опис |
|------|------|
| `/` | Головна |
| `/maps` | Каталог опублікованих карт |
| `/my-maps` | Мої карти (автор + з прогресом) |
| `/map/:mapId` | Перегляд карти |
| `/editor/:mapId` | Редактор (teacher / admin) |
| `/profile` | Особистий кабінет |
| `/users/:userId` | Публічний профіль автора |
| `/teaching` | Статистика карт (teacher / admin) |
| `/teaching/users` | Усі учні по ваших картах |
| `/teaching/maps/:mapId` | Прогрес учнів по одній карті |
| `/topics` | Каталог тем |
| `/admin/adminPage` | Панель адміністратора |

## Ролі

- **student** — перегляд карт, прогрес
- **teacher** — створення/редагування карт, статистика учнів
- **admin** — те саме + керування користувачами

Перед роботою переконайтесь, що запущено **`graphedit-server`** на порту з `.env` (зазвичай `3002`).
