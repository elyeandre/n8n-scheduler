<div align="center">
  <h1>⏰ n8n Scheduler</h1>
  <p>A powerful webhook scheduler for automating n8n workflows and HTTP requests with recurring schedules, real-time monitoring, and professional authentication.</p>

  <p>
    <img src="https://img.shields.io/badge/Made%20With-Javascript-F7DF1E?style=for-the-badge&logo=javascript" alt="Made With Javascript">
    <img src="https://img.shields.io/badge/Built%20With-%E2%9D%A4-red?style=for-the-badge" alt="Built With Love">
  </p>

  <p>
    <a href="https://github.com/elyeandre/n8n-scheduler/graphs/contributors"><img src="https://img.shields.io/github/contributors/elyeandre/n8n-scheduler?style=for-the-badge" alt="Contributors"></a>
    <a href="https://github.com/elyeandre/n8n-scheduler/network/members"><img src="https://img.shields.io/github/forks/elyeandre/n8n-scheduler?style=for-the-badge" alt="Forks"></a>
    <a href="https://github.com/elyeandre/n8n-scheduler/stargazers"><img src="https://img.shields.io/github/stars/elyeandre/n8n-scheduler?style=for-the-badge" alt="Stars"></a>
    <a href="https://github.com/elyeandre/n8n-scheduler/issues"><img src="https://img.shields.io/github/issues/elyeandre/n8n-scheduler?style=for-the-badge" alt="Issues"></a>
    <a href="https://github.com/elyeandre/n8n-scheduler/blob/main/LICENSE"><img src="https://img.shields.io/github/license/elyeandre/n8n-scheduler?style=for-the-badge" alt="License"></a>
  </p>
</div>

---

## 📋 Table of Contents

- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [API Endpoints](#-api-endpoints)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Key Features

- **Webhook Scheduling** — Schedule HTTP requests (GET, POST, PUT, DELETE) to any webhook URL
- **Recurring Schedules** — Support for once, seconds, minutes, hours, days, weeks, months, and yearly intervals
- **Flexible Intervals** — Execute every N seconds, minutes, hours, days, and more
- **Authentication** — Bearer Token, API Key, Basic Auth, and custom headers for webhook requests
- **Configurable Timeout** — Per-schedule webhook timeout settings (1–300 seconds)
- **Trigger Now** — Manually execute any schedule on demand
- **Enable / Disable** — Pause and resume schedules without deleting them
- **Real-Time Updates** — Live dashboard updates via Server-Sent Events (SSE)
- **Execution Logs** — Detailed logs with status, response data, copy-to-clipboard, and JSON formatting
- **User Accounts** — Secure registration and login with JWT authentication

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB with Mongoose |
| **Frontend** | EJS, HTMX, Tailwind CSS |
| **Scheduling** | Native `setTimeout` with precision timing |
| **Auth** | JWT, bcrypt, HTTP-only cookies |
| **Real-Time** | Server-Sent Events (SSE) |
| **HTTP Client** | Axios with retry logic |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v16 or higher
- [MongoDB](https://www.mongodb.com/) instance (local or Atlas)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/elyeandre/n8n-scheduler.git
   cd n8n-scheduler
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env` file in the root directory:

   ```env
   PORT=3000
   DB_USERNAME=your_mongodb_username
   DB_PASSWORD=your_mongodb_password
   SESSION_SECRET=your_secret_key
   TZ=UTC
   ```

4. **Start the server**

   ```bash
   # Production
   npm start

   # Development (auto-reload)
   npm run dev
   ```

5. **Open your browser** and navigate to `http://localhost:3000`

---

## 📖 Usage

### Creating a Schedule

1. Register an account and log in
2. Click **Create New Schedule**
3. Fill in the schedule details:
   - **Name** — A descriptive label
   - **Webhook URL** — The endpoint to call (e.g., your n8n webhook)
   - **HTTP Method** — GET, POST, PUT, or DELETE
   - **JSON Body** — Request payload for POST/PUT
   - **Schedule Type** — Once, or recurring (seconds, minutes, hours, days, weeks, months, yearly)
   - **Interval** — How often to repeat (e.g., every 5 minutes)
   - **Authentication** — Optional Bearer Token, API Key, or Basic Auth
   - **Timeout** — Custom webhook timeout (1–300 seconds)
4. Click **Save Schedule**

### Managing Schedules

- **Edit** — Modify any schedule configuration
- **Delete** — Remove a schedule permanently
- **Enable / Disable** — Toggle schedules on or off
- **Trigger Now** — Execute a schedule immediately
- **Monitor** — View real-time status updates on the dashboard

### Viewing Logs

- Navigate to **Execution Logs** to see detailed history
- Copy response data to clipboard
- View formatted JSON responses
- Real-time log updates via SSE

---

## 📁 Project Structure

```
n8n-scheduler/
├── middleware/
│   └── auth.js                 # JWT authentication middleware
├── models/
│   ├── ExecutionLog.js         # Execution log schema
│   ├── Schedule.js             # Schedule schema
│   └── User.js                 # User schema
├── routes/
│   ├── auth.js                 # Register & login routes
│   ├── logs.js                 # Execution log routes
│   ├── schedules.js            # Schedule CRUD & trigger routes
│   └── user.js                 # User profile routes
├── utils/
│   ├── cronManager.js          # Schedule execution engine
│   ├── scheduleRowGenerator.js # Dashboard row HTML generator
│   └── validation.js           # Input validation helpers
├── views/
│   ├── dashboard.ejs           # Main dashboard
│   ├── login.ejs               # Login page
│   ├── logs.ejs                # Execution logs page
│   ├── profile.ejs             # User profile page
│   └── register.ejs            # Registration page
├── server.js                   # Application entry point
├── vercel.json                 # Vercel deployment config
├── package.json                # Dependencies & scripts
└── README.md
```

---

## 🔌 API Endpoints

### Authentication

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/auth/register` | Register a new account |
| `POST` | `/auth/login` | Log in and receive JWT |
| `GET` | `/logout` | Log out and clear session |

### Schedules

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/schedules` | List all user schedules |
| `POST` | `/schedules` | Create a new schedule |
| `GET` | `/schedules/:id/edit` | Get schedule edit form |
| `PUT` | `/schedules/:id` | Update a schedule |
| `DELETE` | `/schedules/:id` | Delete a schedule |
| `POST` | `/schedules/:id/trigger` | Trigger immediate execution |
| `PUT` | `/schedules/:id/toggle` | Enable or disable a schedule |

### Logs

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/logs` | View execution logs |

### Real-Time

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/events` | SSE stream for live updates |

---

## 🌐 Deployment

Deploy to any Node.js hosting platform such as [EvenNode](https://www.evennode.com/), Railway, Render, DigitalOcean, etc. Set the required environment variables and run `npm start`.

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

---

## 📄 License

Distributed under the ISC License. See `LICENSE` for more information.

---

<div align="center">
  <p>Made with ❤️ by <a href="https://github.com/elyeandre">Jerickson Mayor</a></p>
</div>
