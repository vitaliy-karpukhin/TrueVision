# TrueVision

**Персональная финансовая система** для физлиц и малого бизнеса.  
Загружаешь PDF (выписки, счета, бюджеты) — AI извлекает данные, система показывает транзакции, бюджет план/факт, аналитику и календарь платежей.

> Контроль. Рост. Уверенность.

---

## Стек

| Слой | Технология |
|---|---|
| **Frontend** | React 18 + Vite 6, React Router v6, Recharts |
| **Backend** | FastAPI (Python 3.13), SQLAlchemy, Alembic |
| **База данных** | PostgreSQL 15 |
| **AI** | Anthropic Claude (Vision, Sonnet) + OpenAI GPT-4o |
| **OCR** | PyMuPDF (fitz) + Tesseract + pdfplumber |
| **Auth** | JWT (python-jose) + bcrypt + email-верификация |
| **Email** | Gmail SMTP (App Password) |
| **Инфраструктура** | Docker + Docker Compose, ngrok (dev) |

---

## Структура проекта

```
TrueVision/
├── app/                          # FastAPI бэкенд
│   ├── main.py                   # Точка входа, CORS, роутеры
│   ├── config.py                 # Загрузка .env + .env.local
│   ├── db/
│   │   └── database.py           # SQLAlchemy engine, SessionLocal
│   ├── models/
│   │   ├── user.py               # User (JWT auth, email verify)
│   │   ├── document.py           # Document (файл + extraction_result)
│   │   ├── financial_event.py    # Транзакции
│   │   ├── budget.py             # Бюджет по периодам (JSONB)
│   │   ├── company.py            # Компания пользователя
│   │   ├── notification.py       # Уведомления
│   │   └── project.py            # Проекты
│   ├── routes/
│   │   ├── auth.py               # /auth — регистрация, логин, верификация
│   │   ├── upload.py             # /documents — загрузка, анализ, удаление
│   │   ├── dashboard.py          # /dashboard — метрики, транзакции, прогноз
│   │   ├── budget.py             # /budget — CRUD бюджета, импорт из PDF, план/факт
│   │   ├── chat.py               # /chat — AI-ассистент
│   │   ├── analysis.py           # /documents/{id}/analyze
│   │   └── notifications.py      # /notifications
│   └── services/
│       ├── email.py              # Gmail SMTP отправка писем
│       ├── ai.py                 # OpenAI интеграция
│       ├── extraction.py         # PDF парсинг, агрегация метрик
│       ├── document_processor.py # Пайплайн обработки документа
│       └── event_builder.py      # Создание FinancialEvent из анализа
│
├── truevision-frontend/          # React фронтенд
│   ├── src/
│   │   ├── App.jsx               # Роутинг, ProtectedRoute
│   │   ├── api/client.js         # Axios с JWT, прокси /api
│   │   ├── context/LangContext   # RU / DE локализация
│   │   ├── locales/i18n.js       # Все переводы
│   │   └── pages/
│   │       ├── Login/            # Авторизация + регистрация
│   │       ├── VerifyEmail/      # Подтверждение email
│   │       ├── PathSelection/    # Выбор пути (наёмный / предприниматель)
│   │       ├── Onboarding/       # Онбординг
│   │       ├── Dashboard/        # Главная — метрики, график, уведомления
│   │       ├── Finances/         # Обзор + Бюджет-планировщик
│   │       ├── Transactions/     # Список транзакций, фильтры, экспорт
│   │       ├── Documents/        # Загрузка и анализ документов
│   │       ├── Analytics/        # Графики роста, финмодель
│   │       ├── Calendar/         # Повторяющиеся платежи
│   │       ├── AIChat/           # AI-ассистент по финансам
│   │       └── Profile/          # Профиль, компания, смена пароля
│   └── vite.config.js            # Прокси /api → localhost:8000
│
├── migrations/                   # Alembic миграции
├── uploads/                      # Загруженные файлы (не в git)
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── .env                          # Переменные окружения (не в git)
└── .env.local                    # Локальные переменные (не в git)
```

---

## Переменные окружения

### `.env`
```env
# База данных
DB_USER=admin
DB_PASSWORD=admin
DB_NAME=truevision
DB_HOST=db           # localhost для локального запуска без Docker
DB_PORT=5432

# JWT
SECRET_KEY=your-very-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# AI
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Email (Gmail App Password)
SMTP_EMAIL=your@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx

# Misc
UPLOAD_TOKEN=supersecrettoken123
```

### `.env.local` (локальные переопределения)
```env
DB_HOST=localhost
DB_PORT=5432
FRONTEND_URL=https://your-ngrok-url.ngrok-free.dev
```

---

## Локальный запуск

### Требования
- Python 3.13+
- Node.js 18+
- PostgreSQL 15+
- Tesseract OCR (`brew install tesseract tesseract-lang`)

### Бэкенд
```bash
cd TrueVision

# Виртуальное окружение
python3 -m venv venv
source venv/bin/activate

# Зависимости
pip install -r requirements.txt

# Миграции
alembic upgrade head

# Запуск (с авто-перезагрузкой)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Фронтенд
```bash
cd truevision-frontend
npm install
npm run dev -- --host
```

### Через Docker
```bash
docker compose up --build
```

Сервисы:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs

### Через ngrok (публичный доступ)
```bash
# В отдельном терминале
ngrok http 5173
```
Swagger через ngrok: `https://your-url.ngrok-free.dev/docs`

---

## API — основные эндпоинты

Полная документация: **http://localhost:8000/docs**

### Auth `/auth`
| Метод | Endpoint | Описание |
|---|---|---|
| POST | `/auth/register` | Регистрация (отправляет письмо верификации) |
| POST | `/auth/login` | Логин → JWT токен |
| GET | `/auth/verify?token=` | Подтверждение email |
| GET | `/auth/me` | Текущий пользователь |
| PUT | `/auth/update` | Обновление профиля |
| POST | `/auth/change-password` | Смена пароля |

### Documents `/documents`
| Метод | Endpoint | Описание |
|---|---|---|
| POST | `/documents/upload` | Загрузить PDF / JPG / PNG |
| GET | `/documents/` | Список документов пользователя |
| GET | `/documents/{id}` | Скачать файл |
| POST | `/documents/{id}/analyze` | AI-анализ документа |
| DELETE | `/documents/{id}` | Удалить документ |

### Budget `/budget`
| Метод | Endpoint | Описание |
|---|---|---|
| GET | `/budget?period=YYYY-MM` | Получить бюджет за период |
| PUT | `/budget?period=YYYY-MM` | Сохранить бюджет |
| POST | `/budget/import/{doc_id}` | Импортировать бюджет из PDF |
| GET | `/budget/actual?period=YYYY-MM` | Фактические расходы из транзакций |
| GET | `/budget/history` | История бюджетов по периодам |

### Dashboard `/dashboard`
| Метод | Endpoint | Описание |
|---|---|---|
| GET | `/dashboard?period=` | Метрики: доходы, расходы, score |
| GET | `/dashboard/transactions` | Список транзакций с фильтрами |
| POST | `/dashboard/transactions` | Добавить транзакцию вручную |
| DELETE | `/dashboard/transactions/{id}` | Удалить транзакцию |
| GET | `/dashboard/chart-data?period=` | Данные для графиков |
| GET | `/dashboard/forecast` | Прогноз по повторяющимся платежам |
| GET | `/dashboard/export` | Экспорт CSV |

### Chat `/chat`
| Метод | Endpoint | Описание |
|---|---|---|
| POST | `/chat/query` | Вопрос к AI-ассистенту |

---

## Как работает AI-анализ документов

```
PDF / JPG  →  pdfplumber (текст)
                │
                ├─ текст найден? → Claude Anthropic (структурирование)
                │
                └─ нет текста (image PDF)? → Claude Vision (OCR + анализ)
                        │
                        └─ результат → FinancialEvent в БД
```

### Как работает импорт бюджета из PDF (Haushaltsbudget)

```
PDF  →  pdfplumber (есть текст?)
          │
          ├─ Да → Column crop parser (4 колонки: Schutzengel/Wohnen/Leben/Sparen)
          │           └─ не нашёл → Claude Vision fallback
          │
          └─ Нет (image PDF) → OCR по колонкам (PyMuPDF + Tesseract)
                                    └─ динамическое определение заголовков колонок
                                           по ключевым словам в содержимом
```

### Бюджет план vs факт

```
GET /budget/actual?period=YYYY-MM
    │
    └─ FinancialEvent за период
           │
           └─ маппинг категорий:
                rent        → housing
                insurance   → insurance
                expense/
                materials/
                software    → living
                (остальное) → living
```

---

## Email-верификация

1. Пользователь регистрируется → `is_verified=False`, токен сохраняется в БД
2. Gmail отправляет письмо со ссылкой на `{FRONTEND_URL}/verify-email?token=xxx`
3. Пользователь кликает → фронтенд вызывает `GET /api/auth/verify?token=xxx`
4. Бэкенд ставит `is_verified=True` → редирект на `/login`

> Если `SMTP_EMAIL` / `SMTP_PASSWORD` не заданы — пользователь авто-верифицируется (для dev-окружения).

---

## Локализация

Поддерживаются два языка: **RU** и **DE**.  
Переключение в хедере приложения. Все строки в `truevision-frontend/src/locales/i18n.js`.

---

## Модели данных

### User
```
id, email, password (bcrypt), role, first_name, last_name, phone,
avatar_url, is_active, is_verified, verification_token,
path (employee/entrepreneur), created_at, updated_at
```

### Document
```
id, filename, file_path, file_size, status (uploaded/analyzed/processing_failed),
doc_type, extraction_result (JSONB), payment_status, owner_id, created_at
```

### FinancialEvent (транзакции)
```
id, user_id, document_id, event_type, vendor, amount, currency,
category, event_date, is_recurring, created_at
```

### Budget
```
id, user_id, period (YYYY-MM), data (JSONB: {income, categories[]}), updated_at
```

### Company
```
id, owner_id, name, position, tax_id, iban, ...
```

### Notification
```
id, user_id, title, body, type (info/warning/error), is_read, created_at
```

---

## Статус фич

| Фича | Статус |
|---|---|
| Аутентификация (JWT + bcrypt + email) | ✅ Готово |
| Загрузка и AI-анализ документов | ✅ Готово |
| Бюджет-планировщик (импорт из PDF) | ✅ Готово |
| Бюджет план vs факт | ✅ Готово |
| Транзакции (CRUD, фильтры, экспорт) | ✅ Готово |
| Аналитика (графики, финмодель) | ✅ Готово |
| Календарь платежей | ✅ Готово |
| AI Чат | ✅ Готово |
| Профиль + компания | ✅ Готово |
| Адаптивный дизайн (мобайл + десктоп) | ✅ Готово |
| Локализация RU / DE | ✅ Готово |
| Онбординг (путь «Предприниматель») | 🔄 Частично |
| Уведомления (UI) | 🔄 Частично |
| Банковские интеграции (Open Banking) | 📋 Запланировано |
| Мультивалютность | 📋 Запланировано |
| Монетизация / подписка | 📋 Запланировано |
| Мобильное приложение | 📋 Запланировано |
