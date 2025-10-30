# Kash - Smart Budgeting with AI Predictions

Kash is a modern, intelligent budgeting application that helps you track your spending, manage budgets, and get AI-powered predictions to avoid overspending. Built with SvelteKit and Firebase for a fast, responsive experience.

> **Note**: This repository contains only the frontend code. The backend services and AI prediction models are kept private.

## 🚀 Features

- **Smart Budget Management**: Set budgets with overhead protection
- **AI Spending Predictions**: XGBOOST-powered forecasts
- **Multiple Data Entry Options**: 
  - Manual transaction entry
  - CSV file import
  - Real-time budget tracking
- **Firebase Integration**: Secure authentication and data storage
- **Responsive Design**: Works seamlessly on desktop and mobile

## 🛠 Tech Stack

- **Frontend**: SvelteKit (with pre-rendering for optimal performance)
- **Styling**: Bulma CSS + Custom CSS
- **Backend**: Firebase (Authentication & Firestore) - *Private*
- **Font**: Open Sans, Roboto/Arial

## 📁 Project Structure

```
src/
├── routes/
│   ├── +page.svelte              # Landing Page (Pre-rendered)
│   ├── Login/
│   │   └── +page.svelte          # Login Page
│   ├── Dashboard/
│   │   └── +page.svelte          # Dashboard (Pre-rendered)
│   └── Add-Data/
│       └── +page.svelte          # Add Data Page (Pre-rendered)
├── lib/
│   └── firebase/
│       └── firebase.js           # Firebase configuration
├── sections/
│   ├── Footer.svelte
│   └── (other components)
└── app.html
```

## 🎯 Pre-rendered Routes

The following routes are pre-rendered for optimal performance:

- `/` - Landing page
- `/Dashboard` - User dashboard  
- `/Add-Data` - Data entry page

These pages are resource-light and don't require heavy JavaScript, making them perfect for static generation.

## 🔐 Authentication & Data Flow

- **Firebase Authentication**: Google OAuth & Email/Password
- **Firestore Database**: User data stored in user-specific collections
- **Real-time Updates**: Live budget tracking and transaction history

## 💾 Data Models

### Transaction
```javascript
{
  userId: string,
  description: string,
  amount: number,
  category: string,
  type: 'income' | 'expense',
  date: Timestamp,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Budget
```javascript
{
  userId: string,
  name: string,
  amount: number,
  spent: number,
  overhead: number,
  createdAt: Timestamp
}
```

## 📊 Current Pages

### 1. Landing Page (`/`)
- Hero section with app overview
- Feature highlights
- Call-to-action for signup

### 2. Login Page (`/Login`)
- Email/password authentication
- Google OAuth integration
- Password reset functionality

### 3. Dashboard (`/Dashboard`)
- User profile with stats
- Recent transactions table
- Budget overview
- Navigation sidebar

### 4. Add Data (`/Add-Data`)
- **Manual Entry Form**: Description, amount, category, date, type
- **CSV Import**: Bulk transaction upload with validation
- Sample CSV template download

## 🚦 Getting Started

### Prerequisites
- Node.js 16+
- Firebase project with Authentication and Firestore enabled

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd kash
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Firebase**
   - Create a Firebase project
   - Enable Authentication (Email/Password & Google)
   - Enable Firestore Database
   - Update `src/lib/firebase/firebase.js` with your config

4. **Environment Variables**
   Create a `.env` file with your Firebase configuration:
   ```env
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   ```

5. **Development**
   ```bash
   npm run dev
   ```

6. **Build**
   ```bash
   npm run build
   ```

## 🎨 Design System

- **Colors**: Orange (#ff3e00), Dark Grey (#1a1a1a), Black (#000000)
- **Typography**: Roboto/Arial with Open Sans fallback
- **Components**: Built with Bulma CSS + custom overrides
- **Layout**: Responsive grid system

## 🔮 Upcoming Features

- [ ] Signup page completion
- [ ] Budget creation and management
- [ ] AI prediction integration
- [ ] Analytics and reporting
- [ ] Transaction categories management

## 🔒 Backend Services

The backend services including:
- Custom API endpoints
- AI/ML prediction models
- Advanced analytics processing
- Database administration tools

Are kept private for security and intellectual property protection.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

**Note**: Contributions are welcome for frontend improvements, UI/UX enhancements, and documentation.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- SvelteKit team for the amazing framework
- Bulma CSS for the responsive design system
- Firebase for backend services
- XGBOOST for machine learning capabilities

---

Built with ❤️ using SvelteKit and Firebase by Debaditya Malakar
