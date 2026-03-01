// Project templates for creating full folder-based projects

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  files: Array<{
    path: string;
    fileName: string;
    language: string;
    content: string;
  }>;
  mainFile: string;
}

export const projectTemplates: ProjectTemplate[] = [
  {
    id: "python-flask",
    name: "Python Flask Web App",
    description: "A simple Flask web application with HTML templates",
    icon: "🐍",
    mainFile: "app.py",
    files: [
      {
        path: "/",
        fileName: "app.py",
        language: "python",
        content: `# Flask Web App - Zuup Code
from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def home():
    return render_template('index.html', title='Zuup Flask App')

@app.route('/api/data')
def get_data():
    return {'message': 'Hello from Zuup Code API!', 'status': 'success'}

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
`
      },
      {
        path: "templates/",
        fileName: "index.html",
        language: "html",
        content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ title }} - Zuup Code</title>
    <link rel="stylesheet" href="{{ url_for('static', filename='style.css') }}">
</head>
<body>
    <div class="container">
        <header>
            <h1>Welcome to {{ title }}</h1>
            <p>Built with Flask on Zuup Code</p>
        </header>
        
        <main>
            <section class="hero">
                <h2>🚀 Ready to Build Amazing Things?</h2>
                <p>This is a Flask web application template. Start coding!</p>
                <button onclick="fetchData()">Test API Call</button>
            </section>
            
            <section id="data-section" class="hidden">
                <h3>API Response:</h3>
                <pre id="api-response"></pre>
            </section>
        </main>
    </div>
    
    <script src="{{ url_for('static', filename='script.js') }}"></script>
</body>
</html>
`
      },
      {
        path: "static/",
        fileName: "style.css",
        language: "css",
        content: `/* Zuup Code Flask App Styles */
:root {
  --zuup-primary: #e63462;
  --zuup-bg: #0f1019;
  --zuup-text: #e0e0e0;
  --zuup-card: #1a1b23;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  background: var(--zuup-bg);
  color: var(--zuup-text);
  line-height: 1.6;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

header {
  text-align: center;
  margin-bottom: 3rem;
}

header h1 {
  font-size: 3rem;
  color: var(--zuup-primary);
  margin-bottom: 0.5rem;
}

.hero {
  background: var(--zuup-card);
  padding: 3rem;
  border-radius: 1rem;
  text-align: center;
  border: 1px solid rgba(230, 52, 98, 0.2);
}

.hero h2 {
  font-size: 2rem;
  margin-bottom: 1rem;
}

button {
  background: var(--zuup-primary);
  color: white;
  border: none;
  padding: 1rem 2rem;
  font-size: 1.1rem;
  border-radius: 0.5rem;
  cursor: pointer;
  margin-top: 1rem;
  transition: all 0.3s ease;
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(230, 52, 98, 0.3);
}

#data-section {
  margin-top: 2rem;
  padding: 2rem;
  background: var(--zuup-card);
  border-radius: 0.5rem;
}

.hidden {
  display: none;
}

pre {
  background: var(--zuup-bg);
  padding: 1rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(230, 52, 98, 0.2);
  overflow-x: auto;
}
`
      },
      {
        path: "static/",
        fileName: "script.js",
        language: "javascript",
        content: `// Zuup Code Flask App JavaScript

async function fetchData() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();
        
        document.getElementById('api-response').textContent = JSON.stringify(data, null, 2);
        document.getElementById('data-section').classList.remove('hidden');
        
        console.log('API Response:', data);
    } catch (error) {
        console.error('Error fetching data:', error);
        document.getElementById('api-response').textContent = 'Error: ' + error.message;
        document.getElementById('data-section').classList.remove('hidden');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('Zuup Code Flask App Initialized!');
});
`
      },
      {
        path: "/",
        fileName: "requirements.txt",
        language: "text",
        content: `Flask==2.3.3
Werkzeug==2.3.7
Jinja2==3.1.2
`
      }
    ]
  },
  {
    id: "react-app",
    name: "React + Vite App",
    description: "Modern React application with Vite build tool",
    icon: "⚛️",
    mainFile: "src/App.jsx",
    files: [
      {
        path: "src/",
        fileName: "App.jsx",
        language: "javascript",
        content: `// React App - Zuup Code
import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setMessage('Welcome to Zuup Code React App!')
  }, [])

  return (
    <div className="App">
      <header className="App-header">
        <h1>🚀 Zuup Code React App</h1>
        <p>{message}</p>
        
        <div className="counter-section">
          <button onClick={() => setCount(count + 1)}>
            Count: {count}
          </button>
          <p>Click the button to increment the counter!</p>
        </div>
        
        <div className="features">
          <h2>Features:</h2>
          <ul>
            <li>⚡ Vite for fast development</li>
            <li>🎨 Modern CSS styling</li>
            <li>🔄 React state management</li>
            <li>📱 Responsive design</li>
          </ul>
        </div>
      </header>
    </div>
  )
}

export default App
`
      },
      {
        path: "src/",
        fileName: "main.jsx",
        language: "javascript",
        content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`
      },
      {
        path: "src/",
        fileName: "App.css",
        language: "css",
        content: `.App {
  text-align: center;
  background: #0f1019;
  min-height: 100vh;
  color: #e0e0e0;
}

.App-header {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

h1 {
  font-size: 3rem;
  color: #e63462;
  margin-bottom: 1rem;
}

.counter-section {
  margin: 2rem 0;
  padding: 2rem;
  background: #1a1b23;
  border-radius: 1rem;
  border: 1px solid rgba(230, 52, 98, 0.2);
}

button {
  background: #e63462;
  color: white;
  border: none;
  padding: 1rem 2rem;
  font-size: 1.2rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(230, 52, 98, 0.3);
}

.features {
  margin-top: 2rem;
  text-align: left;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.features ul {
  list-style: none;
  padding: 0;
}

.features li {
  padding: 0.5rem 0;
  font-size: 1.1rem;
}
`
      },
      {
        path: "src/",
        fileName: "index.css",
        language: "css",
        content: `:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  
  color-scheme: dark;
  color: #e0e0e0;
  background-color: #0f1019;
  
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
}

#root {
  width: 100%;
  margin: 0 auto;
}
`
      },
      {
        path: "/",
        fileName: "package.json",
        language: "json",
        content: `{
  "name": "zuup-react-app",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.8"
  }
}
`
      }
    ]
  },
  {
    id: "node-express",
    name: "Node.js Express API",
    description: "RESTful API server with Express.js",
    icon: "🟢",
    mainFile: "server.js",
    files: [
      {
        path: "/",
        fileName: "server.js",
        language: "javascript",
        content: `// Express Server - Zuup Code
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'success',
    message: 'Zuup Code Express API is running!',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/api/users', (req, res) => {
  const users = [
    { id: 1, name: 'Zuup Developer', role: 'Full Stack' },
    { id: 2, name: 'Code Explorer', role: 'Frontend' },
    { id: 3, name: 'API Builder', role: 'Backend' }
  ];
  res.json(users);
});

app.post('/api/users', (req, res) => {
  const { name, role } = req.body;
  const newUser = {
    id: Date.now(),
    name: name || 'Anonymous',
    role: role || 'Developer'
  };
  res.status(201).json(newUser);
});

// Start server
app.listen(PORT, () => {
  console.log(\`🚀 Zuup Code Express server running on port \${PORT}\`);
});
`
      },
      {
        path: "public/",
        fileName: "index.html",
        language: "html",
        content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zuup Code Express API</title>
    <style>
        body {
            font-family: 'Inter', sans-serif;
            background: #0f1019;
            color: #e0e0e0;
            margin: 0;
            padding: 2rem;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        h1 {
            color: #e63462;
            text-align: center;
        }
        .api-section {
            background: #1a1b23;
            padding: 2rem;
            border-radius: 1rem;
            margin: 1rem 0;
            border: 1px solid rgba(230, 52, 98, 0.2);
        }
        button {
            background: #e63462;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            cursor: pointer;
            margin: 0.5rem;
        }
        pre {
            background: #0f1019;
            padding: 1rem;
            border-radius: 0.5rem;
            overflow-x: auto;
            border: 1px solid rgba(230, 52, 98, 0.2);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🟢 Zuup Code Express API</h1>
        
        <div class="api-section">
            <h2>API Status</h2>
            <button onclick="checkStatus()">Check Status</button>
            <pre id="status-result"></pre>
        </div>
        
        <div class="api-section">
            <h2>Get Users</h2>
            <button onclick="getUsers()">Fetch Users</button>
            <pre id="users-result"></pre>
        </div>
        
        <div class="api-section">
            <h2>Add User</h2>
            <input type="text" id="name" placeholder="Name" style="padding: 0.5rem; margin: 0.25rem; border-radius: 0.25rem; border: 1px solid #ccc;">
            <input type="text" id="role" placeholder="Role" style="padding: 0.5rem; margin: 0.25rem; border-radius: 0.25rem; border: 1px solid #ccc;">
            <button onclick="addUser()">Add User</button>
            <pre id="add-result"></pre>
        </div>
    </div>
    
    <script>
        async function checkStatus() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                document.getElementById('status-result').textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                document.getElementById('status-result').textContent = 'Error: ' + error.message;
            }
        }
        
        async function getUsers() {
            try {
                const response = await fetch('/api/users');
                const data = await response.json();
                document.getElementById('users-result').textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                document.getElementById('users-result').textContent = 'Error: ' + error.message;
            }
        }
        
        async function addUser() {
            const name = document.getElementById('name').value;
            const role = document.getElementById('role').value;
            
            try {
                const response = await fetch('/api/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, role })
                });
                const data = await response.json();
                document.getElementById('add-result').textContent = JSON.stringify(data, null, 2);
                document.getElementById('name').value = '';
                document.getElementById('role').value = '';
            } catch (error) {
                document.getElementById('add-result').textContent = 'Error: ' + error.message;
            }
        }
    </script>
</body>
</html>
`
      },
      {
        path: "/",
        fileName: "package.json",
        language: "json",
        content: `{
  "name": "zuup-express-api",
  "version": "1.0.0",
  "description": "Express API server built with Zuup Code",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "keywords": ["express", "api", "node", "zuup"],
  "author": "Zuup Code"
}
`
      }
    ]
  }
];

export function getProjectTemplate(id: string): ProjectTemplate | undefined {
  return projectTemplates.find(template => template.id === id);
}